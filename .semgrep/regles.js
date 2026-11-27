// Exemples de test des règles de .semgrep/regles.yml :
//   semgrep --test --config .semgrep/regles.yml .semgrep/regles.js
// « ruleid » : la ligne suivante doit être détectée ; « ok » : elle ne doit pas l'être.
/* eslint-disable */

// ---------- extension-pas-de-html-brut ----------
// ruleid: extension-pas-de-html-brut
el.innerHTML = titre;
// ruleid: extension-pas-de-html-brut
document.body.innerHTML = "<b>" + location.hash + "</b>";
// ruleid: extension-pas-de-html-brut
el.outerHTML = html;
// ruleid: extension-pas-de-html-brut
el.insertAdjacentHTML("beforeend", html);
// ruleid: extension-pas-de-html-brut
document.write(html);
// ruleid: extension-pas-de-html-brut
eval(code);
// ruleid: extension-pas-de-html-brut
const f = new Function("a", code);
// ruleid: extension-pas-de-html-brut
setTimeout("alert(1)", 100);

// ok: extension-pas-de-html-brut
el.textContent = titre;
// ok: extension-pas-de-html-brut
const html2 = el.innerHTML;
// ok: extension-pas-de-html-brut
el.appendChild(document.createElement("li"));
// ok: extension-pas-de-html-brut
setTimeout(() => rafraichir(), 100);

// ---------- relais-pas-de-secret-dans-les-journaux ----------
// ruleid: relais-pas-de-secret-dans-les-journaux
console.log("jeton", token);
// ruleid: relais-pas-de-secret-dans-les-journaux
console.error(`clé : ${env.GROQ_API_KEY}`);
// ruleid: relais-pas-de-secret-dans-les-journaux
console.warn(request.headers.get("Authorization"));

// ok: relais-pas-de-secret-dans-les-journaux
console.warn(`Groq ${model} : HTTP ${r.status}`);
// ok: relais-pas-de-secret-dans-les-journaux
console.error(`Erreur interne : ${e && e.name}`);
