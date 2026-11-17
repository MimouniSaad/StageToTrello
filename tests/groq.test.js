const test = require("node:test");
const assert = require("node:assert/strict");
const Groq = require("../extension/lib/groq.js");

function reply(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    json: async () => (typeof body === "string" ? JSON.parse(body) : body),
  };
}

function fakeFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    const r = responses.shift();
    if (r instanceof Error) throw r;
    return r;
  };
  return { fn, calls };
}

const ok = (content) => reply(200, { choices: [{ message: { content } }] });

test("callGroq passe au modèle suivant sur 503 sans attendre", async () => {
  const f = fakeFetch([reply(503, "busy"), ok("FOUND: yes")]);
  const sleeps = [];
  const out = await Groq.callGroq("p", {
    apiKey: "KEY", models: ["openai/gpt-oss-120b", "llama-3.3-70b-versatile"],
    fetchFn: f.fn, sleep: async (ms) => sleeps.push(ms),
  });
  assert.equal(out, "FOUND: yes");
  assert.equal(f.calls.length, 2);
  assert.deepEqual(sleeps, []);
});

test("callGroq envoie les bons paramètres", async () => {
  const f = fakeFetch([reply(503, "busy"), ok("FOUND: yes")]);
  await Groq.callGroq("p", {
    apiKey: "KEY", models: ["openai/gpt-oss-120b", "llama-3.3-70b-versatile"],
    fetchFn: f.fn, sleep: async () => {},
  });
  const [a, b] = f.calls;
  assert.equal(a.url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(a.init.headers.Authorization, "Bearer KEY");
  assert.equal(a.body.model, "openai/gpt-oss-120b");
  assert.equal(a.body.reasoning_effort, "low");
  assert.equal(a.body.temperature, 0);
  assert.equal(a.body.max_tokens, 600);
  assert.deepEqual(a.body.messages, [{ role: "user", content: "p" }]);
  assert.equal("reasoning_effort" in b.body, false);
});

test("callGroq abandonne après 3 tours sans attendre après le dernier", async () => {
  const f = fakeFetch(Array.from({ length: 6 }, () => reply(429, "rate", { "retry-after": "60" })));
  const sleeps = [];
  await assert.rejects(
    Groq.callGroq("p", { apiKey: "K", models: ["a", "b"], fetchFn: f.fn, sleep: async (ms) => sleeps.push(ms) }),
    /^Error: Erreur API Groq/,
  );
  assert.equal(f.calls.length, 6);
  assert.deepEqual(sleeps, [30000, 30000]);
});

test("callGroq accepte moins de tours et une attente plus courte", async () => {
  const f = fakeFetch(Array.from({ length: 4 }, () => reply(429, "rate", { "retry-after": "60" })));
  const sleeps = [];
  await assert.rejects(
    Groq.callGroq("p", { apiKey: "K", models: ["a", "b"], fetchFn: f.fn,
                         sleep: async (ms) => sleeps.push(ms), rounds: 2, maxWaitS: 10 }),
    /^Error: Erreur API Groq/,
  );
  assert.equal(f.calls.length, 4);
  assert.deepEqual(sleeps, [10000]);
});

test("callGroq ignore les erreurs réseau et les réponses vides", async () => {
  const f = fakeFetch([new TypeError("NetworkError"), ok("<think>hm</think>  "), ok("FOUND: yes")]);
  const out = await Groq.callGroq("p", { apiKey: "K", models: ["a", "b"], fetchFn: f.fn, sleep: async () => {} });
  assert.equal(out, "FOUND: yes");
  assert.equal(f.calls.length, 3);
});

test("llmExtract renvoie les champs lus dans la réponse", async () => {
  const f = fakeFetch([ok("FOUND: yes\nCOMPANY: Acme\nTITLE: Dev\nLABELS: Cloud")]);
  const r = await Groq.llmExtract("https://a.fr", { title: "", site: "" }, "texte", ["Cloud"], {
    apiKey: "K", models: ["a"], fetchFn: f.fn, sleep: async () => {},
  });
  assert.deepEqual(r, { found: true, company: "Acme", title: "Dev", labels: ["Cloud"] });
});
