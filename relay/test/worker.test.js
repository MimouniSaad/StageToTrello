import test from "node:test";
import assert from "node:assert/strict";
import worker, { parseBody, dayKey, nextReset } from "../src/worker.js";

const TOKEN = "a".repeat(64);
const MEMBER = "member123";

function makeKV() {
  const store = new Map();
  return {
    store,
    async get(k) {
      return store.has(k) ? store.get(k) : null;
    },
    async put(k, v) {
      store.set(k, v);
    },
  };
}

function makeEnv(extra = {}) {
  return {
    USAGE: makeKV(),
    TRELLO_KEY: "K",
    GROQ_API_KEY: "G",
    GROQ_MODELS: "openai/gpt-oss-120b,openai/gpt-oss-20b",
    DAILY_LIMIT: "40",
    ...extra,
  };
}

const groqOk = (content = "FOUND: yes\nCOMPANY: Capgemini\nTITLE: Ingénieur GRC\nLABELS: Cloud") =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

// Remplace fetch : routes Trello et Groq, avec journal des appels.
function mockFetch({
  trello = () => new Response(JSON.stringify({ id: MEMBER }), { status: 200 }),
  groq = () => groqOk(),
} = {}) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).startsWith("https://api.trello.com")) return trello(url, init);
    if (String(url).startsWith("https://api.groq.com")) return groq(JSON.parse(init.body));
    throw new Error(`URL inattendue ${url}`);
  };
  return calls;
}

const body = {
  url: "https://exemple.fr/offre",
  title: "Offre",
  site: "Exemple",
  text: "Stage DevOps chez Capgemini…",
  labels: ["Cloud", "DevOps"],
};

