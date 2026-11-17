cat > popup.js <<'EOF'
const SERVER = "http://127.0.0.1:8765";
const $ = (id) => document.getElementById(id);
let boards = [];

function setStatus(text, cls = "") {
  const el = $("status");
  el.className = cls;
  el.textContent = text;
}

async function api(path, options = {}) {
  const { token } = await browser.storage.local.get("token");
  if (!token) {
    browser.runtime.openOptionsPage();
    throw new Error("Token manquant : colle-le dans les réglages de l'extension.");
  }
  const r = await fetch(SERVER + path, {
    ...options,
    headers: { "Content-Type": "application/json", "X-Token": token },
  });
  const data = await r.json();
  if (!r.ok || data.ok === false) throw new Error(data.error || r.statusText);
  return data;
}

function fillLists(boardId, selectedListId) {
  const board = boards.find((b) => b.id === boardId);
  const lists = board ? board.lists : [];
  $("list").replaceChildren(...lists.map((l) => new Option(l.name, l.id)));
  if (selectedListId && lists.some((l) => l.id === selectedListId)) {
    $("list").value = selectedListId;
  }
}

async function add() {
  $("add").disabled = true;
  setStatus("Création de la carte…");
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    let html = null;
    try {
      const res = await browser.tabs.executeScript(tab.id, {
        code: "document.documentElement.outerHTML",
      });
      html = res && res[0];
    } catch (e) { /* page protégée : le serveur téléchargera lui-même */ }

    const board = $("board").value;
    const list = $("list").value;
    await browser.storage.local.set({ target: { board, list }, auto: $("auto").checked });

    const data = await api("/add", {
      method: "POST",
      body: JSON.stringify({ url: tab.url, html, board, list }),
    });
    setStatus(`✓ ${data.name}`, "ok");
  } catch (e) {
    setStatus(`✗ ${e.message}`, "err");
  } finally {
    $("add").disabled = false;
  }
}

async function init() {
  try {
    setStatus("Chargement des tableaux…");
    const data = await api("/boards");
    boards = data.boards;
    const saved = await browser.storage.local.get(["target", "auto"]);
    const target = saved.target || {};

    $("board").replaceChildren(...boards.map((b) => new Option(b.name, b.id)));
    const board =
      boards.find((b) => b.id === target.board) ||
      boards.find((b) => b.id === data.defaultBoard) ||
      boards[0];
    if (!board) throw new Error("Aucun tableau Trello trouvé.");
    $("board").value = board.id;
    fillLists(board.id, target.list);

    if (!target.list) {  // première utilisation : liste par défaut du serveur
      const def = board.lists.find((l) => l.name === data.defaultList);
      if (def) $("list").value = def.id;
    }
    $("auto").checked = !!saved.auto;
    setStatus("");

    if (saved.auto && target.list) add();
  } catch (e) {
    setStatus(`✗ ${e.message}`, "err");
  }
}

$("board").addEventListener("change", () => fillLists($("board").value));
$("auto").addEventListener("change", () => browser.storage.local.set({ auto: $("auto").checked }));
$("add").addEventListener("click", add);
init();
EOF
