// Ajout d'une offre, exécuté par le script d'arrière-plan : lecture de la page,
// analyse via le relais (ou mode de secours), création de la carte Trello.
// Renvoie { ok: true, name, card } ou { ok: false, code, error }
// avec code = "unauthorized" | "daily_limit" | "error".
const AddOffer = (() => {
  const C = typeof Core !== "undefined" ? Core : require("./core.js");
  const R = typeof Relay !== "undefined" ? Relay : require("./relay.js");
  const T = typeof TrelloApi !== "undefined" ? TrelloApi : require("./trello.js");
  const Q = typeof Quota !== "undefined" ? Quota : require("./quota.js");

  async function readPage(browser, tabId) {
    try {
      await browser.tabs.executeScript(tabId, { file: "lib/Readability.js" });
      const [page] = await browser.tabs.executeScript(tabId, { file: "lib/page.js" });
      if (!page) throw new Error("vide");
      return page;
    } catch {
      throw new Error("Impossible de lire cette page.");
    }
  }

  async function run({ tabId, board, list }, { browser, config, fetchFn, now = Date.now }) {
    const store = browser.storage.local;
    const limitReached = async () => {
      const { [Q.STORAGE_KEY]: usage } = await store.get(Q.STORAGE_KEY);
      const st = Q.status(usage, now());
      return st.blocked
        ? { ok: false, code: "daily_limit", error: Q.blockedMessage(st, now()) }
        : null;
    };
    const syncQuota = async (usage) => {
      if (usage) await store.set({ [Q.STORAGE_KEY]: Q.fromServer(usage) });
    };

    const { trelloToken: token } = await store.get("trelloToken");
    if (!token) return { ok: false, code: "unauthorized", error: "Connecte ton compte Trello." };
    if (!board || !list)
      return { ok: false, code: "error", error: "Choisis un tableau et une liste." };
    const blocked = await limitReached(); // limite déjà connue : pas de requête inutile
    if (blocked) return blocked;

    try {
      const page = await readPage(browser, tabId);
      const jp = C.parseJobPosting(page.ldjson);
      const trello = T.makeTrello({ key: config.TRELLO_KEY, token, fetchFn });
      const byName = await trello.boardLabels(board);
      const labelNames = Object.keys(byName);

      let raw;
      if (C.hasFullJobPosting(jp)) {
        // Entreprise et intitulé déjà publiés par la page : pas d'appel à l'IA, pas de quota consommé.
        raw = C.fromJobPosting(page.url, page.meta, page.text, jp, labelNames);
      } else
        try {
          raw = await R.extract(page, labelNames, { relayUrl: config.RELAY_URL, token, fetchFn });
          await syncQuota(raw.usage);
        } catch (e) {
          if (!(e instanceof R.RelayError)) throw e;
          if (e.status === 401) throw new T.TrelloError(e.message, 401);
          if (e.code === "daily_limit") {
            await syncQuota(R.usageOf(e.data));
            return (await limitReached()) || { ok: false, code: "daily_limit", error: e.message };
          }
          console.warn(`Analyse indisponible (${e.message}), mode de secours.`);
          raw = C.heuristicExtract(page.url, page.meta, page.text, jp, labelNames);
        }

      const info = C.finalizeInfo(page.url, page.meta, page.text, jp, raw, page.html);
      if (!info.found) {
        return {
          ok: false,
          code: "error",
          error: raw.fallback
            ? "Analyse indisponible et offre non détectée automatiquement, réessaie plus tard."
            : "Aucune offre trouvée sur cette page.",
        };
      }

      const name = C.cardName(info);
      const card = await trello.createCard({
        listId: list,
        name,
        desc: info.desc,
        url: page.url,
        labelIds: info.labels.filter((l) => l in byName).map((l) => byName[l]),
      });
      return { ok: true, name, card: card.shortUrl };
    } catch (e) {
      if (e instanceof T.TrelloError && e.status === 401) {
        await store.remove("trelloToken");
        return {
          ok: false,
          code: "unauthorized",
          error: "Session Trello expirée, reconnecte-toi.",
        };
      }
      return { ok: false, code: "error", error: e.message };
    }
  }

  return { run };
})();

if (typeof module === "object") module.exports = AddOffer;
