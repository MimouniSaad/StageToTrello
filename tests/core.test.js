const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../extension/lib/core.js");

test("parseLlm lit les 4 lignes et filtre les étiquettes inconnues", () => {
  const out = "<think>x</think>\nFOUND: yes\nCOMPANY: Capgemini\nTITLE: Ingénieur GRC\nLABELS: Cloud, Inconnu";
  assert.deepEqual(Core.parseLlm(out, ["Cloud", "DevOps"]), {
    found: true, company: "Capgemini", title: "Ingénieur GRC", labels: ["Cloud"],
  });
});

test("parseLlm : FOUND no et champs absents", () => {
  const r = Core.parseLlm("FOUND: no", []);
  assert.equal(r.found, false);
  assert.equal(r.company, "");
  assert.deepEqual(r.labels, []);
});

test("buildPrompt contient l'URL, le texte tronqué et les étiquettes", () => {
  const p = Core.buildPrompt("https://x.fr/o", { title: "T", site: "S" }, "a".repeat(20000), ["Cloud", "AI"]);
  assert.match(p, /URL : https:\/\/x\.fr\/o/);
  assert.match(p, /LABELS: 1 à 3 étiquettes parmi : Cloud, AI/);
  assert.ok(!p.includes("a".repeat(Core.MAX_PROMPT_CHARS + 1)));
  assert.ok(p.includes("a".repeat(Core.MAX_PROMPT_CHARS)));
});

test("parseJobPosting lit @graph, @type liste et convertit la description", () => {
  const jp = Core.parseJobPosting([
    '{"@graph":[{"@type":["JobPosting"],"title":"Dev","hiringOrganization":{"name":"Acme"},"description":"<p>A &amp; B</p><ul><li>x</li></ul>"}]}',
    "pas du json",
  ]);
  assert.deepEqual(jp, { company: "Acme", title: "Dev", desc: "A & B\nx", city: "" });
});

test("parseJobPosting lit la ville (jobLocation objet ou liste)", () => {
  const one = '{"@type":"JobPosting","title":"T","jobLocation":{"address":{"addressLocality":"Lyon"}}}';
  const list = '{"@type":"JobPosting","title":"T","jobLocation":[{"address":{"addressLocality":" Paris "}}]}';
  assert.equal(Core.parseJobPosting([one]).city, "Lyon");
  assert.equal(Core.parseJobPosting([list]).city, "Paris");
});

test("cleanTitle retire H/F, durée, fin d'études et ville connue", () => {
  const cases = [
    ["Stagiaire DevOps H/F", "", "Stagiaire DevOps"],
    ["Ingénieur GRC (H/F) - Paris", "Paris", "Ingénieur GRC"],
    ["Stage - Développeur Full-Stack (6 mois) - Lyon 69003", "Lyon", "Stage - Développeur Full-Stack"],
    ["Data Analyst F/H/X | Nantes", "Nantes", "Data Analyst"],
    ["Stage Cybersécurité (stage de fin d’études)", "", "Stage Cybersécurité"],
    ["Consultant SAP (Paris La Défense)", "Paris La Défense", "Consultant SAP"],
    ["Software Engineer (m/w/d)", "", "Software Engineer"],
    ["Ingénieur Cloud AWS - Toulouse (31)", "Toulouse", "Ingénieur Cloud AWS"],
  ];
  for (const [title, city, expected] of cases) assert.equal(Core.cleanTitle(title, city), expected, title);
});

test("cleanTitle ne casse pas les intitulés normaux", () => {
  assert.equal(Core.cleanTitle("CI/CD Engineer"), "CI/CD Engineer");
  assert.equal(Core.cleanTitle("Stage Paris Data", "Paris"), "Stage Paris Data");   // ville sans séparateur
  assert.equal(Core.cleanTitle("H/F"), "H/F");   // rien ne reste : on garde l'original
});

test("fromJobPosting : offre reconnue sans IA, intitulé nettoyé", () => {
  const jp = { company: "Capgemini", title: "Stagiaire DevOps H/F - Paris", desc: "", city: "Paris" };
  const r = Core.fromJobPosting("https://a.fr", { title: "", site: "" }, "docker kubernetes", jp, ["DevOps"]);
  assert.equal(r.found, true);
  assert.equal(r.fallback, false);
  assert.equal(r.source, "jobposting");
  assert.equal(r.company, "Capgemini");
  assert.equal(r.title, "Stagiaire DevOps");
  assert.deepEqual(r.labels, ["DevOps"]);
  assert.equal(Core.hasFullJobPosting(jp), true);
  assert.equal(Core.hasFullJobPosting({ ...jp, company: "" }), false);
  assert.equal(Core.hasFullJobPosting(null), false);
});

test("parseJobPosting ignore les autres types", () => {
  assert.equal(Core.parseJobPosting(['{"@type":"Organization"}']), null);
});

test("heuristicExtract devine entreprise, titre et étiquettes", () => {
  const r = Core.heuristicExtract(
    "https://www.welcometothejungle.com/x",
    { title: "Dev Python - Acme | WTTJ", site: "" },
    "python docker", null, ["DevOps", "Développement logiciel", "AI"],
  );
  assert.equal(r.company, "Welcometothejungle");
  assert.equal(r.title, "Dev Python");
  assert.ok(r.labels.includes("DevOps"));
  assert.ok(r.labels.includes("Développement logiciel"));
  assert.equal(r.found, false);
  assert.equal(r.fallback, true);
});

