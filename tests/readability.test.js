// Readability est copié à la main dans extension/ (il est envoyé aux utilisateurs) et déclaré
// en devDependency : npm audit, OSV-Scanner et Dependabot le surveillent (#64).
// Ce test garantit que la copie embarquée est exactement la version déclarée.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts));
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

const declared = JSON.parse(read("package.json")).devDependencies["@mozilla/readability"];
const installed = JSON.parse(
  read("node_modules", "@mozilla", "readability", "package.json"),
).version;

test("Readability : version exacte déclarée dans package.json", () => {
  assert.match(
    declared,
    /^\d+\.\d+\.\d+$/,
    `version non figée : « ${declared} » (attendu : X.Y.Z, sans ^ ni ~)`,
  );
  assert.equal(installed, declared, "node_modules n'est pas à jour : lance npm ci");
});

test("Readability : la copie embarquée est identique à la version déclarée", () => {
  const copy = sha256(read("extension", "lib", "Readability.js"));
  const original = sha256(read("node_modules", "@mozilla", "readability", "Readability.js"));
  assert.equal(
    copy,
    original,
    `extension/lib/Readability.js diffère de @mozilla/readability@${installed} : ` +
      "recopie node_modules/@mozilla/readability/Readability.js et mets à jour THIRD_PARTY_NOTICES.txt",
  );
});

test("Readability : THIRD_PARTY_NOTICES.txt mentionne la même version", () => {
  const notices = read("extension", "THIRD_PARTY_NOTICES.txt").toString();
  assert.ok(
    notices.includes(`Mozilla Readability ${installed}`) &&
      notices.includes(`@mozilla/readability@${installed}`),
    `THIRD_PARTY_NOTICES.txt doit indiquer la version ${installed} (titre et nom du paquet npm)`,
  );
});
