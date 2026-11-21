#!/usr/bin/env node
// Extrait de CHANGELOG.md les notes d'une version, pour la GitHub Release.
// Usage : node scripts/release-notes.js 3.1.0 > notes.md
const fs = require("node:fs");
const path = require("node:path");

function releaseNotes(changelog, version) {
  const lines = changelog.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`## [${version}]`));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith("## [") || /^\[[^\]]+\]: /.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
}

if (require.main === module) {
  const version = (process.argv[2] || "").replace(/^v/, "");
  const changelog = fs.readFileSync(path.join(__dirname, "..", "CHANGELOG.md"), "utf8");
  const notes = version && releaseNotes(changelog, version);
  if (!notes) {
    console.error(`✗ Aucune section « ## [${version}] » non vide dans CHANGELOG.md`);
    process.exit(1);
  }
  process.stdout.write(`${notes}\n`);
}

module.exports = { releaseNotes };