test("heuristicExtract : une page longue sans JobPosting n'est pas une offre", () => {
  const r = Core.heuristicExtract("https://exemple.fr/offres", { title: "Nos offres", site: "Exemple" },
                                  "Liste de 50 offres d'emploi… ".repeat(100), null, []);
  assert.equal(r.found, false);
});

test("heuristicExtract : JobPosting avec entreprise ou intitulé = offre", () => {
  const meta = { title: "Page", site: "" };
  assert.equal(Core.heuristicExtract("https://a.fr", meta, "", { company: "Acme", title: "", desc: "" }, []).found, true);
  assert.equal(Core.heuristicExtract("https://a.fr", meta, "", { company: "", title: "Stagiaire", desc: "" }, []).found, true);
  assert.equal(Core.heuristicExtract("https://a.fr", meta, "", { company: "", title: "", desc: "x" }, []).found, false);
});

test("finalizeInfo prend la description JSON-LD au-delà de 300 caractères", () => {
  const info = { found: true, company: "", title: "T", labels: [] };
  const jp = { company: "Acme", title: "X", desc: "d".repeat(301) };
  const r = Core.finalizeInfo("https://a.fr", { title: "", site: "" }, "texte", jp, info);
  assert.equal(r.desc, jp.desc);
  assert.equal(r.company, "Acme");
});

test("finalizeInfo garde le texte si la description JSON-LD est courte", () => {
  const info = { found: true, company: "C", title: "T", labels: [] };
  const jp = { company: "Acme", title: "X", desc: "d".repeat(299) };
  const r = Core.finalizeInfo("https://a.fr", { title: "", site: "" }, "texte", jp, info);
  assert.equal(r.desc, "texte");
});

test("authorizeUrl construit l'URL d'autorisation Trello", () => {
  const redirect = "https://abc.extensions.allizom.org/";
  const u = new URL(Core.authorizeUrl("K", redirect));
  assert.equal(u.origin, "https://trello.com");
  assert.equal(u.pathname, "/1/authorize");
  const p = Object.fromEntries(u.searchParams);
  assert.deepEqual(p, {
    key: "K", name: "StageToTrello", scope: "read,write", expiration: "never",
    response_type: "token", callback_method: "fragment", return_url: redirect,
  });
});

test("tokenFromRedirect lit le jeton dans le fragment", () => {
  assert.equal(Core.tokenFromRedirect("https://abc.extensions.allizom.org/#token=T123"), "T123");
  assert.equal(Core.tokenFromRedirect("https://abc.extensions.allizom.org/#error=denied"), null);
  assert.equal(Core.tokenFromRedirect("https://abc.extensions.allizom.org/"), null);
});

test("cardName assemble entreprise et poste", () => {
  assert.equal(Core.cardName({ company: "Acme", title: "Dev" }), "Acme - Dev");
});

// ---------- Étiquettes par mots-clés ----------

const SAAD = ["DevSecOps", "DevOps", "Cloud", "Cybersécurité", "Réseaux", "AI", "Système et Infra",
              "Développement logiciel", "Testeur", "Support IT", "PowerPlaterforme dev"];

test("keywordLabels : étiquettes d'un tableau existant", () => {
  assert.deepEqual(Core.keywordLabels(SAAD, "Stagiaire DevOps", "Kubernetes, Terraform sur AWS. CI/CD GitLab."),
                   ["DevOps", "Cloud"]);
  assert.deepEqual(Core.keywordLabels(SAAD, "Analyste SOC", "SIEM, détection, ISO 27001"), ["Cybersécurité"]);
  // « PowerPlaterforme dev » relève du thème Power Platform, pas du développement en général
  assert.deepEqual(Core.keywordLabels(SAAD, "Consultant Power Platform", "Power Apps et Power Automate"),
                   ["PowerPlaterforme dev"]);
  assert.deepEqual(Core.keywordLabels(SAAD, "Développeur Python", "Django, React"), ["Développement logiciel"]);
});

test("keywordLabels : fonctionne avec d'autres noms d'étiquettes (casse, accents, synonymes)", () => {
  const other = ["Développeur Web", "Data / BI", "CYBERSECURITY", "Ressources humaines", "Urgent"];
  assert.deepEqual(Core.keywordLabels(other, "Analyste SOC", "SIEM"), ["CYBERSECURITY"]);
  assert.deepEqual(Core.keywordLabels(other, "Data analyst", "SQL et Power BI"), ["Data / BI"]);
  assert.deepEqual(Core.keywordLabels(other, "Chargé de recrutement", "ressources humaines"), ["Ressources humaines"]);
  assert.deepEqual(Core.keywordLabels(other, "Stagiaire comptable", "bilan"), []);
});

test("keywordLabels : le nom de l'étiquette lui-même suffit", () => {
  assert.deepEqual(Core.keywordLabels(["Alternance", "Stage"], "Stage Ingénieur", "En alternance"),
                   ["Stage", "Alternance"]);   // titre d'abord
});

test("keywordLabels : au plus 3 étiquettes, celles du titre en premier", () => {
  const labels = Core.keywordLabels(SAAD, "Ingénieur Cloud", "devops docker linux python selenium support");
  assert.equal(labels.length, 3);
  assert.equal(labels[0], "Cloud");
});
