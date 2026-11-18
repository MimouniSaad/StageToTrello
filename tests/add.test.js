const test = require("node:test");
const assert = require("node:assert/strict");
global.Core = require("../extension/lib/core.js");
const AddOffer = require("../extension/lib/add.js");
const Quota = require("../extension/lib/quota.js");

const NOW = Date.UTC(2026, 10, 18, 12);
const RESET = Date.UTC(2026, 10, 19);
const config = { TRELLO_KEY: "K", RELAY_URL: "https://relay.test" };
const PAGE = { url: "https://exemple.fr/offre", meta: { title: "Stage DevOps", site: "Exemple" },
               text: "Description de l'offre. ".repeat(40), ldjson: [] };

function makeBrowser(stored = {}) {
  const store = { trelloToken: "TOK", ...stored };
  return {
    store,
    browser: {
      storage: { local: {
        get: async (k) => Object.fromEntries([].concat(k).filter((x) => x in store).map((x) => [x, store[x]])),
        set: async (o) => Object.assign(store, o),
        remove: async (k) => { delete store[k]; },
      } },
      tabs: { executeScript: async (id, { file }) => (file === "lib/page.js" ? [PAGE] : []) },
    },
  };
}

// Trello et relais simulés ; relay(body) renvoie [status, payload].
function makeFetch({ relay, boardLabels = [{ id: "lab1", name: "DevOps" }], trelloStatus = 200 }) {
  const calls = { cards: [], relay: 0 };
  const fetchFn = async (url, init = {}) => {
    url = String(url);
    if (url.startsWith("https://relay.test")) {
      calls.relay++;
      const [status, payload] = relay(JSON.parse(init.body));
      return new Response(JSON.stringify(payload), { status });
    }
    if (trelloStatus !== 200) return new Response("invalid token", { status: trelloStatus });
    if (url.includes("/labels")) return new Response(JSON.stringify(boardLabels));
    if (url.endsWith("/cards")) {
      calls.cards.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ id: "c1", shortUrl: "https://trello.com/c/abc" }));
    }
    if (url.includes("/attachments")) return new Response("{}");
    throw new Error(`URL inattendue ${url}`);
  };
  return { fetchFn, calls };
}

const run = (b, f, args = { tabId: 1, board: "b1", list: "l1" }) =>
  AddOffer.run(args, { browser: b.browser, config, fetchFn: f.fetchFn, now: () => NOW });

const ok = (content, used = 5) => () => [200, { ok: true, content, model: "m", used, limit: 40, resetAt: RESET }];

test("succès : carte créée avec le titre et les étiquettes, compteur synchronisé", async () => {
  const b = makeBrowser();
  const f = makeFetch({ relay: ok("FOUND: yes\nCOMPANY: Capgemini\nTITLE: Stagiaire DevOps\nLABELS: DevOps") });
  const r = await run(b, f);
  assert.deepEqual(r, { ok: true, name: "Capgemini - Stagiaire DevOps", card: "https://trello.com/c/abc" });
  assert.equal(f.calls.cards.length, 1);
  assert.equal(f.calls.cards[0].idLabels, "lab1");
  assert.deepEqual(b.store.usage, { day: "2026-11-18", count: 5, limit: 40 });
});

test("pas de jeton : unauthorized sans aucune requête", async () => {
  const b = makeBrowser();
  delete b.store.trelloToken;
  const f = makeFetch({ relay: ok("") });
  const r = await run(b, f);
  assert.equal(r.code, "unauthorized");
  assert.equal(f.calls.relay, 0);
});

test("tableau ou liste manquant : erreur claire", async () => {
  const r = await run(makeBrowser(), makeFetch({ relay: ok("") }), { tabId: 1, board: "b1", list: "" });
  assert.equal(r.code, "error");
  assert.match(r.error, /tableau et une liste/);
});

test("limite déjà connue localement : refus sans requête", async () => {
  const b = makeBrowser({ usage: Quota.fromServer({ used: 40, limit: 40, resetAt: RESET }) });
  const f = makeFetch({ relay: ok("") });
  const r = await run(b, f);
  assert.equal(r.code, "daily_limit");
  assert.match(r.error, /^Limite de 40 offres par jour atteinte\. Réinitialisation dans 12 h/);
  assert.equal(f.calls.relay, 0);
});

test("limite renvoyée par le relais : pas de carte, compteur recopié", async () => {
  const b = makeBrowser();
  const f = makeFetch({ relay: () => [429, { ok: false, code: "daily_limit", error: "Limite", used: 40, limit: 40, resetAt: RESET }] });
  const r = await run(b, f);
  assert.equal(r.code, "daily_limit");
  assert.equal(f.calls.cards.length, 0);
  assert.equal(b.store.usage.count, 40);
});

test("relais saturé, page sans JobPosting : aucune carte, message explicite", async () => {
  const f = makeFetch({ relay: () => [503, { ok: false, code: "groq_busy", error: "Saturé" }] });
  const r = await run(makeBrowser(), f);
  assert.deepEqual(r, { ok: false, code: "error",
    error: "Analyse indisponible et offre non détectée automatiquement, réessaie plus tard." });
  assert.equal(f.calls.cards.length, 0);
});

test("relais injoignable, page avec JobPosting : carte créée en mode de secours", async () => {
  const b = makeBrowser();
  const ld = JSON.stringify({ "@type": "JobPosting", title: "Stagiaire DevOps",
    hiringOrganization: { name: "Capgemini" }, description: "<p>Missions DevOps…</p>" });
  b.browser.tabs.executeScript = async (id, { file }) =>
    (file === "lib/page.js" ? [{ ...PAGE, ldjson: [ld] }] : []);
  const f = makeFetch({ relay: () => { throw new TypeError("NetworkError"); } });
  const r = await run(b, f);
  assert.equal(r.ok, true);
  assert.equal(r.name, "Capgemini - Stagiaire DevOps");
  assert.equal(f.calls.cards[0].idLabels, "lab1");   // « DevOps » trouvé par mots-clés
});

test("jeton refusé par le relais ou par Trello : jeton effacé", async () => {
  for (const f of [
    makeFetch({ relay: () => [401, { ok: false, code: "unauthorized", error: "Session expirée" }] }),
    makeFetch({ relay: ok(""), trelloStatus: 401 }),
  ]) {
    const b = makeBrowser();
    const r = await run(b, f);
    assert.equal(r.code, "unauthorized");
    assert.equal(r.error, "Session Trello expirée, reconnecte-toi.");
    assert.equal(b.store.trelloToken, undefined);
  }
});

test("page qui n'est pas une offre : pas de carte", async () => {
  const f = makeFetch({ relay: ok("FOUND: no") });
  const r = await run(makeBrowser(), f);
  assert.deepEqual(r, { ok: false, code: "error", error: "Aucune offre trouvée sur cette page." });
  assert.equal(f.calls.cards.length, 0);
});

test("page illisible : message clair", async () => {
  const b = makeBrowser();
  b.browser.tabs.executeScript = async () => { throw new Error("Missing host permission"); };
  const r = await run(b, makeFetch({ relay: ok("") }));
  assert.deepEqual(r, { ok: false, code: "error", error: "Impossible de lire cette page." });
});
