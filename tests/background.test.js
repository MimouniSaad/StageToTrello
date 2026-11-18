const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ext = path.join(__dirname, "..", "extension");

// Charge background.js comme dans Firefox (scripts classiques partageant le même global).
function loadBackground({ authResult }) {
  const timers = new Map();
  let nextId = 1;
  const stored = {};
  const pings = [];
  let listener = null;
  const browser = {
    identity: {
      getRedirectURL: () => "https://abc.extensions.allizom.org/",
      launchWebAuthFlow: async () => {
        // Pendant le flux, l'intervalle de maintien doit être actif.
        for (const fn of timers.values()) fn();
        if (authResult instanceof Error) throw authResult;
        return authResult;
      },
    },
    runtime: {
      getPlatformInfo: async () => { pings.push(1); return {}; },
      onMessage: { addListener: (fn) => { listener = fn; } },
    },
    storage: { local: { set: async (o) => Object.assign(stored, o) } },
  };
  const ctx = vm.createContext({
    browser, URL, URLSearchParams, console,
    setInterval: (fn) => { const id = nextId++; timers.set(id, fn); return id; },
    clearInterval: (id) => timers.delete(id),
  });
  vm.runInContext('const CONFIG = { TRELLO_KEY: "K" };', ctx);
  vm.runInContext(fs.readFileSync(path.join(ext, "lib/markdown.js"), "utf8"), ctx);
  vm.runInContext(fs.readFileSync(path.join(ext, "lib/core.js"), "utf8"), ctx);
  vm.runInContext(fs.readFileSync(path.join(ext, "background.js"), "utf8"), ctx);
  return { send: (msg) => listener(msg), stored, pings, timers };
}

test("la connexion garde l'arrière-plan éveillé puis libère l'intervalle", async () => {
  const bg = loadBackground({ authResult: "https://abc.extensions.allizom.org/#token=T1" });
  const res = await bg.send({ type: "connect" });
  assert.equal(res.ok, true);
  assert.equal(bg.stored.trelloToken, "T1");
  assert.ok(bg.pings.length >= 1);
  assert.equal(bg.timers.size, 0);
});

test("une connexion annulée ne stocke rien et libère l'intervalle", async () => {
  const bg = loadBackground({ authResult: new Error("User cancelled or denied access.") });
  const res = await bg.send({ type: "connect" });
  assert.deepEqual({ ...res }, { ok: false, error: "Connexion Trello annulée." });
  assert.equal(bg.stored.trelloToken, undefined);
  assert.equal(bg.timers.size, 0);
});

// ---------- Ajout d'une offre ----------

// Charge background.js avec un AddOffer simulé dont on contrôle la fin.
function loadForAdd({ popupOpen = false } = {}) {
  const timers = new Map();
  let nextId = 1;
  let listener = null;
  const badges = [];
  const notifications = [];
  const broadcasts = [];
  const runs = [];
  const browser = {
    identity: { getRedirectURL: () => "" },
    runtime: {
      getPlatformInfo: async () => ({}),
      getURL: (p) => `moz-extension://x/${p}`,
      onMessage: { addListener: (fn) => { listener = fn; } },
      sendMessage: async (m) => { broadcasts.push(m); },
    },
    browserAction: {
      setBadgeText: ({ text }) => badges.push(text),
      setBadgeBackgroundColor: () => {},
    },
    extension: { getViews: () => (popupOpen ? [{}] : []) },
    notifications: {
      create: async (n) => { notifications.push(n); return "n1"; },
      onClicked: { addListener: () => {} },
    },
    tabs: { create: () => {} },
    storage: { local: { set: async () => {} } },
  };
  const ctx = vm.createContext({
    browser, URL, URLSearchParams, console,
    setInterval: (fn) => { const id = nextId++; timers.set(id, fn); return id; },
    clearInterval: (id) => timers.delete(id),
    setTimeout: () => 0, clearTimeout: () => {},
    AddOffer: {
      run: (args) => new Promise((resolve) => runs.push({ args, resolve })),
    },
  });
  vm.runInContext('const CONFIG = { TRELLO_KEY: "K", RELAY_URL: "https://relay.test" };', ctx);
  vm.runInContext(fs.readFileSync(path.join(ext, "lib/markdown.js"), "utf8"), ctx);
  vm.runInContext(fs.readFileSync(path.join(ext, "lib/core.js"), "utf8"), ctx);
  vm.runInContext(fs.readFileSync(path.join(ext, "background.js"), "utf8"), ctx);
  return { send: (msg) => listener(msg), timers, badges, notifications, broadcasts, runs };
}

const tick = () => new Promise((r) => setImmediate(r));

test("ajout : un seul à la fois, arrière-plan éveillé pendant le traitement", async () => {
  const bg = loadForAdd();
  const first = bg.send({ type: "add", tabId: 1, board: "b", list: "l" });
  await tick();
  assert.equal(bg.timers.size, 1);
  assert.deepEqual({ ...(await bg.send({ type: "status" })) }, { adding: true });
  const second = await bg.send({ type: "add", tabId: 1, board: "b", list: "l" });
  assert.equal(second.code, "busy");
  assert.equal(bg.runs.length, 1);
  bg.runs[0].resolve({ ok: true, name: "Capgemini - Stagiaire DevOps", card: "https://trello.com/c/abc" });
  const res = await first;
  assert.equal(res.ok, true);
  assert.equal(bg.timers.size, 0);
  assert.deepEqual({ ...(await bg.send({ type: "status" })) }, { adding: false });
});

test("ajout réussi, popup fermé : badge ✓, notification et message addDone", async () => {
  const bg = loadForAdd({ popupOpen: false });
  const p = bg.send({ type: "add", tabId: 1, board: "b", list: "l" });
  await tick();
  bg.runs[0].resolve({ ok: true, name: "Capgemini - Stagiaire DevOps", card: "https://trello.com/c/abc" });
  await p;
  assert.deepEqual(bg.badges, ["…", "✓"]);
  assert.equal(bg.notifications.length, 1);
  assert.equal(bg.notifications[0].title, "Carte créée");
  assert.equal(bg.notifications[0].message, "Capgemini - Stagiaire DevOps");
  assert.equal(bg.broadcasts[0].type, "addDone");
});

test("échec, popup ouvert : badge ✗ sans notification", async () => {
  const bg = loadForAdd({ popupOpen: true });
  const p = bg.send({ type: "add", tabId: 1, board: "b", list: "l" });
  await tick();
  bg.runs[0].resolve({ ok: false, code: "error", error: "Aucune offre trouvée sur cette page." });
  const res = await p;
  assert.equal(res.ok, false);
  assert.deepEqual(bg.badges, ["…", "✗"]);
  assert.equal(bg.notifications.length, 0);
});
