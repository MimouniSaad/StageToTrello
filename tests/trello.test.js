const test = require("node:test");
const assert = require("node:assert/strict");
const { makeTrello, TrelloError } = require("../extension/lib/trello.js");

function reply(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    json: async () => (typeof body === "string" ? JSON.parse(body) : body),
  };
}

function fakeFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return responses.shift();
  };
  return { fn, calls };
}

test("les identifiants passent dans l'en-tête, jamais dans l'URL", async () => {
  const f = fakeFetch([reply(200, [])]);
  await makeTrello({ key: "KEYX", token: "TOKY", fetchFn: f.fn }).listBoards();
  const { url, init } = f.calls[0];
  assert.equal(init.headers.Authorization, 'OAuth oauth_consumer_key="KEYX", oauth_token="TOKY"');
  assert.ok(!url.includes("KEYX") && !url.includes("TOKY"));
  assert.ok(url.startsWith("https://api.trello.com/1/members/me/boards?"));
  const q = new URL(url).searchParams;
  assert.equal(q.get("fields"), "name");
  assert.equal(q.get("filter"), "open");
  assert.equal(q.get("lists"), "open");
});

test("une réponse 401 lève une TrelloError lisible", async () => {
  const f = fakeFetch([reply(401, "invalid token")]);
  const t = makeTrello({ key: "K", token: "T", fetchFn: f.fn });
  await assert.rejects(t.listBoards(), (e) => {
    assert.ok(e instanceof TrelloError);
    assert.equal(e.status, 401);
    assert.match(e.message, /401/);
    assert.match(e.message, /invalid token/);
    return true;
  });
});

test("une erreur réseau lève une TrelloError de statut 0", async () => {
  const t = makeTrello({
    key: "K",
    token: "T",
    fetchFn: async () => {
      throw new TypeError("x");
    },
  });
  await assert.rejects(t.listBoards(), (e) => e instanceof TrelloError && e.status === 0);
});

test("listBoards renvoie tableaux et listes", async () => {
  const f = fakeFetch([
    reply(200, [{ id: "b", name: "B", lists: [{ id: "l", name: "L", pos: 1 }] }]),
  ]);
  const boards = await makeTrello({ key: "K", token: "T", fetchFn: f.fn }).listBoards();
  assert.deepEqual(boards, [{ id: "b", name: "B", lists: [{ id: "l", name: "L" }] }]);
});

test("boardLabels garde la première étiquette de chaque nom", async () => {
  const f = fakeFetch([
    reply(200, [
      { id: "1", name: "Cloud" },
      { id: "2", name: "" },
      { id: "3", name: "Cloud" },
    ]),
  ]);
  const by = await makeTrello({ key: "K", token: "T", fetchFn: f.fn }).boardLabels("b");
  assert.deepEqual(by, { Cloud: "1" });
  assert.ok(f.calls[0].url.startsWith("https://api.trello.com/1/boards/b/labels"));
});

test("createCard envoie un corps JSON et tronque la description", async () => {
  const f = fakeFetch([
    reply(200, { id: "c1", shortUrl: "https://trello.com/c/x" }),
    reply(200, {}),
  ]);
  const r = await makeTrello({ key: "K", token: "T", fetchFn: f.fn }).createCard({
    listId: "l",
    name: "Acme - Dev",
    desc: "d".repeat(20000),
    labelIds: ["1", "2"],
    url: "https://o.fr",
  });
  assert.deepEqual(r, { shortUrl: "https://trello.com/c/x" });
  const [card, att] = f.calls;
  assert.equal(card.url, "https://api.trello.com/1/cards");
  assert.equal(card.init.method, "POST");
  assert.equal(card.init.headers["Content-Type"], "application/json");
  const body = JSON.parse(card.init.body);
  assert.equal(body.desc.length, 16000);
  assert.equal(body.idList, "l");
  assert.equal(body.name, "Acme - Dev");
  assert.equal(body.idLabels, "1,2");
  assert.equal(att.url, "https://api.trello.com/1/cards/c1/attachments");
  assert.deepEqual(JSON.parse(att.init.body), { url: "https://o.fr" });
});

test("createCard réussit même si la pièce jointe échoue", async () => {
  const f = fakeFetch([
    reply(200, { id: "c1", shortUrl: "https://trello.com/c/x" }),
    reply(500, "oops"),
  ]);
  const warn = console.warn;
  console.warn = () => {};
  try {
    const r = await makeTrello({ key: "K", token: "T", fetchFn: f.fn }).createCard({
      listId: "l",
      name: "n",
      desc: "d",
      labelIds: [],
      url: "https://o.fr",
    });
    assert.deepEqual(r, { shortUrl: "https://trello.com/c/x" });
  } finally {
    console.warn = warn;
  }
});
