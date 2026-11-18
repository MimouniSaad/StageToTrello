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

browser.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "connect") return connectTrello();
});
