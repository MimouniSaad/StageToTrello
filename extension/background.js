// La connexion Trello tourne ici et non dans le popup : Firefox ferme le popup
// dès que la fenêtre d'autorisation s'ouvre, ce qui interromprait le flux.
async function connectTrello() {
  if (typeof CONFIG === "undefined" || !CONFIG.TRELLO_KEY) {
    return { ok: false, error: "config.js manquant : voir le README." };
  }
  let redirect;
  try {
    redirect = await browser.identity.launchWebAuthFlow({
      url: Core.authorizeUrl(CONFIG.TRELLO_KEY, browser.identity.getRedirectURL()),
      interactive: true,
    });
  } catch (e) {
    return { ok: false, error: "Connexion Trello annulée." };
  }
  const token = Core.tokenFromRedirect(redirect);
  if (!token) return { ok: false, error: "Connexion Trello annulée." };
  await browser.storage.local.set({ trelloToken: token });
  return { ok: true };
}

browser.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "connect") return connectTrello();
});
