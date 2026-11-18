const test = require("node:test");
const assert = require("node:assert/strict");
const { releaseNotes } = require("../scripts/release-notes.js");

const CHANGELOG = `# Journal

## [Non publié]

### Ajouté
- À venir

## [3.1.0] - 2026-12-06

### Ajouté
- CI GitHub Actions

### Modifié
- Nouveau design

## [3.0.0] - 2026-11-18

Première version publique.

[Non publié]: https://example.org/compare
[3.1.0]: https://example.org/v3.1.0
`;

test("releaseNotes extrait la section d'une version, sans le titre", () => {
  assert.equal(releaseNotes(CHANGELOG, "3.1.0"),
    "### Ajouté\n- CI GitHub Actions\n\n### Modifié\n- Nouveau design");
});

test("releaseNotes s'arrête aux liens de bas de page", () => {
  assert.equal(releaseNotes(CHANGELOG, "3.0.0"), "Première version publique.");
});

test("releaseNotes renvoie null pour une version absente", () => {
  assert.equal(releaseNotes(CHANGELOG, "9.9.9"), null);
});
