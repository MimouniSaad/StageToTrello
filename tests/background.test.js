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
