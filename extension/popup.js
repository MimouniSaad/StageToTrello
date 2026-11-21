const $ = (id) => document.getElementById(id);
const PRIVACY_URL = "https://github.com/MimouniSaad/StageToTrello/blob/main/PRIVACY.md";
let boards = [];
let trello = null;
let quotaTimer = null;
let busy = false; // un ajout est en cours (lancé ici ou avant la réouverture du popup)

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
  $("quota-bar").style.width = `${Math.min(100, (st.used / st.limit) * 100)}%`;
  if (st.blocked) {
    el.className = "quota err";
    $("quota-text").textContent = Quota.blockedMessage(st, Date.now());
    $("add").disabled = true;
    quotaTimer = setTimeout(renderQuota, Math.min(20000, Math.max(1000, st.resetAt - Date.now())));
  } else {
    el.className = "quota";
    $("quota-text").textContent =
      `${st.remaining} offre${st.remaining > 1 ? "s" : ""} restante${st.remaining > 1 ? "s" : ""} aujourd'hui sur ${st.limit}`;
    $("add").disabled = busy;
  }
  return st;
}

// Bandeau d'état : l'icône (✓, !, ⏳) vient du style selon la classe ok / err / (info).
function setStatus(text, cls = "") {
  const el = $("status");
  el.className = cls;
  el.textContent = text.replace(/^[✓✗]\s*/, "");
}

function show(screen) {
  $("login").hidden = screen !== "login";
  $("main").hidden = screen !== "main";
  $("logout").hidden = screen !== "main";
}

function configError() {
  return typeof CONFIG === "undefined" || !CONFIG.TRELLO_KEY || !CONFIG.RELAY_URL
    ? "config.js manquant ou incomplet : voir le README."
    : null;
}

async function logout(message = "") {
  await browser.storage.local.remove("trelloToken");
  trello = null;
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

// Affiche le résultat d'un ajout fait par le script d'arrière-plan.
async function showResult(result) {
  if (!result) return;
  if (result.code === "busy") {
    // un ajout précédent continue : on attendra « addDone »
    busy = true;
    $("add").disabled = true;
    return setStatus("Un ajout est déjà en cours…");
  }
  busy = false;
  if (result.ok) setStatus(`✓ ${result.name}`, "ok");
  else if (result.code === "unauthorized") await logout(result.error);
  else if (result.code === "daily_limit")
    setStatus(""); // le message s'affiche sous le bouton
  else setStatus(`✗ ${result.error}`, "err");
  await renderQuota();
}

// L'ajout tourne dans le script d'arrière-plan : fermer le popup ne l'interrompt pas.
async function add() {
  if (busy) return;
  const board = $("board").value;
  const list = $("list").value;
  if (!board || !list) return setStatus("✗ Choisis un tableau et une liste.", "err");
  if ((await quotaStatus()).blocked) return renderQuota(); // limite déjà connue
  busy = true;
  $("add").disabled = true;
  setStatus("Création de la carte…");
  let result;
  try {
    await browser.storage.local.set({ target: { board, list }, auto: $("auto").checked });
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    result = await browser.runtime.sendMessage({ type: "add", tabId: tab.id, board, list });
  } catch (e) {
    result = { ok: false, code: "error", error: e.message };
  }
  await showResult(result);
}

// Fin d'un ajout lancé avant la réouverture du popup.
browser.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "addDone" && busy) showResult(msg.result);
});

async function init() {
  const err = configError();
  if (err) {
    show("login");
    return setStatus(`✗ ${err}`, "err");
  }
  const { trelloToken } = await browser.storage.local.get("trelloToken");
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

    if (!target.list) {
      // première utilisation : liste par défaut
      const def = board.lists.find((l) => l.name === CONFIG.DEFAULT_LIST);
      if (def) $("list").value = def.id;
    }
    $("auto").checked = !!saved.auto;
    setStatus("");
    const { adding } = (await browser.runtime.sendMessage({ type: "status" })) || {};
    if (adding) {
      // ajout lancé juste avant la réouverture du popup
      busy = true;
      setStatus("Création de la carte…");
    }
    const st = await renderQuota();

    if (saved.auto && target.list && !st.blocked && !adding) add();
  } catch (e) {
    await fail(e);
  }
}

$("connect").addEventListener("click", connect);
$("logout").addEventListener("click", (e) => {
  e.preventDefault();
  logout();
});
for (const link of document.querySelectorAll(".privacy")) {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    browser.tabs.create({ url: PRIVACY_URL });
    window.close();
  });
}
$("board").addEventListener("change", () => fillLists($("board").value));
$("auto").addEventListener("change", () => browser.storage.local.set({ auto: $("auto").checked }));
$("add").addEventListener("click", add);
init();
