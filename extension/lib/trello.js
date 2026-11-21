// Client Trello : identifiants dans l'en-tête Authorization, erreurs lisibles.
const TrelloApi = (() => {
  const API = "https://api.trello.com/1";
  const MAX_DESC_CHARS = 16000; // la limite Trello est de 16 384

  class TrelloError extends Error {
    constructor(message, status) {
      super(message);
      this.name = "TrelloError";
      this.status = status;
    }
  }

  function makeTrello({ key, token, fetchFn = fetch }) {
    const auth = `OAuth oauth_consumer_key="${key}", oauth_token="${token}"`;

    async function request(method, path, params = {}) {
      let url = `${API}${path}`;
      const init = { method, headers: { Authorization: auth } };
      if (method === "GET") {
        const qs = new URLSearchParams(params).toString();
        if (qs) url += `?${qs}`;
      } else {
        init.headers["Content-Type"] = "application/json";
        init.body = JSON.stringify(params);
      }
      let r;
      try {
        r = await fetchFn(url, init);
      } catch {
        throw new TrelloError("Trello injoignable.", 0);
      }
      if (!r.ok) {
        const text = (await r.text()).trim().slice(0, 200);
        throw new TrelloError(`Erreur Trello ${r.status} : ${text}`, r.status);
      }
      return r.json();
    }

    async function listBoards() {
      const boards = await request("GET", "/members/me/boards", {
        fields: "name",
        filter: "open",
        lists: "open",
      });
      return boards.map((b) => ({
        id: b.id,
        name: b.name,
        lists: (b.lists || []).map((l) => ({ id: l.id, name: l.name })),
      }));
    }

    async function boardLabels(boardId) {
      const byName = {};
      for (const l of await request("GET", `/boards/${boardId}/labels`)) {
        if (l.name && !(l.name in byName)) byName[l.name] = l.id;
      }
      return byName;
    }

    async function createCard({ listId, name, desc, labelIds, url }) {
      const card = await request("POST", "/cards", {
        idList: listId,
        name,
        desc: desc.slice(0, MAX_DESC_CHARS),
        idLabels: labelIds.join(","),
      });
      try {
        await request("POST", `/cards/${card.id}/attachments`, { url });
      } catch (e) {
        // la carte existe déjà : on ne fait pas échouer l'ajout
        console.warn(`Lien non joint à la carte : ${e.message}`);
      }
      return { shortUrl: card.shortUrl };
    }

    return { request, listBoards, boardLabels, createCard };
  }

  return { TrelloError, makeTrello };
})();

if (typeof module === "object") module.exports = TrelloApi;
