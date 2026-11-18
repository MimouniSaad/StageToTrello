# Extension autonome avec connexion Trello - Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le serveur Python par une extension Firefox autonome qui se connecte à Trello via le flux d'autorisation officiel et appelle Groq et Trello directement.

**Architecture:** Fichiers JS classiques (MV2, pas de bundler). La logique pure est dans `extension/lib/*.js` ; chaque fichier définit un objet global (`Core`, `Groq`, `TrelloApi`) et l'exporte aussi via `module.exports` quand `module` existe, pour être testé sous Node. Le popup orchestre ; un script injecté dans l'onglet lit la page.

**Tech Stack:** Firefox WebExtensions MV2, JavaScript sans dépendance, `@mozilla/readability` 0.6.0 (Apache-2.0, vérifié sur npm), tests `node --test` (Node 24).

**Spec:** `docs/superpowers/specs/2026-11-17-trello-connect-design.md`

## Global Constraints

- Aucun message de commit ni fichier ne mentionne Claude.
- `extension/config.js` ne doit jamais être commité (ajouté à `.gitignore` dans la tâche 1).
- Trello : en-tête `Authorization: OAuth oauth_consumer_key="<key>", oauth_token="<token>"`, jamais clé/jeton dans l'URL.
- URL d'autorisation : `https://trello.com/1/authorize` avec `key`, `name=Stage vers Trello`, `scope=read,write`, `expiration=never`, `response_type=token`, `callback_method=fragment`, `return_url=<browser.identity.getRedirectURL()>`.
- Groq : `https://api.groq.com/openai/v1/chat/completions`, `temperature: 0`, `max_tokens: 600`, `reasoning_effort: "low"` si le modèle contient `gpt-oss`, texte tronqué à 10 000 caractères, 3 tours max, attente `retry-after` bornée à 30 s (défaut 5 s).
- Description : JSON-LD si plus de 300 caractères, sinon texte de la page ; tronquée à 16 000.
- Titre de carte : `<Entreprise> - <Poste>`.
- Manifeste : version `2.0`, `data_collection_permissions.required: ["websiteContent"]`.
- Textes de l'interface en français, sans emoji (sauf `✓`/`✗` déjà présents).

## Review Focus

- L'utilisateur ferme ou refuse la fenêtre d'autorisation Trello : aucun jeton stocké, message « Connexion Trello annulée. », bouton toujours visible (test `tokenFromRedirect` sur `#error=...` en tâche 1).
- Jeton révoqué : Trello répond 401, le jeton est effacé et l'écran de connexion revient (test `TrelloError.status === 401` en tâche 3, comportement popup en tâche 5).
- Groq indisponible sur tous les modèles (429 partout) : la carte est quand même créée en mode de secours, pas d'échec (test en tâche 2 : `callGroq` lève ; tâche 5 : le popup bascule sur `heuristicExtract`).
- Page protégée (`about:`, boutique Mozilla) : `executeScript` échoue, message « Impossible de lire cette page. » au lieu d'une erreur brute (tâche 5).
- Readability ne trouve pas d'article (renvoie `null`) : repli sur `document.body.innerText` (tâche 4).

---

### Task 1: Logique pure (`Core`) et outillage de test

**Files:**
- Create: `extension/lib/core.js`, `tests/core.test.js`, `package.json`
- Modify: `.gitignore` (ajouter `extension/config.js`, `node_modules/`, `*.zip`)