function req(path, { method = "POST", token = TOKEN, payload = body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  return new Request(`https://relay.test${path}`, {
    method,
    headers,
    body: method === "POST" ? JSON.stringify(payload) : undefined,
  });
}

test("GET / répond ok, autres routes 404", async () => {
  mockFetch();
  const env = makeEnv();
  assert.equal((await worker.fetch(req("/", { method: "GET" }), env)).status, 200);
  assert.equal((await worker.fetch(req("/autre"), env)).status, 404);
  assert.equal((await worker.fetch(req("/extract", { method: "GET" }), env)).status, 404);
});

test("sans jeton ou jeton mal formé : 401 sans appel à Trello", async () => {
  const calls = mockFetch();
  const env = makeEnv();
  assert.equal((await worker.fetch(req("/extract", { token: null }), env)).status, 401);
  assert.equal((await worker.fetch(req("/extract", { token: "abc" }), env)).status, 401);
  assert.equal(calls.length, 0);
});

test("jeton refusé par Trello : 401", async () => {
  mockFetch({ trello: () => new Response("invalid token", { status: 401 }) });
  const r = await worker.fetch(req("/extract"), makeEnv());
  assert.equal(r.status, 401);
  assert.equal((await r.json()).code, "unauthorized");
});

test("Trello injoignable : 502", async () => {
  mockFetch({ trello: () => new Response("oops", { status: 503 }) });
  const r = await worker.fetch(req("/extract"), makeEnv());
  assert.equal(r.status, 502);
});

test("analyse réussie : contenu, modèle, compteur, et jeton jamais stocké en clair", async () => {
  const calls = mockFetch();
  const env = makeEnv();
  const r = await worker.fetch(req("/extract"), env);
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.equal(data.ok, true);
  assert.match(data.content, /^FOUND: yes/);
  assert.equal(data.model, "openai/gpt-oss-120b");
  assert.equal(data.used, 1);
  assert.equal(data.limit, 40);
  assert.equal(data.resetAt, nextReset(Date.now()));
  assert.equal(env.USAGE.store.get(`use:${MEMBER}:${dayKey(Date.now())}`), "1");
  for (const [k, v] of env.USAGE.store) {
    assert.ok(!k.includes(TOKEN) && !String(v).includes(TOKEN), "jeton stocké en clair");
  }
  // Le prompt est construit par le serveur avec les paramètres fixés
  const groqCall = calls.find((c) => c.url.startsWith("https://api.groq.com"));
  const sent = JSON.parse(groqCall.init.body);
  assert.equal(sent.max_tokens, 600);
  assert.equal(sent.temperature, 0);
  assert.equal(sent.reasoning_effort, "low");
  assert.match(sent.messages[0].content, /URL : https:\/\/exemple\.fr\/offre/);
  assert.match(sent.messages[0].content, /LABELS: 1 à 3 étiquettes parmi : Cloud, DevOps/);
  assert.equal(groqCall.init.headers.Authorization, "Bearer G");
});

test("le jeton vérifié est mis en cache : un seul appel à Trello pour deux analyses", async () => {
  const calls = mockFetch();
  const env = makeEnv();
  await worker.fetch(req("/extract"), env);
  await worker.fetch(req("/extract"), env);
  assert.equal(calls.filter((c) => c.url.startsWith("https://api.trello.com")).length, 1);
});

test("limite quotidienne : 429 avec resetAt, sans appel à Groq", async () => {
  const calls = mockFetch();
  const env = makeEnv({ DAILY_LIMIT: "2" });
  assert.equal((await worker.fetch(req("/extract"), env)).status, 200);
  assert.equal((await worker.fetch(req("/extract"), env)).status, 200);
  const before = calls.length;
  const r = await worker.fetch(req("/extract"), env);
  assert.equal(r.status, 429);
  const data = await r.json();
  assert.equal(data.code, "daily_limit");
  assert.equal(data.used, 2);
  assert.equal(data.resetAt, nextReset(Date.now()));
  assert.equal(
    calls.slice(before).filter((c) => c.url.startsWith("https://api.groq.com")).length,
    0,
  );
});

const groqMiss = () => groqOk("FOUND: no\nCOMPANY: \nTITLE: \nLABELS: ");
const useKey = () => `use:${MEMBER}:${dayKey(Date.now())}`;
const missKey = () => `miss:${MEMBER}:${dayKey(Date.now())}`;

test("page sans offre : réponse found false, compteur principal inchangé", async () => {
  mockFetch({ groq: groqMiss });
  const env = makeEnv();
  const data = await (await worker.fetch(req("/extract"), env)).json();
  assert.equal(data.ok, true);
  assert.equal(data.found, false);
  assert.equal(data.used, 0);
  assert.equal(env.USAGE.store.get(useKey()), undefined);
  assert.equal(env.USAGE.store.get(missKey()), "1");
});

test("offre trouvée : found true et compteur principal incrémenté", async () => {
  mockFetch();
  const env = makeEnv();
  const data = await (await worker.fetch(req("/extract"), env)).json();
  assert.equal(data.found, true);
  assert.equal(env.USAGE.store.get(useKey()), "1");
  assert.equal(env.USAGE.store.get(missKey()), undefined);
});

test("au-delà de FREE_MISSES, les pages sans offre comptent dans la limite", async () => {
  mockFetch({ groq: groqMiss });
  const env = makeEnv({ FREE_MISSES: "2", DAILY_LIMIT: "3" });
  for (let i = 0; i < 2; i++) {
    assert.equal((await (await worker.fetch(req("/extract"), env)).json()).used, 0);
  }
  const used = [];
  for (let i = 0; i < 3; i++)
    used.push((await (await worker.fetch(req("/extract"), env)).json()).used);
  assert.deepEqual(used, [1, 2, 3]);
  assert.equal(env.USAGE.store.get(missKey()), "2");
  // Limite atteinte : même une page sans offre est refusée, sans appel à Groq
  assert.equal((await worker.fetch(req("/extract"), env)).status, 429);
});

test("FREE_MISSES par défaut : 20 pages sans offre gratuites par jour", async () => {
  mockFetch({ groq: groqMiss });
  const env = makeEnv();
  env.USAGE.store.set(missKey(), "19");
  assert.equal((await (await worker.fetch(req("/extract"), env)).json()).used, 0);
  assert.equal((await (await worker.fetch(req("/extract"), env)).json()).used, 1);
});

test("le compteur d'hier n'est pas pris en compte", async () => {
  mockFetch();
  const env = makeEnv({ DAILY_LIMIT: "1" });
  const yesterday = dayKey(Date.now() - 24 * 3600 * 1000);
  env.USAGE.store.set(`use:${MEMBER}:${yesterday}`, "1");
  assert.equal((await worker.fetch(req("/extract"), env)).status, 200);
});

test("429 de Groq : passage au modèle suivant", async () => {
  mockFetch({
    groq: (b) =>
      b.model === "openai/gpt-oss-120b"
        ? new Response("rate limited", { status: 429, headers: { "retry-after": "7" } })
        : groqOk(),
  });
  const data = await (await worker.fetch(req("/extract"), makeEnv())).json();
  assert.equal(data.ok, true);
  assert.equal(data.model, "openai/gpt-oss-20b");
});

test("tous les modèles indisponibles : 503, retryAfter, et rien n'est compté", async () => {
  mockFetch({
    groq: () => new Response("busy", { status: 503, headers: { "retry-after": "12" } }),
  });
  const env = makeEnv();
  const r = await worker.fetch(req("/extract"), env);
  assert.equal(r.status, 503);
  const data = await r.json();
  assert.equal(data.code, "groq_busy");
  assert.equal(data.retryAfter, 12);
  assert.equal(env.USAGE.store.get(`use:${MEMBER}:${dayKey(Date.now())}`), undefined);
});

test("corps invalide : 400", async () => {
  mockFetch();
  const env = makeEnv();
  assert.equal(
    (
      await worker.fetch(
        req("/extract", { payload: { url: "file:///etc/passwd", text: "x" } }),
        env,
      )
    ).status,
    400,
  );
  assert.equal(
    (await worker.fetch(req("/extract", { payload: { url: "https://a.fr", text: "  " } }), env))
      .status,
    400,
  );
  const bad = new Request("https://relay.test/extract", {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: "pas du json",
  });
  assert.equal((await worker.fetch(bad, env)).status, 400);
});

test("parseBody borne les champs", () => {
  const p = parseBody({
    url: "https://a.fr/" + "x".repeat(5000),
    text: "t".repeat(20000),
    title: "T".repeat(1000),
    labels: Array(80).fill("L".repeat(100)).concat([3, ""]),
  });
  assert.equal(p.url.length, 2000);
  assert.equal(p.text.length, 10000);
  assert.equal(p.meta.title.length, 500);
  assert.equal(p.labels.length, 50);
  assert.equal(p.labels[0].length, 60);
});

test("les erreurs ne contiennent ni la clé Groq ni le jeton", async () => {
  mockFetch({ groq: () => new Response("busy", { status: 500 }) });
  const env = makeEnv({ GROQ_API_KEY: "gsk_secret_value" });
  const text = await (await worker.fetch(req("/extract"), env)).text();
  assert.ok(!text.includes("gsk_secret_value"));
  assert.ok(!text.includes(TOKEN));
});

// ---------- Cas d'erreur (couverture) ----------

test("Trello injoignable (erreur réseau) : 502", async () => {
  mockFetch({
    trello: () => {
      throw new TypeError("NetworkError");
    },
  });
  const r = await worker.fetch(req("/extract"), makeEnv());
  assert.equal(r.status, 502);
  assert.equal((await r.json()).code, "trello_unreachable");
});

test("Groq : erreur réseau, réponse 4xx ou JSON inutilisable → modèle suivant", async () => {
  const cases = [
    () => {
      throw new TypeError("NetworkError");
    },
    () => new Response("bad request", { status: 400 }),
    () => new Response("pas du json", { status: 200 }),
    () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "<think>…</think>" } }] }), {
        status: 200,
      }),
  ];
  const warn = console.warn;
  console.warn = () => {};
  try {
    for (const first of cases) {
      mockFetch({ groq: (b) => (b.model === "openai/gpt-oss-120b" ? first() : groqOk()) });
      const data = await (await worker.fetch(req("/extract"), makeEnv())).json();
      assert.equal(data.ok, true);
      assert.equal(data.model, "openai/gpt-oss-20b");
    }
  } finally {
    console.warn = warn;
  }
});

test("erreur inattendue : 500 générique, sans détail", async () => {
  mockFetch();
  const env = makeEnv();
  const get = env.USAGE.get;
  env.USAGE.get = async (k) => {
    // le compteur du jour devient illisible
    if (k.startsWith("use:")) throw new Error("KV indisponible : détail interne");
    return get(k);
  };
  const errorLog = console.error;
  console.error = () => {};
  try {
    const r = await worker.fetch(req("/extract"), env);
    assert.equal(r.status, 500);
    const text = await r.text();
    assert.match(text, /"code":"internal"/);
    assert.ok(!text.includes("détail interne"));
  } finally {
    console.error = errorLog;
  }
});
