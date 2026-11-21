const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { htmlToMarkdown, truncate, decodeEntities } = require("../extension/lib/markdown.js");

const md = htmlToMarkdown;
const fixtures = path.join(__dirname, "fixtures", "offres");

test("vraies offres anonymisées : Markdown attendu", () => {
  for (const name of ["wttj", "indeed-encode", "page-carriere"]) {
    const html = fs.readFileSync(path.join(fixtures, `${name}.html`), "utf8");
    const expected = fs.readFileSync(path.join(fixtures, `${name}.md`), "utf8").trim();
    assert.equal(md(html), expected, name);
  }
});

test("titres : niveaux normalisés, le premier devient ##", () => {
  assert.equal(
    md("<h1>Offre</h1><h2>Missions</h2><h4>Détail</h4>"),
    "## Offre\n\n### Missions\n\n##### Détail",
  );
  assert.equal(md("<h3>A</h3><p>x</p><h4>B</h4>"), "## A\n\nx\n\n### B");
  assert.equal(md("<h2><strong>Gras</strong>   dans   un titre</h2>"), "## Gras dans un titre");
  assert.equal(md("<h2>  </h2><p>x</p>"), "x");
});

test("faux titres : gras seul, ligne courte avec « : », majuscules", () => {
  assert.equal(md("<p><strong>Missions :</strong></p><p>x</p>"), "## Missions\n\nx");
  assert.equal(md("<h2>Poste</h2><p><b>Avantages</b></p>"), "## Poste\n\n### Avantages");
  assert.equal(md("<p>Vos missions :</p>"), "## Vos missions");
  assert.equal(md("<p>PROFIL RECHERCHÉ</p>"), "## Profil recherché");
  // Pas des titres : phrase avec virgule, ligne longue, sigle court
  assert.equal(md("<p>Dans l'équipe, tu feras :</p>"), "Dans l'équipe, tu feras :");
  assert.equal(md("<p>CDI</p>"), "CDI");
});

test("paragraphes, retours à la ligne et espaces", () => {
  assert.equal(
    md("<p>Un   texte\n  sur deux lignes</p><p>Deux</p>"),
    "Un texte sur deux lignes\n\nDeux",
  );
  assert.equal(md("<p>Ligne 1<br>Ligne 2<br/><br><br>Ligne 3</p>"), "Ligne 1\nLigne 2\n\nLigne 3");
  assert.equal(md("<div><div><p>Imbriqué</p></div></div>"), "Imbriqué");
});

test("gras, italique, code : marques sans espaces internes", () => {
  assert.equal(md("<p>Bac<strong> +5 </strong>requis</p>"), "Bac **+5** requis");
  assert.equal(md("<p><em>Linux</em> et <i>Docker</i></p>"), "_Linux_ et _Docker_");
  assert.equal(md("<p><b></b>vide</p>"), "vide");
  assert.equal(md("<p>Commande <code>npm test</code></p>"), "Commande `npm test`");
});

test("listes : puces, numérotées, imbriquées, puces tapées à la main", () => {
  assert.equal(md("<ul><li>A</li><li>B<ul><li>B1</li></ul></li></ul>"), "- A\n- B\n  - B1");
  assert.equal(md('<ol start="3"><li>C</li><li><p>D</p></li></ol>'), "3. C\n4. D");
  assert.equal(md("<ul><li>Sans fermeture<li>Suivant</ul>"), "- Sans fermeture\n- Suivant");
  assert.equal(md("<p>• Un<br>▪ Deux<br>– Trois</p>"), "- Un\n- Deux\n- Trois");
});

test("liens : http(s) seulement", () => {
  assert.equal(md('<p><a href="https://a.example/x">Voir</a></p>'), "[Voir](https://a.example/x)");
  assert.equal(md('<p><a href="javascript:alert(1)">Piège</a></p>'), "Piège");
  assert.equal(md('<p><a href="data:text/html,x">Data</a></p>'), "Data");
  assert.equal(
    md('<p><a href="https://a.example/(1)">Parenthèses</a></p>'),
    "[Parenthèses](https://a.example/%281%29)",
  );
});

test("éléments ignorés et texte caché", () => {
  const html =
    '<p>Visible</p><script>alert(1)</script><style>p{}</style><img src="x">' +
    '<p hidden>caché</p><span style="display: none">caché</span><div aria-hidden="true">caché</div>' +
    "<form><input><button>Envoyer</button></form><iframe src=x></iframe><nav>Menu</nav>";
  assert.equal(md(html), "Visible");
});

test("entités HTML : nommées, accentuées, numériques", () => {
  assert.equal(
    decodeEntities(
      "&amp; &lt;b&gt; &eacute;t&eacute; &Agrave; &ccedil;a &#233; &#x1F600; &rsquo; &nbsp;|",
    ),
    "& <b> été À ça é 😀 ’  |",
  );
  assert.equal(md("<p>R&amp;D &mdash; 3&nbsp;mois</p>"), "R&D — 3 mois");
});

test("échappement des caractères Markdown du texte", () => {
  assert.equal(md("<p>5 * 3 = 15</p>"), "5 \\* 3 = 15");
  assert.equal(
    md("<p># Pas un titre</p><p>&gt; pas une citation</p>"),
    "\\# Pas un titre\n\n\\> pas une citation",
  );
  assert.equal(md("<p>[crochets]</p>"), "\\[crochets\\]");
  assert.equal(md("<p>mot_composé et _isolé_</p>"), "mot_composé et \\_isolé\\_");
});

test("texte brut (sans balises) : structure par lignes", () => {
  assert.equal(
    md("Missions :\n• Rédiger des tests\n• Améliorer la CI\n\nPROFIL\nRigueur"),
    "## Missions\n\n- Rédiger des tests\n- Améliorer la CI\n\n## Profil\n\nRigueur",
  );
});

test("HTML vide, malformé ou inattendu", () => {
  assert.equal(md(""), "");
  assert.equal(md(null), "");
  assert.equal(md("<p>Non fermé <b>gras"), "Non fermé **gras**");
  assert.equal(md("</div></p>texte<p>"), "texte");
  assert.equal(md("<!-- commentaire --><!DOCTYPE html><p>ok</p>"), "ok");
  assert.equal(md("<blockquote>Citation<br>suite</blockquote>"), "> Citation\n> suite");
  assert.equal(md("<pre>  code\n  *brut*</pre>"), "```\n  code\n  *brut*\n```");
  assert.equal(
    md("<table><tr><th>Lieu</th><td>Lyon</td></tr><tr><th>Durée</th><td>6 mois</td></tr></table>"),
    "Lieu · Lyon\n\nDurée · 6 mois",
  ); // une ligne par rangée, séparées pour un rendu sûr
});

test("troncature à 16 000 caractères sur une fin de paragraphe", () => {
  const long = Array.from(
    { length: 400 },
    (_, i) => `<p>Paragraphe ${i} ${"mot ".repeat(10)}</p>`,
  ).join("");
  const out = md(long);
  assert.ok(out.length <= 16000, `longueur ${out.length}`);
  assert.match(out, /\n\n…$/);
  assert.match(out.slice(0, -3), /mot$/); // coupé entre deux paragraphes, pas au milieu
  assert.equal(truncate("court"), "court");
  assert.equal(truncate("a".repeat(50), 20).length <= 20, true);
});
