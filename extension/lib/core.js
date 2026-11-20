// Logique pure : prompt, lecture des réponses, données structurées, mode de secours.
const Core = (() => {
  const Md = typeof Markdown !== "undefined" ? Markdown : require("./markdown.js");
  const MAX_PROMPT_CHARS = 10000; // reste sous la limite de tokens par minute de l'offre gratuite Groq
  // Thèmes pour choisir les étiquettes sans IA, quel que soit le tableau de l'utilisateur.
  // Une étiquette est rattachée au PREMIER thème dont un « nom » apparaît dans son nom
  // (mot entier, ou début de mot si le nom finit par *), sans tenir compte de la casse ni
  // des accents : les thèmes vont donc du plus précis au plus général. L'étiquette est choisie
  // si le titre ou le texte de l'offre contient un mot-clé du thème, ou le nom de l'étiquette.
  const THEMES = [
    { names: ["power*"], rx: /power apps|power automate|power platform|power bi|powerapps/ },
    { names: ["devsecops"], rx: /devsecops|\bsast\b|\bdast\b|securite.{0,20}(ci\/cd|pipeline)/ },
    {
      names: ["devops", "ci/cd", "cicd", "sre"],
      rx: /devops|ci\/cd|jenkins|gitlab|github actions|docker|kubernetes|terraform|ansible|helm|\bsre\b/,
    },
    { names: ["cloud", "aws", "azure", "gcp"], rx: /\baws\b|azure|\bgcp\b|google cloud|cloud/ },
    {
      names: ["cyber*", "securite", "security", "ssi", "soc", "grc", "pentest"],
      rx: /cyber|securite|security|pentest|\bsoc\b|siem|owasp|\bgrc\b|iso 27001|\bssi\b/,
    },
    {
      names: ["reseau*", "network", "telecom"],
      rx: /reseau|network|cisco|routage|vlan|firewall|pare-feu|\bwan\b|\blan\b|telecom/,
    },
    {
      names: [
        "ai",
        "ia",
        "intelligence artificielle",
        "machine learning",
        "ml",
        "deep learning",
        "llm",
      ],
      rx: /\bia\b|\bai\b|machine learning|deep learning|\bllm\b|intelligence artificielle|nlp|computer vision/,
    },
    {
      names: ["data", "donnee*", "bi", "analytics", "analyste"],
      rx: /\bdata\b|donnees|\bsql\b|power bi|tableau|\betl\b|big data|data analyst|data engineer|analytics/,
    },
    {
      names: ["systeme*", "infra*", "sysadmin", "administrateur"],
      rx: /linux|windows server|virtualisation|vmware|proxmox|active directory|infrastructure|sysadmin|administrateur systeme/,
    },
    {
      names: [
        "developpement",
        "developpeur",
        "dev",
        "logiciel",
        "software",
        "web",
        "fullstack",
        "full stack",
        "backend",
        "frontend",
        "mobile",
      ],
      rx: /developpeur|developpement|developer|python|\bjava\b|javascript|typescript|react|angular|\bnode|backend|frontend|full.?stack|\bc#|\.net|\bphp\b/,
    },
    {
      names: ["test*", "qa", "qualite", "recette"],
      rx: /testeur|\bqa\b|recette|test logiciel|selenium|cypress|qualite logicielle|tests? automatises/,
    },
    {
      names: ["support", "helpdesk", "assistance", "technicien"],
      rx: /support|helpdesk|help desk|assistance utilisateur|technicien|\bitsm\b|glpi/,
    },
    {
      names: ["projet*", "project*", "pmo", "scrum", "agile"],
      rx: /chef de projet|project manager|gestion de projet|\bpmo\b|scrum|agile|product owner/,
    },
    {
      names: ["marketing", "communication", "seo"],
      rx: /marketing|communication|\bseo\b|social media|reseaux sociaux|growth/,
    },
    {
      names: ["financ*", "comptab*", "audit", "controle de gestion"],
      rx: /finance|comptab|audit|controle de gestion|tresorerie/,
    },
    {
      names: ["rh", "ressources humaines", "recrutement", "talent"],
      rx: /\brh\b|ressources humaines|recrutement|talent acquisition|paie/,
    },
    {
      names: ["commercia*", "vente*", "sales", "business"],
      rx: /commercial|vente|\bsales\b|business develop|account manager/,
    },
  ];

  const normalize = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[’']/g, " ");
  const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const hasWord = (hay, word) =>
    new RegExp(`(^|[^a-z0-9])${escapeRx(word)}($|[^a-z0-9])`).test(hay);
  const nameMatches = (label, n) =>
    n.endsWith("*")
      ? new RegExp(`(^|[^a-z0-9])${escapeRx(n.slice(0, -1))}`).test(label)
      : hasWord(label, n);

  // Jusqu'à 3 étiquettes du tableau, celles trouvées dans le titre d'abord.
  function keywordLabels(labelNames, title, text) {
    const t = normalize(title);
    const body = normalize(text);
    const scored = labelNames.map((label, index) => {
      const name = normalize(label).trim();
      const theme = THEMES.find((th) => th.names.some((n) => nameMatches(name, n)));
      const tests = theme ? [(s) => theme.rx.test(s)] : [];
      if (name.length >= 3) tests.push((s) => hasWord(s, name)); // le nom de l'étiquette lui-même
      const inTitle = tests.some((fn) => fn(t));
      const inText = tests.some((fn) => fn(body));
      return { label, index, score: (inTitle ? 2 : 0) + (inText ? 1 : 0) };
    });
    return scored
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, 3)
      .map((x) => x.label);
  }

  function buildPrompt(url, meta, text, labelNames) {
    return `Voici le début d'une page web qui devrait être une offre de stage ou d'emploi.
URL : ${url}
Titre de la page : ${meta.title}
Nom du site : ${meta.site}

CONTENU :
${text.slice(0, MAX_PROMPT_CHARS)}

Réponds EXACTEMENT avec ces 4 lignes, sans rien ajouter avant ni après :
FOUND: yes ou no  (yes seulement si le contenu est une offre précise ; no si c'est une page générique, une liste d'offres, une erreur ou un menu)
COMPANY: nom court de l'entreprise qui recrute (ex : Capgemini, Sopra Steria)
TITLE: intitulé du poste, court et propre, sans lieu ni mention "stage de fin d'études" superflue (ex : Ingénieur GRC)
LABELS: 1 à 3 étiquettes parmi : ${labelNames.join(", ")}`;
  }

  function parseLlm(out, labelNames) {
    out = out.replace(/<think>[\s\S]*?<\/think>/g, "");
    const field = (name) => {
      const m = out.match(new RegExp(`^${name}:[ \\t]*(.*)$`, "mi"));
      return m ? m[1].trim() : "";
    };
    const labels = field("LABELS")
      .split(",")
      .map((l) => l.trim())
      .filter((l) => l && labelNames.includes(l));
    return {
      found: field("FOUND").toLowerCase().startsWith("y"),
      company: field("COMPANY"),
      title: field("TITLE"),
      labels,
    };
  }

  function isJobPosting(item) {
    const t = item && item["@type"];
    return t === "JobPosting" || (Array.isArray(t) && t.includes("JobPosting"));
  }

  // Ville du premier lieu de travail (jobLocation peut être un objet ou une liste).
  function jobCity(loc) {
    const first = Array.isArray(loc) ? loc[0] : loc;
    const addr = first && typeof first === "object" ? first.address : null;
    const city = addr && typeof addr === "object" ? addr.addressLocality : "";
    return typeof city === "string" ? city.trim() : "";
  }

  // Intitulé propre pour « Entreprise - Poste » : retire les mentions H/F, la durée,
  // « (stage de fin d'études) » et la ville connue, puis les séparateurs orphelins.
  function cleanTitle(title, city = "") {
    const original = String(title || "").trim();
    let t = original
      .replace(
        /[([]?\s*(?<![\p{L}])[hfmw]\s*\/\s*[hfmw](?:\s*\/\s*(?:x|d|nb|n))?(?![\p{L}])\s*[)\]]?/giu,
        " ",
      )
      .replace(/[([]?\s*\b\d{1,2}\s*mois\b\s*[)\]]?/gi, " ")
      .replace(/[([]\s*stage de fin d['’]études\s*[)\]]/gi, " ");
    if (city) {
      const c = escapeRx(city);
      t = t
        .replace(new RegExp(`\\(\\s*${c}[^()]*\\)`, "gi"), " ")
        .replace(
          new RegExp(`\\s*[-–|,]\\s*${c}(?:\\s*\\(?\\d{2,5}\\)?)?\\s*(?=$|[-–|,(])`, "gi"),
          " ",
        );
    }
    t = t
      .replace(/\(\s*\)|\[\s*\]/g, " ")
      .replace(/\s*([-–|])\s*(?:[-–|]\s*)+/g, " $1 ")
      .replace(/\s+/g, " ")
      .replace(/^[\s\-–|,:]+|[\s\-–|,:]+$/g, "")
      .trim();
    return t || original;
  }

  function parseJobPosting(jsonTexts) {
    for (const raw of jsonTexts) {
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        continue;
      }
      const items = Array.isArray(data)
        ? data
        : data && typeof data === "object"
          ? data["@graph"] || [data]
          : [];
      for (const it of items) {
        if (!it || typeof it !== "object" || !isJobPosting(it)) continue;
        const org = it.hiringOrganization || {};
        const company = typeof org === "object" ? org.name || "" : String(org);
        return {
          company: String(company).trim(),
          title: String(it.title || "").trim(),
          desc: Md.htmlToMarkdown(String(it.description || "")),
          city: jobCity(it.jobLocation),
        };
      }
    }
    return null;
  }

  function domainName(url) {
    const d = new URL(url).hostname.replace("www.", "").split(".")[0];
    return d.charAt(0).toUpperCase() + d.slice(1);
  }

  function heuristicExtract(url, meta, text, jp, labelNames) {
    const company = (jp && jp.company) || meta.site || domainName(url);
    const title =
      (jp && jp.title && cleanTitle(jp.title, jp.city)) ||
      meta.title.split(/\s[-|–]\s/)[0] ||
      meta.title;
    const labels = keywordLabels(labelNames, title, text);
    // Sans IA, seule une offre publiée en données structurées (JobPosting) est fiable :
    // une page longue (liste de résultats, accueil, article) ne suffit pas.
    const found = Boolean(jp && (jp.company || jp.title));
    return { found, company, title, labels, fallback: true };
  }

  // Page avec un JobPosting complet (entreprise et intitulé) : pas besoin de l'IA.
  // Les étiquettes sont choisies par mots-clés ; ces ajouts ne consomment pas de quota.
  function fromJobPosting(url, meta, text, jp, labelNames) {
    return {
      ...heuristicExtract(url, meta, text, jp, labelNames),
      fallback: false,
      source: "jobposting",
    };
  }

  const hasFullJobPosting = (jp) => Boolean(jp && jp.company && jp.title);

  // Description de la carte, en Markdown : celle du JobPosting si elle est assez longue,
  // sinon l'article extrait par Readability (html), sinon le texte brut de la page.
  function finalizeInfo(url, meta, text, jp, info, html = "") {
    const desc =
      jp && jp.desc.length > 300
        ? jp.desc
        : (html && Md.htmlToMarkdown(html)) || Md.htmlToMarkdown(text);
    return {
      ...info,
      company: info.company || (jp && jp.company) || meta.site || domainName(url),
      title: info.title || (jp && jp.title) || meta.title || "Offre",
      desc,
    };
  }

  const cardName = (info) => `${info.company} - ${info.title}`;

  function authorizeUrl(key, redirectUrl) {
    const params = new URLSearchParams({
      key,
      name: "StageToTrello",
      scope: "read,write",
      expiration: "never",
      response_type: "token",
      callback_method: "fragment",
      return_url: redirectUrl,
    });
    return `https://trello.com/1/authorize?${params}`;
  }

  function tokenFromRedirect(url) {
    const hash = new URL(url).hash.slice(1);
    return new URLSearchParams(hash).get("token") || null;
  }

  return {
    THEMES,
    MAX_PROMPT_CHARS,
    keywordLabels,
    buildPrompt,
    parseLlm,
    parseJobPosting,
    cleanTitle,
    heuristicExtract,
    fromJobPosting,
    hasFullJobPosting,
    finalizeInfo,
    cardName,
    authorizeUrl,
    tokenFromRedirect,
  };
})();

if (typeof module === "object") module.exports = Core;
