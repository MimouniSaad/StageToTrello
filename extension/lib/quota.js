// Limite d'utilisation : nombre d'offres analysées par jour.
// Le relais fait foi (par compte Trello) ; l'extension garde une copie locale de son compteur
// pour afficher les offres restantes et bloquer le bouton sans requête inutile.
// Le jour est calé sur minuit UTC, comme le relais.
const Quota = (() => {
  const DAILY_LIMIT = 40;
  const STORAGE_KEY = "usage";

  const dayKey = (now) => new Date(now).toISOString().slice(0, 10);

  function nextReset(now) {
    const d = new Date(now);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  }

  // usage = { day: "AAAA-MM-JJ", count: n } tel que stocké ; un autre jour repart à zéro.
  function status(usage, now, limit = (usage && usage.limit) || DAILY_LIMIT) {
    const used = usage && usage.day === dayKey(now) ? usage.count : 0;
    return {
      used, limit,
      remaining: Math.max(0, limit - used),
      blocked: used >= limit,
      resetAt: nextReset(now),
    };
  }

  // Copie locale du compteur renvoyé par le relais ({ used, limit, resetAt }).
  function fromServer({ used, limit, resetAt }) {
    return { day: dayKey(resetAt - 1), count: used, limit: limit || DAILY_LIMIT };
  }

  // 3 h 12 min, 45 min, moins d'une minute
  function formatWait(ms) {
    if (ms < 60000) return "moins d'une minute";
    const totalMin = Math.ceil(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (!h) return `${m} min`;
    return m ? `${h} h ${String(m).padStart(2, "0")} min` : `${h} h`;
  }

  function formatClock(ts) {
    return new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }

  function blockedMessage(st, now) {
    return `Limite de ${st.limit} offres par jour atteinte. Réinitialisation dans ` +
      `${formatWait(st.resetAt - now)} (à ${formatClock(st.resetAt)}).`;
  }

  return { DAILY_LIMIT, STORAGE_KEY, dayKey, nextReset, status, fromServer,
           formatWait, formatClock, blockedMessage };
})();

if (typeof module === "object") module.exports = Quota;
