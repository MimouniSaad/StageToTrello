// Logique pure : prompt, lecture des réponses, données structurées, mode de secours.
const Core = (() => {
  const MAX_PROMPT_CHARS = 10000;   // reste sous la limite de tokens par minute de l'offre gratuite Groq
  const MAX_DESC_CHARS = 16000;     // la limite Trello est de 16 384

  // Mots-clés du mode de secours (sans IA) : adapte les noms à tes étiquettes Trello
  const KEYWORDS = {
    "DevSecOps": /devsecops|sast|dast|sécurité.{0,20}(ci\/cd|pipeline)/i,
    "DevOps": /devops|ci\/cd|jenkins|gitlab|docker|kubernetes|terraform|ansible|helm/i,
    "Cloud": /\baws\b|azure|gcp|google cloud|cloud/i,
    "Cybersécurité": /cyber|sécurité|pentest|\bsoc\b|siem|owasp|\bgrc\b|iso 27001/i,
    "Réseaux": /réseau|cisco|routage|vlan|firewall|\bwan\b|\blan\b/i,
    "AI": /\bia\b|\bai\b|machine learning|llm|deep learning|intelligence artificielle/i,
    "Système et Infra": /linux|windows server|virtualisation|vmware|proxmox|active directory|infrastructure|sysadmin/i,
    "Développement logiciel": /développeur|développement|python|java\b|react|angular|node|backend|frontend|full.?stack/i,
    "Testeur": /testeur|\bqa\b|recette|test logiciel|selenium|cypress|qualité logicielle/i,
    "Support IT": /support|helpdesk|help desk|assistance utilisateur|technicien|\bitsm\b|glpi/i,
    "PowerPlaterforme dev": /power apps|power automate|power platform|power bi/i,
  };

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
    const labels = field("LABELS").split(",").map((l) => l.trim())
      .filter((l) => l && labelNames.includes(l));
    return {
      found: field("FOUND").toLowerCase().startsWith("y"),
      company: field("COMPANY"),
      title: field("TITLE"),
      labels,
    };
  }

  function htmlToText(html) {
    const entities = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };
    return html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|li|div|h[1-6])\s*>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e) => entities[e])
      .split("\n").map((l) => l.trim()).join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
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

  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Intitulé propre pour « Entreprise - Poste » : retire les mentions H/F, la durée,
  // « (stage de fin d'études) » et la ville connue, puis les séparateurs orphelins.
  function cleanTitle(title, city = "") {
    const original = String(title || "").trim();
    let t = original
      .replace(/[([]?\s*(?<![\p{L}])[hfmw]\s*\/\s*[hfmw](?:\s*\/\s*(?:x|d|nb|n))?(?![\p{L}])\s*[)\]]?/giu, " ")
      .replace(/[([]?\s*\b\d{1,2}\s*mois\b\s*[)\]]?/gi, " ")
      .replace(/[([]\s*stage de fin d['’]études\s*[)\]]/gi, " ");
    if (city) {
      const c = escapeRe(city);
      t = t.replace(new RegExp(`\\(\\s*${c}[^()]*\\)`, "gi"), " ")
           .replace(new RegExp(`\\s*[-–|,]\\s*${c}(?:\\s*\\(?\\d{2,5}\\)?)?\\s*(?=$|[-–|,(])`, "gi"), " ");
    }
    t = t.replace(/\(\s*\)|\[\s*\]/g, " ")
         .replace(/\s*([-–|])\s*(?:[-–|]\s*)+/g, " $1 ")
         .replace(/\s+/g, " ")
         .replace(/^[\s\-–|,:]+|[\s\-–|,:]+$/g, "")
         .trim();
    return t || original;
  }

  function parseJobPosting(jsonTexts) {
    for (const raw of jsonTexts) {
      let data;
      try { data = JSON.parse(raw); } catch { continue; }
      const items = Array.isArray(data) ? data
        : data && typeof data === "object" ? (data["@graph"] || [data]) : [];
      for (const it of items) {
        if (!it || typeof it !== "object" || !isJobPosting(it)) continue;
        const org = it.hiringOrganization || {};
        const company = typeof org === "object" ? (org.name || "") : String(org);
        return {
          company: String(company).trim(),
          title: String(it.title || "").trim(),
          desc: htmlToText(String(it.description || "")),
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
    const title = (jp && jp.title && cleanTitle(jp.title, jp.city))
      || meta.title.split(/\s[-|–]\s/)[0] || meta.title;
    const labels = Object.keys(KEYWORDS)
      .filter((l) => labelNames.includes(l) && KEYWORDS[l].test(`${title} ${text}`))
      .slice(0, 3);
    // Sans IA, seule une offre publiée en données structurées (JobPosting) est fiable :
    // une page longue (liste de résultats, accueil, article) ne suffit pas.
    const found = Boolean(jp && (jp.company || jp.title));
    return { found, company, title, labels, fallback: true };
  }

  // Page avec un JobPosting complet (entreprise et intitulé) : pas besoin de l'IA.
  // Les étiquettes sont choisies par mots-clés ; ces ajouts ne consomment pas de quota.
  function fromJobPosting(url, meta, text, jp, labelNames) {
    return { ...heuristicExtract(url, meta, text, jp, labelNames), fallback: false, source: "jobposting" };
  }

  const hasFullJobPosting = (jp) => Boolean(jp && jp.company && jp.title);

  function finalizeInfo(url, meta, text, jp, info) {
    return {
      ...info,
      company: info.company || (jp && jp.company) || meta.site || domainName(url),
      title: info.title || (jp && jp.title) || meta.title || "Offre",
      desc: jp && jp.desc.length > 300 ? jp.desc : text,
    };
  }

  const cardName = (info) => `${info.company} - ${info.title}`;

  function authorizeUrl(key, redirectUrl) {
    const params = new URLSearchParams({
      key, name: "StageToTrello", scope: "read,write", expiration: "never",
      response_type: "token", callback_method: "fragment", return_url: redirectUrl,
    });
    return `https://trello.com/1/authorize?${params}`;
  }

  function tokenFromRedirect(url) {
    const hash = new URL(url).hash.slice(1);
    return new URLSearchParams(hash).get("token") || null;
  }

  return {
    KEYWORDS, MAX_PROMPT_CHARS, MAX_DESC_CHARS, buildPrompt, parseLlm, htmlToText,
    parseJobPosting, cleanTitle, heuristicExtract, fromJobPosting, hasFullJobPosting,
    finalizeInfo, cardName, authorizeUrl, tokenFromRedirect,
  };
})();

if (typeof module === "object") module.exports = Core;
