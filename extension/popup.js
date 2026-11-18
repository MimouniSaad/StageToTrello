const $ = (id) => document.getElementById(id);
let boards = [];
let trello = null;
let trelloToken = null;
let quotaTimer = null;
let busy = false;

async function quotaStatus() {
  const { [Quota.STORAGE_KEY]: usage } = await browser.storage.local.get(Quota.STORAGE_KEY);
  return Quota.status(usage, Date.now());
}

// Affiche le compteur du jour ; si la limite est atteinte, bloque le bouton et affiche
// le temps restant avant la réinitialisation (rafraîchi toutes les 20 s).
async function renderQuota() {
  const st = await quotaStatus();
  const el = $("quota");
  clearTimeout(quotaTimer);
  if (st.blocked) {
    el.className = "err";
    el.textContent = Quota.blockedMessage(st, Date.now());
    $("add").disabled = true;
    quotaTimer = setTimeout(renderQuota, Math.min(20000, Math.max(1000, st.resetAt - Date.now())));
  } else {
    el.className = "";
    el.textContent = `${st.remaining} offre${st.remaining > 1 ? "s" : ""} restante${st.remaining > 1 ? "s" : ""} aujourd'hui sur ${st.limit}.`;
    $("add").disabled = busy;
  }
  return st;
}

// Recopie le compteur du relais, qui fait foi (par compte Trello).
async function syncQuota(usage) {
  if (usage) await browser.storage.local.set({ [Quota.STORAGE_KEY]: Quota.fromServer(usage) });
}

// Levée quand le relais refuse l'analyse pour cause de limite quotidienne.
class QuotaReached extends Error {}

function setStatus(text, cls = "") {
  const el = $("status");
  el.className = cls;
  el.textContent = text;
}

function show(screen) {
  $("login").hidden = screen !== "login";
  $("main").hidden = screen !== "main";
}

function configError() {
  return typeof CONFIG === "undefined" || !CONFIG.TRELLO_KEY || !CONFIG.RELAY_URL
    ? "config.js manquant ou incomplet : voir le README." : null;
}

async function logout(message = "") {
  await browser.storage.local.remove("trelloToken");
  trello = null;
  trelloToken = null;
  show("login");
  setStatus(message, message ? "err" : "");
}

// Erreur commune : un 401 de Trello veut dire que le jeton n'est plus valable.
async function fail(e) {
  if (e instanceof TrelloApi.TrelloError && e.status === 401) {
    await logout("Session Trello expirée, reconnecte-toi.");
  } else {
    setStatus(`✗ ${e.message}`, "err");
  }
}

async function connect() {
  const err = configError();
  if (err) return setStatus(`✗ ${err}`, "err");
  $("connect").disabled = true;
  setStatus("Autorise l'accès dans la fenêtre Trello, puis rouvre ce popup.");
  try {
    // Le popup peut se fermer pendant l'autorisation : le script d'arrière-plan s'en charge.
    const res = await browser.runtime.sendMessage({ type: "connect" });
    if (!res || !res.ok) return setStatus((res && res.error) || "Connexion Trello annulée.", "err");
    await init();
  } finally {
    $("connect").disabled = false;
  }
}

function fillLists(boardId, selectedListId) {
  const board = boards.find((b) => b.id === boardId);
  const lists = board ? board.lists : [];
  $("list").replaceChildren(...lists.map((l) => new Option(l.name, l.id)));
  if (selectedListId && lists.some((l) => l.id === selectedListId)) {
    $("list").value = selectedListId;
  }
}

async function readPage(tabId) {
  try {
    await browser.tabs.executeScript(tabId, { file: "lib/Readability.js" });
    const [page] = await browser.tabs.executeScript(tabId, { file: "lib/page.js" });
    if (!page) throw new Error("vide");
    return page;
  } catch (e) {
    throw new Error("Impossible de lire cette page.");
  }
}

// Analyse par IA via le relais ; mode de secours si le relais est saturé ou injoignable.
async function extractInfo(page, labelNames, jp) {
  try {
    const res = await Relay.extract(page, labelNames,
                                    { relayUrl: CONFIG.RELAY_URL, token: trelloToken });
    await syncQuota(res.usage);
    return res;
  } catch (e) {
    if (e instanceof Relay.RelayError) {
      if (e.status === 401) throw new TrelloApi.TrelloError(e.message, 401);
      if (e.code === "daily_limit") {
        await syncQuota(Relay.usageOf(e.data));
        throw new QuotaReached(e.message);
      }
    }
    console.warn(`Analyse indisponible (${e.message}), mode de secours.`);
  }
  return Core.heuristicExtract(page.url, page.meta, page.text, jp, labelNames);
}

async function add() {
  if (busy) return;
  busy = true;
  $("add").disabled = true;
  setStatus("Création de la carte…");
  try {
    const board = $("board").value;
    const list = $("list").value;
    if (!board || !list) throw new Error("Choisis un tableau et une liste.");
    await browser.storage.local.set({ target: { board, list }, auto: $("auto").checked });

    if ((await quotaStatus()).blocked) {  // limite déjà connue : pas de requête inutile
      setStatus("");
      return;
    }
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const page = await readPage(tab.id);
    const jp = Core.parseJobPosting(page.ldjson);
    const byName = await trello.boardLabels(board);
    const raw = await extractInfo(page, Object.keys(byName), jp);
    const info = Core.finalizeInfo(page.url, page.meta, page.text, jp, raw);
    if (!info.found) throw new Error("Aucune offre trouvée sur cette page.");

    const name = Core.cardName(info);
    await trello.createCard({
      listId: list, name, desc: info.desc, url: page.url,
      labelIds: info.labels.filter((l) => l in byName).map((l) => byName[l]),
    });
    setStatus(`✓ ${name}`, "ok");
  } catch (e) {
    if (e instanceof QuotaReached) setStatus("");  // le message de limite s'affiche sous le bouton
    else await fail(e);
  } finally {
    busy = false;
    await renderQuota();
  }
}

async function init() {
  const err = configError();
  if (err) {
    show("login");
    return setStatus(`✗ ${err}`, "err");
  }
  ({ trelloToken } = await browser.storage.local.get("trelloToken"));
  if (!trelloToken) {
    show("login");
    return setStatus("");
  }
  trello = TrelloApi.makeTrello({ key: CONFIG.TRELLO_KEY, token: trelloToken });
  show("main");
  try {
    setStatus("Chargement des tableaux…");
    boards = await trello.listBoards();
    const saved = await browser.storage.local.get(["target", "auto"]);
    const target = saved.target || {};

    $("board").replaceChildren(...boards.map((b) => new Option(b.name, b.id)));
    const board = boards.find((b) => b.id === target.board) || boards[0];
    if (!board) throw new Error("Aucun tableau Trello trouvé.");
    $("board").value = board.id;
    fillLists(board.id, target.list);

    if (!target.list) {  // première utilisation : liste par défaut
      const def = board.lists.find((l) => l.name === CONFIG.DEFAULT_LIST);
      if (def) $("list").value = def.id;
    }
    $("auto").checked = !!saved.auto;
    setStatus("");
    const st = await renderQuota();

    if (saved.auto && target.list && !st.blocked) add();
  } catch (e) {
    await fail(e);
  }
}

$("connect").addEventListener("click", connect);
$("logout").addEventListener("click", (e) => { e.preventDefault(); logout(); });
$("board").addEventListener("change", () => fillLists($("board").value));
$("auto").addEventListener("change", () => browser.storage.local.set({ auto: $("auto").checked }));
$("add").addEventListener("click", add);
init();
