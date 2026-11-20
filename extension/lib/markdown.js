// Conversion du HTML d'une offre en Markdown propre pour la description de la carte Trello :
// titres, paragraphes, gras, italique, listes et liens conservés ; scripts, images,
// formulaires et texte caché ignorés. Sans dépendance : fonctionne dans Firefox et sous Node.
const Markdown = (() => {
  const MAX_CHARS = 16000; // limite Trello : 16 384

  const VOID = new Set([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
  ]);
  const RAW = new Set(["script", "style", "textarea", "title"]);
  const IGNORED = new Set([
    "script",
    "style",
    "noscript",
    "template",
    "head",
    "title",
    "img",
    "svg",
    "iframe",
    "object",
    "embed",
    "video",
    "audio",
    "canvas",
    "picture",
    "form",
    "button",
    "input",
    "select",
    "textarea",
    "nav",
    "footer",
    "map",
  ]);
  const BLOCK = new Set([
    "p",
    "div",
    "section",
    "article",
    "main",
    "header",
    "aside",
    "figure",
    "figcaption",
    "address",
    "center",
    "details",
    "summary",
    "body",
    "html",
  ]);

  // Les « # » et « > » produits par la conversion sont marqués pour ne pas être échappés.
  const HASH = "\u0001";
  const QUOTE = "\u0002";

  const ENTITIES = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    ensp: " ",
    emsp: " ",
    thinsp: " ",
    shy: "",
    zwj: "",
    zwnj: "",
    laquo: "«",
    raquo: "»",
    lsquo: "‘",
    rsquo: "’",
    ldquo: "“",
    rdquo: "”",
    sbquo: "‚",
    bdquo: "„",
    hellip: "…",
    ndash: "–",
    mdash: "—",
    bull: "•",
    middot: "·",
    euro: "€",
    deg: "°",
    times: "×",
    copy: "©",
    reg: "®",
    trade: "™",
    oelig: "œ",
    OElig: "Œ",
    aelig: "æ",
    AElig: "Æ",
    szlig: "ß",
  };
  // Lettres accentuées : &eacute; &Agrave; &ccedil; &ouml; …
  const ACCENTS = { acute: "́", grave: "̀", circ: "̂", uml: "̈", cedil: "̧", tilde: "̃", ring: "̊" };

  function decodeEntities(s) {
    return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
      if (e[0] === "#") {
        const code =
          e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        try {
          return String.fromCodePoint(code);
        } catch {
          return m;
        }
      }
      if (e in ENTITIES) return ENTITIES[e];
      const acc = e.match(/^([a-z])(acute|grave|circ|uml|cedil|tilde|ring)$/i);
      if (acc) return (acc[1] + ACCENTS[acc[2]]).normalize("NFC");
      return m;
    });
  }

  // ---------- Analyse du HTML en arbre (tolérante aux balises mal fermées) ----------
  function parseAttrs(src) {
    const attrs = {};
    const re = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let m;
    while ((m = re.exec(src)))
      attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
    return attrs;
  }

  function parse(html) {
    const root = { tag: "#root", attrs: {}, children: [] };
    const stack = [root];
    const top = () => stack[stack.length - 1];
    const re =
      /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\?[^>]*>|<\/\s*([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g;
    let last = 0;
    let m;
    while ((m = re.exec(html))) {
      if (m.index > last) top().children.push({ text: html.slice(last, m.index) });
      last = re.lastIndex;
      if (m[1]) {
        // balise fermante
        const tag = m[1].toLowerCase();
        const i = stack.map((n) => n.tag).lastIndexOf(tag);
        if (i > 0) stack.length = i;
      } else if (m[2]) {
        // balise ouvrante
        const tag = m[2].toLowerCase();
        const node = { tag, attrs: parseAttrs(m[3] || ""), children: [] };
        // Un <p> ou un <li> ouvert est fermé implicitement par le suivant.
        if ((tag === "p" || tag === "li") && top().tag === tag) stack.pop();
        top().children.push(node);
        if (RAW.has(tag)) {
          // contenu brut : jusqu'à la balise fermante
          const close = html.toLowerCase().indexOf(`</${tag}`, last);
          const end = close === -1 ? html.length : close;
          node.children.push({ text: html.slice(last, end) });
          re.lastIndex = close === -1 ? html.length : html.indexOf(">", close) + 1 || html.length;
          last = re.lastIndex;
        } else if (!VOID.has(tag) && !m[4]) {
          stack.push(node);
        }
      }
    }
    if (last < html.length) top().children.push({ text: html.slice(last) });
    return root;
  }

  // ---------- Rendu Markdown ----------
  const isHidden = (n) =>
    "hidden" in n.attrs ||
    n.attrs["aria-hidden"] === "true" ||
    /display\s*:\s*none|visibility\s*:\s*hidden/i.test(n.attrs.style || "");

  function escapeText(s) {
    return s
      .replace(/\\/g, "\\\\")
      .replace(/([*`])/g, "\\$1")
      .replace(/(^|[\s(])_|_(?=[\s.,;:!?)]|$)/g, (m) => m.replace("_", "\\_"))
      .replace(/\[/g, "\\[")
      .replace(/\]/g, "\\]");
  }

  // Applique une marque (**, _) sans y inclure les espaces de bord.
  function wrap(inner, mark) {
    const t = inner.trim();
    if (!t) return inner;
    const lead = inner.match(/^\s*/)[0];
    const trail = inner.match(/\s*$/)[0];
    return `${lead}${mark}${t.replace(/\n+/g, " ")}${mark}${trail}`;
  }

  const trimLines = (s) =>
    s
      .split("\n")
      .map((l) => l.trim())
      .join("\n");

  function minHeading(node, min = 7) {
    if (!node.tag) return min;
    if (IGNORED.has(node.tag) || isHidden(node)) return min;
    const h = node.tag.match(/^h([1-6])$/);
    if (h) min = Math.min(min, Number(h[1]));
    return node.children.reduce((acc, c) => minHeading(c, acc), min);
  }

  function render(node, ctx) {
    if (!node.tag) {
      const text = decodeEntities(node.text);
      return ctx.pre ? text : escapeText(text.replace(/\s+/g, " "));
    }
    const { tag } = node;
    if (IGNORED.has(tag) || isHidden(node)) return "";
    const kids = (c = ctx) => node.children.map((n) => render(n, c)).join("");

    const h = tag.match(/^h([1-6])$/);
    if (h) {
      const level = Math.min(6, 2 + Number(h[1]) - ctx.minHeading);
      const title = kids().replace(/\s+/g, " ").replace(/\*\*/g, "").trim();
      return title ? `\n\n${HASH.repeat(level)} ${title}\n\n` : "";
    }
    switch (tag) {
      case "br":
        return "\n";
      case "hr":
        return "\n\n---\n\n";
      case "strong":
      case "b":
        return wrap(kids(), "**");
      case "em":
      case "i":
      case "cite":
        return wrap(kids(), "_");
      case "code":
        return ctx.pre ? kids() : wrap(kids(), "`");
      case "pre":
        return `\n\n\`\`\`\n${kids({ ...ctx, pre: true }).replace(/^\n+|\s+$/g, "")}\n\`\`\`\n\n`;
      case "a": {
        const text = kids().trim();
        const href = (node.attrs.href || "").trim();
        if (!/^https?:\/\//i.test(href)) return kids();
        if (!text || text === escapeText(href)) return ` ${href} `;
        const safeHref = href.replace(/[()\s]/g, (c) => ({ "(": "%28", ")": "%29" })[c] || "%20");
        return `[${text.replace(/\n+/g, " ")}](${safeHref})`;
      }
      case "ul":
      case "ol": {
        let n = Number(node.attrs.start) || 1;
        const items = node.children
          .filter((c) => c.tag === "li" && !isHidden(c))
          .map((li) => {
            const marker = tag === "ol" ? `${n++}. ` : "- ";
            const lines = trimLines(render({ ...li, tag: "#li" }, ctx))
              .replace(/\n{2,}/g, "\n")
              .trim()
              .split("\n");
            if (!lines[0]) return "";
            return [
              marker + lines[0],
              ...lines.slice(1).map((l) => " ".repeat(marker.length) + l),
            ].join("\n");
          })
          .filter(Boolean);
        return items.length ? `\n\n${items.join("\n")}\n\n` : "";
      }
      case "#li":
        return kids();
      case "li":
        return `\n\n- ${kids().trim()}\n\n`; // <li> hors liste
      case "blockquote": {
        const inner = trimLines(kids())
          .replace(/\n{3,}/g, "\n\n")
          .trim();
        return inner
          ? `\n\n${inner
              .split("\n")
              .map((l) => `${QUOTE} ${l}`.trimEnd())
              .join("\n")}\n\n`
          : "";
      }
      case "dt":
        return `\n\n${wrap(kids(), "**")}\n`;
      case "dd":
        return `\n${kids()}\n`;
      case "tr": {
        const cells = node.children
          .filter((c) => c.tag === "td" || c.tag === "th")
          .map((c) => render(c, ctx).replace(/\s+/g, " ").trim())
          .filter(Boolean);
        return cells.length ? `\n${cells.join(" · ")}\n` : "";
      }
      case "table":
        return `\n\n${kids()}\n\n`;
      default:
        return BLOCK.has(tag) ? `\n\n${kids()}\n\n` : kids();
    }
  }

  // ---------- Mise en forme finale, ligne par ligne ----------
  const BULLET = /^(?:[•·▪◦‣●○■□➢➤►▶✓✔→–—]|\\\*)\s+/;
  const LIST = /^(\s*)(?:[-*+]|\d+[.)])\s/;

  function isFauxTitle(line) {
    const bold = line.match(/^\*\*([^*]{2,80}?)\s*:?\s*\*\*\s*:?$/);
    if (bold) return bold[1];
    if (LIST.test(line) || line.startsWith(HASH) || line.length > 60) return null;
    // Ligne courte terminée par « : » (« Vos missions : »), mais pas une phrase (« …, tu participeras à : »)
    const colon = line.match(/^([^:]{2,58}?)\s*:$/);
    if (colon && !/[.!?,;*]/.test(colon[1]) && colon[1].split(/\s+/).length <= 6) return colon[1];
    // Ligne courte EN MAJUSCULES (« PROFIL RECHERCHÉ ») : remise en casse normale
    const letters = line.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "");
    if (
      letters.length >= 4 &&
      line.length <= 50 &&
      line === line.toUpperCase() &&
      /[A-ZÀ-Ý]/.test(line)
    ) {
      const lower = line.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    }
    return null;
  }

  function finish(md, fauxLevel) {
    const out = [];
    let inCode = false; // les blocs de code sont recopiés tels quels
    for (let line of md.split("\n")) {
      if (line.trim() === "```") {
        inCode = !inCode;
        out.push("```");
        continue;
      }
      if (inCode) {
        out.push(line);
        continue;
      }
      line = line.replace(/[ \t]+$/, "");
      if (!LIST.test(line)) line = line.trim(); // garder l'indentation des sous-listes
      line = line.replace(BULLET, "- ");
      const title = isFauxTitle(line);
      if (title) line = `\n${HASH.repeat(fauxLevel)} ${title.replace(/\\([*_`[\]])/g, "$1")}\n`;
      else if (/^[#>]/.test(line)) line = `\\${line}`; // texte de l'offre, pas de la mise en forme
      out.push(line);
    }
    return out
      .join("\n")
      .replace(new RegExp(HASH, "g"), "#")
      .replace(new RegExp(QUOTE, "g"), ">")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function truncate(md, max = MAX_CHARS) {
    if (md.length <= max) return md;
    const limit = max - 3;
    let cut = md.lastIndexOf("\n\n", limit);
    if (cut < limit * 0.5) cut = md.lastIndexOf("\n", limit);
    if (cut < limit * 0.5) cut = md.lastIndexOf(" ", limit);
    if (cut <= 0) cut = limit;
    return `${md.slice(0, cut).trimEnd()}\n\n…`;
  }

  function htmlToMarkdown(input) {
    let html = String(input || "");
    // Description encodée deux fois (« &lt;p&gt;… », fréquent dans les JSON-LD) : on décode d'abord.
    if (!/<[a-z!/]/i.test(html) && /&lt;\/?[a-z]/i.test(html)) html = decodeEntities(html);
    if (!/<[a-z!/]/i.test(html)) {
      // Texte brut : les retours à la ligne sont la seule structure.
      const text = decodeEntities(html)
        .split("\n")
        .map((l) => escapeText(l.trim()))
        .join("\n");
      return truncate(finish(text, 2));
    }
    const root = parse(html);
    const min = minHeading(root);
    const ctx = { minHeading: min === 7 ? 1 : min, pre: false };
    const fauxLevel = min === 7 ? 2 : 3; // sans vrais titres, les « faux titres » deviennent des ##
    return truncate(finish(render(root, ctx), fauxLevel));
  }

  return { htmlToMarkdown, truncate, decodeEntities, MAX_CHARS };
})();

if (typeof module === "object") module.exports = Markdown;
