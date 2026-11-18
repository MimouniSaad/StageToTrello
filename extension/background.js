// La connexion Trello tourne ici et non dans le popup : Firefox ferme le popup
// dès que la fenêtre d'autorisation s'ouvre, ce qui interromprait le flux.
async function connectTrello() {
  if (typeof CONFIG === "undefined" || !CONFIG.TRELLO_KEY) {
    return { ok: false, error: "config.js manquant : voir le README." };
  }
  // Une page d'arrière-plan non persistante peut être suspendue après ~30 s d'inactivité :
  // un appel d'API régulier la garde éveillée pendant que l'utilisateur se connecte.
  const keepAlive = setInterval(() => browser.runtime.getPlatformInfo(), 20000);
  let redirect;
  try {
    redirect = await browser.identity.launchWebAuthFlow({
      url: Core.authorizeUrl(CONFIG.TRELLO_KEY, browser.identity.getRedirectURL()),
      interactive: true,
    });
  } catch (e) {
    return { ok: false, error: "Connexion Trello annulée." };
  } finally {
    clearInterval(keepAlive);
  }
  const token = Core.tokenFromRedirect(redirect);
  if (!token) return { ok: false, error: "Connexion Trello annulée." };
  await browser.storage.local.set({ trelloToken: token });
  return { ok: true };
}

// ---------- Ajout d'une offre ----------
// L'ajout tourne ici et non dans le popup : Firefox ferme le popup dès que l'utilisateur
// clique ailleurs, ce qui interromprait l'analyse ou la création de la carte.
let adding = false;
let badgeTimer = null;
const cardLinks = new Map();   // notification → lien de la carte

function setBadge(text, color) {
  clearTimeout(badgeTimer);
  browser.browserAction.setBadgeText({ text });
  if (color) browser.browserAction.setBadgeBackgroundColor({ color });
  if (text && text !== "…") badgeTimer = setTimeout(() => setBadge("", null), 8000);
}

// Notification seulement si le popup est fermé : sinon le résultat s'y affiche déjà.
async function notify(result) {
  if (browser.extension.getViews({ type: "popup" }).length) return;
  const id = await browser.notifications.create({
    type: "basic",
    iconUrl: browser.runtime.getURL("icons/icon-96.png"),
    title: result.ok ? "Carte créée" : "StageToTrello",
    message: result.ok ? result.name : result.error,
  });
  if (result.ok && result.card) cardLinks.set(id, result.card);
}

async function addOffer({ tabId, board, list }) {
  if (adding) return { ok: false, code: "busy", error: "Un ajout est déjà en cours." };
  adding = true;
  const keepAlive = setInterval(() => browser.runtime.getPlatformInfo(), 20000);
  setBadge("…", "#6B7280");
  let result;
  try {
    result = await AddOffer.run({ tabId, board, list }, { browser, config: CONFIG });
  } catch (e) {
    result = { ok: false, code: "error", error: e.message };
  } finally {
    clearInterval(keepAlive);
    adding = false;
  }
  setBadge(result.ok ? "✓" : "✗", result.ok ? "#16A34A" : "#DC2626");
  try { await notify(result); } catch (e) { console.warn(`Notification impossible : ${e.message}`); }
  // Prévient un popup rouvert entre-temps (aucun destinataire = erreur ignorée).
  browser.runtime.sendMessage({ type: "addDone", result }).catch(() => {});
  return result;
}

if (browser.notifications && browser.notifications.onClicked) {
  browser.notifications.onClicked.addListener((id) => {
    const url = cardLinks.get(id);
    if (url) browser.tabs.create({ url });
    cardLinks.delete(id);
  });
}

browser.runtime.onMessage.addListener((msg) => {
  if (!msg) return undefined;
  if (msg.type === "connect") return connectTrello();
  if (msg.type === "add") return addOffer(msg);
  if (msg.type === "status") return Promise.resolve({ adding });
  return undefined;
});
