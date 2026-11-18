// Injecté dans l'onglet après Readability.js. Ne déclare rien au niveau global :
// le script peut être injecté plusieurs fois dans la même page.
(() => {
  const meta = (prop) => {
    const el = document.querySelector(`meta[property="${prop}"]`);
    return el && el.content ? el.content.trim() : "";
  };
  const clean = (s) => s.replace(/[ \t ]+/g, " ").replace(/\s*\n\s*\n\s*/g, "\n\n").trim();

  let text = "";
  let html = "";   // article mis en forme, converti en Markdown pour la description de la carte
  try {
    const article = new Readability(document.cloneNode(true)).parse();
    text = article && article.textContent ? article.textContent : "";
    html = article && article.content ? article.content.slice(0, 300000) : "";
  } catch (e) { /* page atypique : repli ci-dessous */ }
  if (!text.trim()) text = document.body ? document.body.innerText : "";

  return {
    url: location.href,
    meta: { title: meta("og:title") || document.title.trim(), site: meta("og:site_name") },
    text: clean(text),
    html,
    ldjson: [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map((s) => s.textContent),
  };
})();