**Interfaces:**
- Produces (objet global `Core`) :
  - `KEYWORDS: Record<string, RegExp>` (repris de `add_stage.py`, insensibles à la casse)
  - `MAX_PROMPT_CHARS = 10000`
  - `buildPrompt(url, meta, text, labelNames): string` (texte du prompt de `add_stage.py:llm_extract`, à l'identique)
  - `parseLlm(out, labelNames): {found, company, title, labels}` (ignore `<think>...</think>`, garde seulement les étiquettes présentes dans `labelNames`)
  - `htmlToText(html): string` (`<br>`, `</p>`, `</li>`, `</div>`, `</h1-6>` deviennent `\n` ; balises retirées ; entités `&amp; &lt; &gt; &quot; &#39; &nbsp;` décodées ; 3+ sauts de ligne réduits à 2 ; trim)
  - `parseJobPosting(jsonTexts: string[]): {company, title, desc} | null` (gère objet, liste, `@graph`, `@type` chaîne ou liste ; `desc` via `htmlToText` ; JSON invalide ignoré)
  - `heuristicExtract(url, meta, text, jp, labelNames): {found, company, title, labels}` (comme `add_stage.py:heuristic_extract`, 3 étiquettes max)
  - `finalizeInfo(url, meta, text, jp, info): {found, company, title, labels, desc}` (comme la fin de `build_info`)
  - `cardName(info): string`
  - `authorizeUrl(key, redirectUrl): string`
  - `tokenFromRedirect(url): string | null` (lit `token` dans le fragment)
- `meta` vaut `{title: string, site: string}`.

- [ ] **Step 1: `package.json`** : `{"private": true, "scripts": {"test": "node --test tests/"}}`. Ajouter les entrées à `.gitignore`.
- [ ] **Step 2: Écrire `tests/core.test.js`** (`const Core = require("../extension/lib/core.js")`) :
  - `parseLlm` sur `"<think>x</think>\nFOUND: yes\nCOMPANY: Capgemini\nTITLE: Ingénieur GRC\nLABELS: Cloud, Inconnu"` avec `["Cloud","DevOps"]` donne `{found: true, company: "Capgemini", title: "Ingénieur GRC", labels: ["Cloud"]}`.
  - `parseLlm("FOUND: no", [])` : `found === false`, `company === ""`.
  - `parseJobPosting(['{"@graph":[{"@type":["JobPosting"],"title":"Dev","hiringOrganization":{"name":"Acme"},"description":"<p>A &amp; B</p><ul><li>x</li></ul>"}]}', 'pas du json'])` donne `{company: "Acme", title: "Dev", desc: "A & B\nx"}`.
  - `parseJobPosting(['{"@type":"Organization"}'])` donne `null`.
  - `heuristicExtract("https://www.welcometothejungle.com/x", {title: "Dev Python - Acme | WTTJ", site: ""}, "python docker", null, ["DevOps","Développement logiciel","AI"])` : `company === "Welcometothejungle"`, `title === "Dev Python"`, `labels` contient `"DevOps"` et `"Développement logiciel"`, `found === false`.
  - `finalizeInfo` : JSON-LD de 301 caractères utilisé comme `desc` ; de 299 caractères, `desc === text` ; `company` vide complété par `jp.company`.
  - `authorizeUrl("K", "https://abc.extensions.allizom.org/")` : `new URL(...)` a `origin === "https://trello.com"`, `pathname === "/1/authorize"`, et les paramètres des Global Constraints, `return_url` décodé égal au redirect.
  - `tokenFromRedirect("https://abc.extensions.allizom.org/#token=T123")` donne `"T123"` ; `"https://abc.extensions.allizom.org/#error=denied"` et `"https://abc.extensions.allizom.org/"` donnent `null`.
  - `cardName({company: "Acme", title: "Dev"}) === "Acme - Dev"`.
- [ ] **Step 3:** `npm test` : échec (`core.js` absent).
- [ ] **Step 4:** Implémenter `extension/lib/core.js` ; terminer par `if (typeof module === "object") module.exports = Core;`.
- [ ] **Step 5:** `npm test` : tout passe.
- [ ] **Step 6: Commit** `git add package.json .gitignore extension/lib/core.js tests/core.test.js && git commit -m "Ajoute la logique d'extraction en JavaScript"`

### Task 2: Client Groq

**Files:**
- Create: `extension/lib/groq.js`, `tests/groq.test.js`

**Interfaces:**
- Consumes: `Core.buildPrompt`, `Core.parseLlm` (en Node : `require("./core.js")` si `Core` n'est pas global).
- Produces (objet global `Groq`) :
  - `callGroq(prompt, {apiKey, models, fetchFn = fetch, sleep}): Promise<string>` : essaie chaque modèle ; sur 429/500/502/503/504, erreur réseau ou réponse inutilisable, passe au suivant ; après chaque tour sans succès, `await sleep(waitMs)` ; lève `Error("Erreur API Groq : <dernière erreur>")` après 3 tours. Retire `<think>...</think>` et ignore les réponses vides.
  - `llmExtract(url, meta, text, labelNames, opts): Promise<{found, company, title, labels}>`

- [ ] **Step 1: Écrire `tests/groq.test.js`** avec un `fetchFn` factice qui enregistre les appels et un `sleep` qui enregistre les durées :
  - Premier modèle 503, second 200 avec `{"choices":[{"message":{"content":"FOUND: yes"}}]}` : renvoie `"FOUND: yes"`, 2 appels, aucun `sleep`.
  - Corps envoyé pour `openai/gpt-oss-120b` : `reasoning_effort === "low"`, `temperature === 0`, `max_tokens === 600` ; en-tête `Authorization === "Bearer KEY"`. Pour `llama-3.3-70b-versatile`, pas de `reasoning_effort`.
  - Toujours 429 avec `retry-after: 60` sur 2 modèles : rejette avec un message commençant par `"Erreur API Groq"`, 6 appels, `sleep` appelé 3 fois avec `30000`.
  - `llmExtract` renvoie l'objet de `parseLlm`.
- [ ] **Step 2:** `npm test` : échec.
- [ ] **Step 3:** Implémenter `extension/lib/groq.js`.
- [ ] **Step 4:** `npm test` : tout passe.
- [ ] **Step 5: Commit** `git commit -m "Ajoute le client Groq de l'extension"`

### Task 3: Client Trello

**Files:**
- Create: `extension/lib/trello.js`, `tests/trello.test.js`

**Interfaces:**
- Produces (objet global `TrelloApi`) :
  - `class TrelloError extends Error` avec `status: number` (0 si réseau)
  - `makeTrello({key, token, fetchFn = fetch})` qui renvoie :
    - `request(method, path, params = {}): Promise<any>` : base `https://api.trello.com/1` ; GET : `params` en query string ; POST : `params` en corps JSON (`Content-Type: application/json`) ; en-tête OAuth des Global Constraints ; si `!ok`, lève `TrelloError("Erreur Trello <status> : <texte, 200 caractères max>", status)` ; erreur réseau : `TrelloError("Trello injoignable.", 0)`.
    - `listBoards(): Promise<{id, name, lists: {id, name}[]}[]>` (`/members/me/boards`, `fields=name`, `filter=open`, `lists=open`)
    - `boardLabels(boardId): Promise<Record<string, string>>` (nom vers id, premier gardé, étiquettes sans nom ignorées)
    - `createCard({listId, name, desc, labelIds, url}): Promise<{shortUrl}>` : POST `/cards` (`idList`, `name`, `desc` tronquée à 16 000, `idLabels` joints par virgule), puis POST `/cards/<id>/attachments` avec `url` ; l'échec de la pièce jointe est journalisé avec `console.warn`, pas levé.

- [ ] **Step 1: Écrire `tests/trello.test.js`** :
  - L'en-tête vaut exactement `OAuth oauth_consumer_key="K", oauth_token="T"` et aucune URL appelée ne contient `K` ni `T`.
  - Réponse 401 avec le texte `invalid token` : rejette avec `TrelloError`, `status === 401`, message contenant `401` et `invalid token`.
  - `boardLabels` sur `[{id:"1",name:"Cloud"},{id:"2",name:""},{id:"3",name:"Cloud"}]` donne `{Cloud: "1"}`.
  - `createCard` : le premier appel est un POST `/cards` dont le corps JSON a `desc.length === 16000` pour une entrée de 20 000 ; si la pièce jointe renvoie 500, la promesse résout quand même `{shortUrl}`.
- [ ] **Step 2:** `npm test` : échec.
- [ ] **Step 3:** Implémenter `extension/lib/trello.js`.
- [ ] **Step 4:** `npm test` : tout passe.
- [ ] **Step 5: Commit** `git commit -m "Ajoute le client Trello de l'extension"`

### Task 4: Lecture de la page, configuration, manifeste, nettoyage

**Files:**
- Create: `extension/lib/Readability.js` (copie de `Readability.js` du paquet npm `@mozilla/readability@0.6.0`, avec son en-tête de licence), `extension/lib/page.js`, `extension/config.example.js`, `extension/config.js` (local, non commité)
- Modify: `extension/manifest.json`
- Delete: `server.py`, `add_stage.py`, `requirements.txt`, `systemd/`, `.env.example`, `extension/options.html`, `extension/options.js`

**Interfaces:**
- Produces : `page.js` est injecté après `Readability.js` ; sa dernière expression est une IIFE qui renvoie `{url, meta: {title, site}, text, ldjson: string[]}`. `text` vient de `new Readability(document.cloneNode(true)).parse()?.textContent`, sinon de `document.body.innerText`, avec les espaces normalisés.
- Produces : `config.js` définit un global `CONFIG = {TRELLO_KEY, GROQ_API_KEY, GROQ_MODELS: string[], DEFAULT_LIST: "Stages"}` ; `config.example.js` a la même forme avec des valeurs vides et `GROQ_MODELS: ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]`.

- [ ] **Step 1:** `npm pack @mozilla/readability@0.6.0` dans le scratchpad, extraire, copier `package/Readability.js` vers `extension/lib/Readability.js`.
- [ ] **Step 2:** Écrire `page.js`, `config.example.js` et `config.js` (rempli à partir des valeurs `TRELLO_KEY`, `GROQ_API_KEY`, `GROQ_MODELS` du `.env` local).
- [ ] **Step 3: Manifeste** : version `2.0` ; permissions `["activeTab", "storage", "identity", "https://api.trello.com/*", "https://api.groq.com/*"]` ; `options_ui` retiré ; `data_collection_permissions` inchangé (`websiteContent`).
- [ ] **Step 4:** `git rm` des fichiers à supprimer.
- [ ] **Step 5: Vérifier** : `git check-ignore extension/config.js` affiche le chemin ; `npx --yes web-ext@8 lint --source-dir extension` : 0 erreur.
- [ ] **Step 6: Commit** `git commit -m "Remplace le serveur par la lecture de page dans l'extension"`

### Task 5: Popup avec connexion Trello

**Files:**
- Modify: `extension/popup.html`, `extension/popup.js`

**Interfaces:**
- Consumes : `CONFIG`, `Core.*`, `Groq.llmExtract`, `TrelloApi.makeTrello`, `TrelloApi.TrelloError`.
- `popup.html` charge dans l'ordre `config.js`, `lib/core.js`, `lib/groq.js`, `lib/trello.js`, `popup.js`. Deux sections : `#login` (texte court et bouton `#connect` « Connecter Trello ») et `#main` (écran actuel, plus un lien `#logout` « Déconnecter »).

- [ ] **Step 1: Connexion** : `connect()` appelle `browser.identity.launchWebAuthFlow({url: Core.authorizeUrl(CONFIG.TRELLO_KEY, browser.identity.getRedirectURL()), interactive: true})`, extrait le jeton avec `Core.tokenFromRedirect`, le stocke dans `storage.local` (clé `trelloToken`) puis lance `init()`. Si le flux est rejeté ou le jeton absent : « Connexion Trello annulée. ». Si `CONFIG` ou `CONFIG.TRELLO_KEY` manque : « config.js manquant : voir le README. ».
- [ ] **Step 2: Déconnexion** : `#logout` retire `trelloToken` et affiche `#login`. Toute `TrelloError` avec `status === 401` fait de même, avec le message « Session Trello expirée, reconnecte-toi. ».
- [ ] **Step 3: `init()`** : même comportement qu'aujourd'hui, avec `listBoards()` à la place de `GET /boards` ; la liste par défaut est `CONFIG.DEFAULT_LIST` ; il n'y a plus de tableau par défaut (dernier choix mémorisé, sinon le premier).
- [ ] **Step 4: `add()`** : `executeScript(tab.id, {file: "lib/Readability.js"})` puis `{file: "lib/page.js"}` (échec : « Impossible de lire cette page. ») ; `jp = Core.parseJobPosting(page.ldjson)` ; `labels = boardLabels(board)` ; `Groq.llmExtract` si `CONFIG.GROQ_API_KEY`, sinon ou en cas d'erreur `Core.heuristicExtract` ; `Core.finalizeInfo` ; si `!found` : « Aucune offre trouvée sur cette page. » ; sinon `createCard` et affichage de `✓ <nom>`.
- [ ] **Step 5: Vérifier dans Firefox** (`about:debugging`, chargement temporaire) : connexion, choix du tableau et de la liste, création d'une carte sur une vraie offre, déconnexion, annulation de la fenêtre d'autorisation, page `about:addons`. Prérequis : URL de redirection ajoutée aux « Allowed origins » de l'app Trello.
- [ ] **Step 6: Commit** `git commit -m "Ajoute la connexion Trello dans le popup"`

### Task 6: README

**Files:**
- Modify: `README.md`

- [ ] **Step 1:** Réécrire le README : présentation, schéma (extension vers Groq et Trello), contenu du dépôt, installation côté propriétaire (créer l'app Trello, copier `config.example.js` en `config.js`, récupérer l'URL de redirection avec `browser.identity.getRedirectURL()` dans la console du popup et l'ajouter aux « Allowed origins », zip et signature), utilisation côté utilisateur (installer, « Connecter Trello »), tests (`npm test`), sécurité (clé Groq lisible dans le paquet, jamais sur GitHub ; jeton Trello stocké localement ; données envoyées à Groq et Trello), limites et dépannage.
- [ ] **Step 2:** `grep -niE "server.py|add_stage|systemd|STAGE_TOKEN|\.env" README.md` : aucun résultat.
- [ ] **Step 3: Commit** `git commit -m "Met à jour le README pour l'extension autonome"`
