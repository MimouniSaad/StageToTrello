# Stage → Trello

Extension Firefox + petit serveur local qui transforment une offre de stage (ou d'emploi) ouverte dans le navigateur en **carte Trello complète, en un clic**.

Un clic sur le bouton (ou `Alt+Shift+S`) et une carte est créée dans ton tableau Trello avec :

- un **titre normalisé** : `Entreprise - Poste` (ex. `Capgemini - Ingénieur GRC`) ;
- la **description de l'offre** (missions, profil, avantages…), reprise des données structurées de la page ou, à défaut, de son texte principal ;
- le **lien de l'offre en pièce jointe** ;
- des **étiquettes** (DevOps, Cloud, Cybersécurité…) choisies automatiquement.

L'entreprise, l'intitulé du poste et les étiquettes sont déterminés par un modèle hébergé chez Groq (offre gratuite), ce qui fonctionne sur n'importe quel site sans règles à écrire site par site.

---

## Sommaire

1. [Comment ça marche](#comment-ça-marche)
2. [Contenu du dépôt](#contenu-du-dépôt)
3. [Prérequis](#prérequis)
4. [Installation](#installation)
5. [Utilisation](#utilisation)
6. [Configuration](#configuration)
7. [Détail du fonctionnement](#détail-du-fonctionnement)
8. [Sécurité et confidentialité](#sécurité-et-confidentialité)
9. [Limites connues](#limites-connues)
10. [Dépannage](#dépannage)
11. [Licence](#licence)

---

## Comment ça marche

Une extension Firefox ne peut pas lancer directement un script Python. Le projet est donc composé de deux parties qui communiquent en local :

```
 Firefox                         Ta machine (127.0.0.1:8765)                Services externes
┌────────────────┐  GET /boards ┌──────────────────────────┐
│  Extension     │  POST /add   │  server.py (HTTP local)  │
│  (popup)       │ ───────────▶ │          │               │
│                │ ◀─────────── │          ▼               │   ┌──────────────┐
│ tableau, liste │  {ok, carte} │  add_stage.py            │──▶│ API Groq     │ extraction
└────────────────┘              │   1. nettoyage de page   │   └──────────────┘
                                │   2. extraction par LLM  │   ┌──────────────┐
                                │   3. création de carte   │──▶│ API Trello   │ carte + labels
                                └──────────────────────────┘   └──────────────┘
```

1. Tu ouvres le popup de l'extension depuis la page de l'offre ; il charge tes tableaux et listes Trello via le serveur local.
2. Tu choisis le tableau et la liste, puis tu cliques sur **Ajouter à Trello** (ou l'envoi est automatique si « Envoyer dès l'ouverture » est coché).
3. L'extension envoie au serveur local **l'URL**, **le HTML de la page tel que ton navigateur l'affiche** (donc même les pages en JavaScript ou nécessitant une connexion), le tableau et la liste.
4. Le serveur nettoie la page et demande à Groq l'entreprise, l'intitulé du poste et les étiquettes. La description vient des données structurées `JobPosting` (JSON-LD) de la page si elles existent, sinon du texte principal extrait.
5. Il crée la carte, ajoute le lien en pièce jointe et renvoie le résultat, affiché dans le popup (`✓` ou `✗` avec le message d'erreur).

`add_stage.py` peut aussi s'utiliser seul en ligne de commande, sans l'extension :

```bash
python add_stage.py "https://exemple.com/offre-de-stage"
```

## Contenu du dépôt

```
.
├── add_stage.py              # Récupération de la page, extraction par Groq, création de la carte Trello
├── server.py                 # Serveur HTTP local (127.0.0.1) appelé par l'extension
├── requirements.txt          # Dépendances Python
├── .env.example              # Modèle de configuration (à copier en .env)
├── systemd/
│   └── stage-server.service  # Service utilisateur pour démarrer le serveur automatiquement (Linux)
└── extension/
    ├── manifest.json         # Manifeste Firefox (Manifest V2)
    ├── popup.html            # Popup : choix du tableau et de la liste, bouton d'envoi
    ├── popup.js              # Logique du popup : charge les tableaux, envoie la page au serveur, affiche le résultat
    ├── options.html          # Page de réglages (saisie du token)
    ├── options.js            # Enregistrement du token dans le stockage local de l'extension
    └── icon.svg              # Icône
```

## Prérequis

- **Linux** (testé sur Ubuntu 24.04) ; le serveur Python est portable, seul le service `systemd` est spécifique à Linux.
- **Python 3.10+** avec `venv`.
- **Firefox** (l'extension utilise l'API `browser.*` / Manifest V2).
- Un compte **Trello** et un tableau avec une liste destinée aux offres (par défaut `Stages`).
- Une clé gratuite de l'**API Groq** : <https://console.groq.com/keys>.
- Pour une installation permanente de l'extension : un compte gratuit sur <https://addons.mozilla.org/developers/> (signature « non listée »).

## Installation

### 1. Cloner et installer les dépendances

```bash
git clone https://github.com/<ton-compte>/stage-trello.git ~/stage-trello
cd ~/stage-trello

sudo apt install python3-full python3-venv zip
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Optionnel mais recommandé : navigateur headless pour les pages qui chargent leur contenu en JavaScript
playwright install chromium
```

`requirements.txt` :

```
requests
trafilatura
beautifulsoup4
playwright
```

### 2. Préparer Trello

1. Crée une application sur <https://trello.com/power-ups/admin> (choisis « **n'utilise pas les fonctionnalités Power-up** »).
2. Dans la section **API Key**, génère une clé, puis clique sur le lien **Token** pour générer un jeton manuellement (autorise lecture et écriture).
3. Récupère l'ID de ton tableau par défaut (optionnel : le popup permet aussi de le choisir) :

   ```bash
   AUTH="Authorization: OAuth oauth_consumer_key=\"$TRELLO_KEY\", oauth_token=\"$TRELLO_TOKEN\""
   curl -H "$AUTH" "https://api.trello.com/1/members/me/boards?fields=name"
   ```

4. Vérifie les noms de tes listes et étiquettes :

   ```bash
   curl -H "$AUTH" "https://api.trello.com/1/boards/<ID_TABLEAU>/lists?fields=name"
   curl -H "$AUTH" "https://api.trello.com/1/boards/<ID_TABLEAU>/labels?fields=name"
   ```

5. Les étiquettes proposées au modèle sont lues directement sur le tableau : rien à configurer. Dans `add_stage.py`, adapte seulement `KEYWORDS`, utilisé en mode de secours (sans clé Groq) ; ses noms doivent correspondre à tes étiquettes.

### 3. Configurer l'environnement

```bash
cp .env.example .env
```

Génère un token pour sécuriser le serveur local :

```bash
openssl rand -hex 16
```

Puis remplis `.env` (**sans** `export` et sans guillemets, pour rester compatible avec `systemd`) :

```bash
TRELLO_KEY=...
TRELLO_TOKEN=...
TRELLO_BOARD=<ID du tableau par défaut>
TRELLO_LIST=Stages
GROQ_API_KEY=...
GROQ_MODELS=openai/gpt-oss-120b,openai/gpt-oss-20b
STAGE_TOKEN=<le token généré>
```

### 4. Tester en ligne de commande

```bash
set -a; source .env; set +a
python add_stage.py "https://lien-direct-d-une-offre"
```

Tu dois voir `Carte créée : https://trello.com/c/...`.

### 5. Lancer le serveur local

À la main (arrêt avec `Ctrl+C`, jamais `Ctrl+Z`) :

```bash
set -a; source .env; set +a
python server.py
```

Ou automatiquement avec `systemd` (le fichier suppose que le dépôt est dans `~/stage-trello` ; sinon, adapte les chemins dans `systemd/stage-server.service`) :

```bash
mkdir -p ~/.config/systemd/user
cp systemd/stage-server.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now stage-server
systemctl --user status stage-server     # doit afficher "active (running)"

# Démarrer dès le boot, avant même la connexion à la session
sudo loginctl enable-linger $USER
```

Test du serveur (la réponse doit être `token invalide`, ce qui prouve que le serveur répond et qu'il est protégé) :

```bash
curl -s --max-time 5 -X POST http://127.0.0.1:8765/add -H "X-Token: mauvais" -d '{}'
```

### 6. Installer l'extension Firefox

**Pour tester (temporaire, disparaît au redémarrage de Firefox)**

1. Ouvre `about:debugging#/runtime/this-firefox`.
2. Clique sur **Charger un module complémentaire temporaire…** et choisis `extension/manifest.json`.

**Pour une installation permanente** : Firefox n'accepte que les extensions signées par Mozilla. La signature « non listée » est gratuite et l'extension reste privée.

1. Change l'identifiant dans `extension/manifest.json` (`browser_specific_settings.gecko.id`) pour qu'il soit unique, par exemple `stage-trello-<ton-pseudo>@exemple.org`.
2. Crée le paquet :

   ```bash
   cd extension && zip -r ../stage-trello.zip . && cd ..
   ```

3. Envoie `stage-trello.zip` sur <https://addons.mozilla.org/developers/> (**Submit a New Add-on** → **On your own**). À la question sur le code source, réponds **No** (aucune minification ni outil de build).
4. Télécharge le `.xpi` signé et installe-le : `about:addons` → ⚙ → **Installer un module depuis un fichier…**.

Alternative en ligne de commande :

```bash
cd extension
npx web-ext sign --channel=unlisted --api-key="<USER_ID>" --api-secret="<SECRET>"
```

Après l'installation, ouvre les **préférences** de l'extension (`about:addons` → Stage vers Trello → Préférences) et colle la valeur de `STAGE_TOKEN`. Épingle ensuite le bouton dans la barre d'outils.

Pour publier une mise à jour, incrémente `"version"` dans `manifest.json` : Mozilla refuse de signer deux fois la même version.

## Utilisation

1. Ouvre la **page de l'offre elle-même** (pas une liste de résultats).
2. Clique sur le bouton de l'extension, ou fais `Alt+Shift+S`, pour ouvrir le popup.
3. Choisis le tableau et la liste (le choix est mémorisé), puis clique sur **Ajouter à Trello**. Coche « Envoyer dès l'ouverture » pour que les prochaines ouvertures du popup envoient directement l'offre.
4. Le popup affiche « Création de la carte… », puis :
   - `✓ Entreprise - Poste` ;
   - ou `✗` avec le message d'erreur.
5. La carte apparaît dans la liste Trello choisie.

Si la page ne contient pas d'offre (page générique, lien expiré, liste de résultats), **aucune carte n'est créée**.

## Configuration

Variables d'environnement lues par `add_stage.py` et `server.py` :

| Variable | Obligatoire | Description |
|---|---|---|
| `TRELLO_KEY` | oui | Clé d'API Trello |
| `TRELLO_TOKEN` | oui | Jeton Trello (lecture et écriture) |
| `TRELLO_BOARD` | pour la ligne de commande | ID du tableau par défaut (présélectionné dans le popup, obligatoire pour `add_stage.py` seul) |
| `TRELLO_LIST` | non | Nom exact de la liste par défaut (défaut : `Stages`) |
| `GROQ_API_KEY` | recommandé | Clé API Groq ; sans elle, le script bascule sur un mode de secours par mots-clés, nettement moins fiable |
| `GROQ_MODELS` | non | Modèles à essayer, séparés par des virgules, du préféré au dernier recours |
| `STAGE_TOKEN` | pour le serveur | Secret partagé entre l'extension et le serveur local |

Autres réglages dans le code :

- `KEYWORDS` et `MAX_PROMPT_CHARS` dans `add_stage.py` ;
- `PORT` dans `server.py` (si tu le changes, mets aussi à jour `manifest.json` et `popup.js`).

Les quotas et la liste des modèles de l'offre gratuite changent régulièrement : consulte la console Groq, et liste les modèles accessibles avec :

```bash
curl -s https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY" | grep '"id"'
```

## Détail du fonctionnement

### `add_stage.py`

| Étape | Fonction | Rôle |
|---|---|---|
| Récupération | `fetch` | Télécharge la page avec `requests`, ou la rend avec Playwright (Chromium headless) si `render=True` |
| Nettoyage | `page_text`, `page_meta`, `jobposting` | `trafilatura` extrait le contenu principal en markdown ; `BeautifulSoup` lit le titre, `og:site_name` et les données `JobPosting` (JSON-LD) |
| Extraction | `llm_extract`, `call_groq` | Envoie le début du texte à Groq et récupère 4 lignes : `FOUND`, `COMPANY`, `TITLE`, `LABELS` |
| Secours | `heuristic_extract` | Sans clé Groq (ou si Groq échoue) : entreprise et titre depuis le JSON-LD ou les métadonnées, étiquettes par mots-clés |
| Description | `build_info` | Description du JSON-LD si elle dépasse 300 caractères, sinon texte extrait par `trafilatura` |
| Trello | `trello`, `find_list`, `create_card` | Appels authentifiés par en-tête, erreurs Trello remontées telles quelles ; crée la carte et ajoute l'URL en pièce jointe |
| Orchestration | `main` | Essaie dans l'ordre : HTML fourni par l'extension → téléchargement simple → rendu Playwright, et s'arrête dès qu'une offre est détectée |

Points notables :

- **Format de réponse du LLM** : 4 lignes en clair (`FOUND`, `COMPANY`, `TITLE`, `LABELS`), plus simple et plus robuste que du JSON. Le modèle ne recopie pas la description, ce qui limite la consommation de tokens et évite les erreurs de recopie.
- **Garde-fou `FOUND`** : si le modèle estime que la page n'est pas une offre précise, rien n'est créé.
- **Résilience Groq** : les modèles sont essayés **tour à tour sans attendre** en cas d'erreur 429/5xx, jusqu'à 3 tours avec une pause (selon `retry-after`, 30 s max). Pour les modèles `gpt-oss`, `reasoning_effort` est réglé sur `low` pour accélérer la réponse.
- **Taille du prompt** : le texte envoyé est limité à `MAX_PROMPT_CHARS` (10 000 caractères) pour rester sous la limite de tokens par minute de l'offre gratuite.
- **Authentification Trello** : la clé et le jeton passent dans l'en-tête `Authorization`, jamais dans l'URL, pour ne pas apparaître dans les messages d'erreur.
- **Limites Trello** : la description est tronquée à 16 000 caractères (la limite est de 16 384).
- **Étiquettes** : 1 à 3 par offre, uniquement parmi les étiquettes nommées du tableau.

### `server.py`

- Serveur HTTP (`ThreadingHTTPServer`) écoutant **uniquement sur `127.0.0.1:8765`**.
- `GET /boards` : renvoie les tableaux ouverts et leurs listes, ainsi que `defaultBoard` (`TRELLO_BOARD`) et `defaultList` (`TRELLO_LIST`).
- `POST /add` avec le corps JSON `{"url": "...", "html": "...", "board": "...", "list": "..."}` (`html`, `board` et `list` sont optionnels ; à défaut, `TRELLO_BOARD` et `TRELLO_LIST` sont utilisés).
- Les deux exigent l'en-tête `X-Token` égal à `STAGE_TOKEN`, sinon `403`.
- Vérifie que l'URL commence par `http://` ou `https://`.
- Un **verrou** garantit une seule création de carte à la fois.
- Répond `{"ok": true, "name": "...", "card": "<url>"}` ou `{"ok": false, "error": "..."}`.
- Gère le préflight CORS (`OPTIONS`).

### Extension Firefox

- **Permissions** : `activeTab` (lire la page active au clic), `storage` (mémoriser le token, le tableau, la liste et l'option d'envoi automatique) et l'accès à `http://127.0.0.1:8765/*` uniquement.
- **Données transmises** : le manifeste déclare `data_collection_permissions` `websiteContent`, car le contenu de la page est envoyé, via le serveur local, à Groq et à Trello.
- **`popup.js`** : à l'ouverture, charge les tableaux via `GET /boards` et restaure le dernier choix. À l'envoi, récupère `document.documentElement.outerHTML` de l'onglet actif, envoie `{url, html, board, list}` au serveur et affiche le résultat. Sur une page protégée (ex. `about:` ou la boutique d'extensions), la lecture du HTML échoue silencieusement et c'est le serveur qui télécharge l'URL.
- **Page de réglages** (`options.html`, `options.js`) : saisie du token, stocké localement dans le profil Firefox. **Aucun secret n'est présent dans le code de l'extension.**
- **Raccourci** : `Alt+Shift+S` (modifiable dans `about:addons` → ⚙ → **Gérer les raccourcis des extensions**).

## Sécurité et confidentialité

- Le serveur n'écoute que sur **localhost** et exige un **token secret** : une page web quelconque ne peut pas déclencher la création de cartes.
- **Ne publie jamais `.env`** : ajoute-le à `.gitignore` avec `venv/` et `*.xpi`. Les clés Trello, Groq et le `STAGE_TOKEN` ne doivent apparaître nulle part dans le dépôt.
- Le jeton Trello donne accès à ton compte : si un secret a été exposé, régénère-le.
- **Données envoyées à des services tiers** : le début du texte de la page est transmis à l'API Groq, et la description à Trello. Consulte les conditions d'utilisation de Groq et ne l'utilise que sur des contenus publics (offres d'emploi), pas sur des pages privées ou sensibles.
- L'extension envoie le **HTML complet de la page active**, y compris ce qui s'affiche quand tu es connecté. N'appuie sur le bouton que sur des offres.

## Limites connues

- Il faut l'**URL directe de l'offre**. Sur une page de liste ou une page générique, le script répond « Aucune offre trouvée ».
- Certains sites ne servent le contenu qu'après connexion ou action de l'utilisateur : le fait d'envoyer le HTML déjà affiché contourne la plupart de ces cas, mais pas tous.
- Sans données `JobPosting`, la description est le texte extrait par `trafilatura` : il peut contenir des éléments parasites ; relis la carte en cas de doute.
- Le modèle ne voit que les `MAX_PROMPT_CHARS` premiers caractères de la page.
- Les quotas gratuits de Groq sont limités et peuvent changer ; en cas de surcharge, le script bascule sur le modèle suivant de `GROQ_MODELS`.
- Les étiquettes sont celles de **ton** tableau ; `KEYWORDS` (mode de secours) doit utiliser les mêmes noms.
- Testé sous Linux et Firefox ; non testé sous macOS/Windows ni sous Chrome.

## Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| « Token manquant » dans le popup | Token pas encore saisi | Préférences de l'extension → coller `STAGE_TOKEN` |
| `✗` « token invalide » (log `403`) | Token de l'extension ≠ `STAGE_TOKEN` | Recopier la valeur exacte du `.env`, sans espace ni guillemets |
| `✗` « NetworkError » | Serveur arrêté | `systemctl --user status stage-server` puis `restart` |
| `Address already in use` | Un ancien `server.py` occupe le port, éventuellement suspendu par `Ctrl+Z` | `ss -ltnp \| grep 8765` puis `kill -9 <PID>`, enfin `systemctl --user reset-failed stage-server && systemctl --user restart stage-server` |
| `curl` vers le serveur qui ne répond jamais | Processus suspendu (état `T`) | Même solution : `kill -9` |
| Service `systemd` en échec immédiat | Variable manquante dans `.env` ou mot `export` en début de ligne | `journalctl --user -u stage-server -n 30 --no-pager` |
| `503` / « indisponible » de Groq | Modèle surchargé | Normal : le script passe au modèle suivant. Ajuste `GROQ_MODELS` |
| `✗ Erreur Trello 401` | Clé ou jeton Trello invalide | Régénère le jeton et mets à jour `.env` |
| `✗ Liste « … » introuvable` | `TRELLO_LIST` absent du tableau | Corrige `TRELLO_LIST` ou choisis la liste dans le popup |
| `429` sur tous les modèles | Quota gratuit épuisé | Attends la réinitialisation quotidienne ou ajoute d'autres modèles |
| « Aucune offre trouvée » | Page générique, liste, lien expiré | Ouvre l'offre elle-même |
| Carte sans étiquettes | Étiquettes sans nom sur le tableau, ou mode de secours avec `KEYWORDS` mal nommés | Nomme tes étiquettes Trello ; aligne `KEYWORDS` sur ces noms |
| « Playwright non installé » | Navigateur headless absent | `pip install playwright && playwright install chromium` (sur Ubuntu, au besoin : `sudo $(which playwright) install-deps chromium`) |

Logs en direct : `journalctl --user -u stage-server -f`.

## Licence

À choisir avant la publication, par exemple [MIT](https://choosealicense.com/licenses/mit/). Ajoute un fichier `LICENSE` à la racine du dépôt.
