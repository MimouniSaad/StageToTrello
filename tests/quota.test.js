const test = require("node:test");
const assert = require("node:assert/strict");
const Quota = require("../extension/lib/quota.js");

const NOW = Date.UTC(2026, 10, 18, 21, 48);   // 18/11/2026 21:48 UTC

test("la limite par défaut est de 40 offres par jour", () => {
  assert.equal(Quota.DAILY_LIMIT, 40);
});

test("nextReset : minuit UTC suivant, y compris en fin de mois et d'année", () => {
  assert.equal(Quota.nextReset(NOW), Date.UTC(2026, 10, 19));
  assert.equal(Quota.nextReset(Date.UTC(2026, 10, 30, 12)), Date.UTC(2026, 11, 1));
  assert.equal(Quota.nextReset(Date.UTC(2026, 11, 31, 23, 59)), Date.UTC(2027, 0, 1));
});

test("status : aucun usage enregistré", () => {
  const st = Quota.status(undefined, NOW);
  assert.deepEqual(st, { used: 0, limit: 40, remaining: 40, blocked: false,
                         resetAt: Date.UTC(2026, 10, 19) });
});

test("status : bloqué à partir de 40 le même jour", () => {
  assert.equal(Quota.status({ day: "2026-11-18", count: 39 }, NOW).blocked, false);
  const st = Quota.status({ day: "2026-11-18", count: 40 }, NOW);
  assert.equal(st.blocked, true);
  assert.equal(st.remaining, 0);
});

test("status : le compteur d'un autre jour est ignoré", () => {
  const st = Quota.status({ day: "2026-11-17", count: 40 }, NOW);
  assert.equal(st.used, 0);
  assert.equal(st.blocked, false);
});

test("consume : incrémente le jour courant et repart à 1 un nouveau jour", () => {
  assert.deepEqual(Quota.consume({ day: "2026-11-18", count: 5 }, NOW), { day: "2026-11-18", count: 6 });
  assert.deepEqual(Quota.consume({ day: "2026-11-17", count: 40 }, NOW), { day: "2026-11-18", count: 1 });
  assert.deepEqual(Quota.consume(undefined, NOW), { day: "2026-11-18", count: 1 });
});

test("formatWait : heures, minutes et moins d'une minute", () => {
  assert.equal(Quota.formatWait(30 * 1000), "moins d'une minute");
  assert.equal(Quota.formatWait(60 * 1000), "1 min");
  assert.equal(Quota.formatWait(45 * 60 * 1000), "45 min");
  assert.equal(Quota.formatWait(2 * 3600 * 1000), "2 h");
  assert.equal(Quota.formatWait((2 * 60 + 12) * 60 * 1000), "2 h 12 min");
  assert.equal(Quota.formatWait((3 * 60 + 5) * 60 * 1000 - 1000), "3 h 05 min");  // arrondi à la minute supérieure
});

test("blockedMessage : limite, temps restant et heure de réinitialisation", () => {
  const st = Quota.status({ day: "2026-11-18", count: 40 }, NOW);
  const msg = Quota.blockedMessage(st, NOW);
  assert.match(msg, /^Limite de 40 offres par jour atteinte\. Réinitialisation dans 2 h 12 min \(à \d{2}:\d{2}\)\.$/);
});
