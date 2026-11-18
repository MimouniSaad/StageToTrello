#!/usr/bin/env node
// Crée le paquet à envoyer sur AMO : vérifications, tests, lint, puis zip.
// Usage : npm run package   →   web-ext-artifacts/stagetotrello-<version>.zip
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const ext = path.join(root, "extension");
const webExt = path.join(root, "node_modules", ".bin", "web-ext");

const ok = (msg) => console.log(`✓ ${msg}`);
function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}
function run(cmd, args) {
  try {
    execFileSync(cmd, args, { cwd: root, stdio: "inherit" });
  } catch {
    fail(`échec de : ${path.basename(cmd)} ${args.join(" ")}`);
  }
}
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}

// 1. Manifeste
const manifest = JSON.parse(fs.readFileSync(path.join(ext, "manifest.json"), "utf8"));
const version = manifest.version;
if (!/^\d+(\.\d+){0,3}$/.test(version || "")) fail(`version invalide dans manifest.json : ${version}`);
ok(`manifeste : ${manifest.name} ${version} (${manifest.browser_specific_settings.gecko.id})`);

// 2. Configuration (exécutée comme dans Firefox)
const ctx = {};
try {
  vm.runInNewContext(`${fs.readFileSync(path.join(ext, "config.js"), "utf8")}\nthis.CONFIG = CONFIG;`, ctx);
} catch (e) {
  fail(`extension/config.js illisible : ${e.message}`);
}
const { TRELLO_KEY, RELAY_URL } = ctx.CONFIG || {};
if (!/^[0-9a-f]{32}$/i.test(TRELLO_KEY || "")) fail("config.js : TRELLO_KEY manquante ou invalide (32 caractères hexadécimaux)");
if (!/^https:\/\/[^/]+/.test(RELAY_URL || "")) fail("config.js : RELAY_URL manquante ou non https");
const relayPermission = `${new URL(RELAY_URL).origin}/*`;
if (!manifest.permissions.includes(relayPermission)) {
  fail(`manifest.json : la permission ${relayPermission} (adresse du relais) est absente`);
}
ok(`configuration : relais ${RELAY_URL}`);

// 3. Aucun secret dans le paquet
const SECRET = /gsk_[A-Za-z0-9]{20,}|GROQ_API_KEY\s*[:=]|oauth_secret/;   // clé Groq ou affectation
const leaks = walk(ext).filter((f) => !f.endsWith(".png") && SECRET.test(fs.readFileSync(f, "utf8")));
if (leaks.length) fail(`secret possible dans : ${leaks.map((f) => path.relative(root, f)).join(", ")}`);
ok("aucun secret détecté dans extension/");

// 4. Fichiers obligatoires
for (const f of ["THIRD_PARTY_NOTICES.txt", "lib/Readability.js", ...Object.values(manifest.icons)]) {
  if (!fs.existsSync(path.join(ext, f))) fail(`fichier manquant : extension/${f}`);
}
ok("fichiers obligatoires présents (icônes, mentions de licence)");

// 5. Tests, lint, zip
if (!fs.existsSync(webExt)) fail("web-ext n'est pas installé : lance d'abord npm install");
run("npm", ["test", "--silent"]);
ok("tests");
run(webExt, ["lint", "--source-dir", ext]);   // échoue s'il y a une erreur (les avertissements sont tolérés)
ok("web-ext lint");
const filename = `stagetotrello-${version}.zip`;
run(webExt, ["build", "--source-dir", ext, "--artifacts-dir", path.join(root, "web-ext-artifacts"),
             "--filename", filename, "--overwrite-dest"]);
ok(`paquet prêt : web-ext-artifacts/${filename}`);
