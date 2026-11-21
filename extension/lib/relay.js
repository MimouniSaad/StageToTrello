// Client du relais StageToTrello : l'analyse par IA passe par le relais, qui garde la clé Groq.
// L'extension n'envoie que le contenu de l'offre et le jeton Trello de l'utilisateur.
const Relay = (() => {
  const CoreRef = typeof Core !== "undefined" ? Core : require("./core.js");
  const TIMEOUT_MS = 25000; // le relais essaie plusieurs modèles : on laisse un peu de marge

  class RelayError extends Error {
    constructor(message, status, data = {}) {
      super(message);
      this.name = "RelayError";
      this.status = status;
      this.code = data.code || "";
      this.data = data;
    }
  }

  // Compteur du relais : { used, limit, resetAt } si la réponse le contient.
  function usageOf(data) {
    return data && Number.isFinite(data.used) && Number.isFinite(data.resetAt)
      ? { used: data.used, limit: data.limit, resetAt: data.resetAt }
      : null;
  }

  async function extract(
    page,
    labelNames,
    { relayUrl, token, fetchFn = fetch, timeoutMs = TIMEOUT_MS },
  ) {
    const init = {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url: page.url,
        title: page.meta.title,
        site: page.meta.site,
        text: page.text.slice(0, CoreRef.MAX_PROMPT_CHARS),
        labels: labelNames,
      }),
    };
    if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
      init.signal = AbortSignal.timeout(timeoutMs);
    }

    let r;
    try {
      r = await fetchFn(`${relayUrl.replace(/\/+$/, "")}/extract`, init);
    } catch {
      throw new RelayError("Service d'analyse injoignable.", 0, { code: "unreachable" });
    }
    let data = {};
    try {
      data = await r.json();
    } catch {
      /* corps vide ou non JSON */
    }
    if (!r.ok || !data.ok) {
      throw new RelayError(
        data.error || `Erreur du service d'analyse (${r.status}).`,
        r.status,
        data,
      );
    }
    return {
      ...CoreRef.parseLlm(data.content || "", labelNames),
      model: data.model || "",
      usage: usageOf(data),
    };
  }

  return { RelayError, extract, usageOf };
})();

if (typeof module === "object") module.exports = Relay;
