#!/usr/bin/env node
// Vérifie que la version est au format SemVer (MAJEUR.MINEUR.CORRECTIF) et identique
// dans extension/manifest.json, package.json et l'entrée la plus récente de CHANGELOG.md.
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const manifest = JSON.parse(read("extension/manifest.json")).version;
const pkg = JSON.parse(read("package.json")).version;
const changelog = (read("CHANGELOG.md").match(/^## \[(\d+\.\d+\.\d+)\]/m) || [])[1];

if (!/^\d+\.\d+\.\d+$/.test(manifest || "")) fail(`manifest.json : version « ${manifest} » non SemVer (attendu MAJEUR.MINEUR.CORRECTIF)`);
if (pkg !== manifest) fail(`package.json (${pkg}) ≠ manifest.json (${manifest})`);
if (changelog !== manifest) fail(`CHANGELOG.md : dernière version publiée ${changelog} ≠ manifest.json (${manifest})`);
console.log(`✓ version ${manifest} cohérente (manifeste, package.json, CHANGELOG.md)`);
