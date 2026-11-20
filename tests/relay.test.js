const test = require("node:test");
const assert = require("node:assert/strict");
global.Core = require("../extension/lib/core.js");
const Relay = require("../extension/lib/relay.js");

const page = {
  url: "https://exemple.fr/offre",
  meta: { title: "Offre", site: "Exemple" },
  text: "t".repeat(15000),
};
const opts = (fetchFn) => ({ relayUrl: "https://relay.test/", token: "TOK", fetchFn });
const reply = (status, payload) => async () => new Response(JSON.stringify(payload), { status });

test("extract : requête vers /extract avec le jeton, texte borné, étiquettes", async () => {
  let call;
  const fetchFn = async (url, init) => {
    call = { url, init };
    return new Response(
      JSON.stringify({
        ok: true,
        model: "m",
        content: "FOUND: yes\nCOMPANY: Capgemini\nTITLE: Stagiaire DevOps\nLABELS: DevOps, Inconnu",
        used: 3,
        limit: 40,
        resetAt: Date.UTC(2026, 10, 19),
      }),
      { status: 200 },
    );
  };
  const r = await Relay.extract(page, ["DevOps", "Cloud"], opts(fetchFn));
  assert.equal(call.url, "https://relay.test/extract");
  assert.equal(call.init.method, "POST");
  assert.equal(call.init.headers.Authorization, "Bearer TOK");
  const body = JSON.parse(call.init.body);
  assert.equal(body.text.length, Core.MAX_PROMPT_CHARS);
  assert.deepEqual(body.labels, ["DevOps", "Cloud"]);
  assert.equal(body.title, "Offre");
  assert.equal(r.found, true);
  assert.equal(r.company, "Capgemini");
  assert.equal(r.title, "Stagiaire DevOps");
  assert.deepEqual(r.labels, ["DevOps"]);
  assert.deepEqual(r.usage, { used: 3, limit: 40, resetAt: Date.UTC(2026, 10, 19) });
});

test("extract : 401 du relais", async () => {
  await assert.rejects(
    Relay.extract(
      page,
      [],
      opts(reply(401, { ok: false, code: "unauthorized", error: "Session Trello expirée." })),
    ),
    (e) => e instanceof Relay.RelayError && e.status === 401 && e.code === "unauthorized",
  );
});

test("extract : limite quotidienne avec le compteur", async () => {
  const resetAt = Date.UTC(2026, 10, 19);
  await assert.rejects(
    Relay.extract(
      page,
      [],
      opts(
        reply(429, {
          ok: false,
          code: "daily_limit",
          error: "Limite",
          used: 40,
          limit: 40,
          resetAt,
        }),
      ),
    ),
    (e) =>
      e.code === "daily_limit" &&
      Relay.usageOf(e.data).used === 40 &&
      Relay.usageOf(e.data).resetAt === resetAt,
  );
});

test("extract : relais saturé, réponse non JSON ou injoignable", async () => {
  await assert.rejects(
    Relay.extract(page, [], opts(reply(503, { ok: false, code: "groq_busy", error: "Saturé" }))),
    (e) => e.status === 503 && e.code === "groq_busy",
  );
  await assert.rejects(
    Relay.extract(
      page,
      [],
      opts(async () => new Response("<html>", { status: 502 })),
    ),
    (e) => e.status === 502 && /502/.test(e.message),
  );
  await assert.rejects(
    Relay.extract(
      page,
      [],
      opts(async () => {
        throw new TypeError("NetworkError");
      }),
    ),
    (e) => e.status === 0 && e.code === "unreachable",
  );
});

test("usageOf ignore une réponse sans compteur", () => {
  assert.equal(Relay.usageOf({ ok: true }), null);
  assert.equal(Relay.usageOf(null), null);
});
