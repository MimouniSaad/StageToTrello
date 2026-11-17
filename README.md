# Stage → Trello

Extension Firefox + petit serveur local qui transforment une offre de stage (ou d'emploi) ouverte dans le navigateur en **carte Trello complète, en un clic**.

Un clic sur le bouton (ou `Alt+Shift+S`) et une carte est créée dans ton tableau Trello avec :

- un **titre normalisé** : `Entreprise - Poste` (ex. `Capgemini - Ingénieur GRC`) ;
- la **description complète de l'offre** (missions, profil, avantages…), sans menus ni pied de page ;
- le **lien de l'offre en pièce jointe** ;
- des **étiquettes** (DevOps, Cloud, Cybersécurité…) choisies automatiquement.

L'extraction du contenu est faite par un modèle Gemini (offre gratuite de Google AI Studio), ce qui fonctionne sur n'importe quel site sans règles à écrire site par site.

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
┌────────────────┐  POST /add   ┌──────────────────────────┐
│  Extension     │ ───────────▶ │  server.py (HTTP local)  │
│  (bouton)      │  {url, html} │          │               │
│                │ ◀─────────── │          ▼               │   ┌──────────────┐
│  badge + notif │  {ok, carte} │  add_stage.py            │──▶│ API Gemini   │ extraction
└────────────────┘              │   1. nettoyage de page   │   └──────────────┘
                                │   2. extraction par LLM  │   ┌──────────────┐
                                │   3. création de carte   │──▶│ API Trello   │ carte + labels
                                └──────────────────────────┘   └──────────────┘
```

1. Tu cliques sur le bouton de l'extension depuis la page de l'offre.
2. L'extension envoie au serveur local **l'URL** et **le HTML de la page tel que ton navigateur l'affiche** (donc même les pages en JavaScript ou nécessitant une connexion).
3. Le serveur nettoie la page, demande à Gemini l'entreprise, l'intitulé du poste, la description complète et les étiquettes.
4. Il crée la carte dans la liste Trello choisie, ajoute le lien en pièce jointe et renvoie le résultat.
5. L'extension affiche un badge `✓` / `✗` et une notification.

`add_stage.py` peut aussi s'utiliser seul en ligne de commande, sans l'extension :

```bash
python add_stage.py "https://exemple.com/offre-de-stage"
```

## Contenu du dépôt

```
.
├── add_stage.py              # Récupération de la page, extraction par Gemini, création de la carte Trello
├── server.py                 # Serveur HTTP local (127.0.0.1) appelé par l'extension
├── requirements.txt          # Dépendances Python
├── .env.example              # Modèle de configuration (à copier en .env)
├── systemd/
│   └── stage-server.service  # Service utilisateur pour démarrer le serveur automatiquement (Linux)
└── extension/
    ├── manifest.json         # Manifeste Firefox (Manifest V2)
    ├── background.js         # Logique du bouton : envoie la page au serveur, affiche le résultat
    ├── options.html          # Page de réglages (saisie du token)
    ├── options.js            # Enregistrement du token dans le stockage local de l'extension
    └── icon.svg              # Icône
```

## Prérequis

- **Linux** (testé sur Ubuntu 24.04) ; le serveur Python est portable, seul le service `systemd` est spécifique à Linux.
- **Python 3.10+** avec `venv`.
- **Firefox** (l'extension utilise l'API `browser.*` / Manifest V2).
- Un compte **Trello** et un tableau avec une liste destinée aux offres (par défaut `Stages`).
- Une clé gratuite de l'**API Gemini** : <https://aistudio.google.com/apikey>.
- Pour une installation permanente de l'extension : un compte gratuit sur <https://addons.mozilla.org/developers/> (signature « non listée »).

## Installation

### 1. Cloner et installer les dépendances

```bash
git clone https://github.com/<ton-compte>/stage-trello.git
cd stage-trello

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
3. Récupère l'ID de ton tableau :

   ```bash
   curl "https://api.trello.com/1/members/me/boards?fields=name&key=$TRELLO_KEY&token=$TRELLO_TOKEN"
   ```

4. Vérifie les noms de tes listes et étiquettes :

   ```bash
   curl "https://api.trello.com/1/boards/<ID_TABLEAU>/lists?fields=name&key=$TRELLO_KEY&token=$TRELLO_TOKEN"
   curl "https://api.trello.com/1/boards/<ID_TABLEAU>/labels?fields=name&key=$TRELLO_KEY&token=$TRELLO_TOKEN"
   ```

5. Dans `add_stage.py`, adapte :
   - `BOARD_ID` : l'ID de ton tableau ;
   - `LABEL_NAMES` : la liste **exacte** des étiquettes de ton tableau (les noms inconnus de Trello sont ignorés) ;
   - `KEYWORDS` : utilisé seulement en mode de secours, sans clé Gemini.

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
TRELLO_LIST=Stages
GEMINI_API_KEY=...
GEMINI_MODELS=gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemma-4-31b-it,gemini-2.5-flash-lite
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

Ou automatiquement avec `systemd` (adapte les chemins dans `systemd/stage-server.service` si le dépôt n'est pas dans `~/Desktop`) :

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
2. Clique sur le bouton de l'extension, ou fais `Alt+Shift+S`.
3. Le badge affiche `…` pendant le traitement, puis :
   - `✓` et une notification « Carte créée : *Entreprise - Poste* » ;
   - ou `✗` avec le message d'erreur.
4. La carte apparaît dans la liste Trello configurée.

Si la page ne contient pas d'offre (page générique, lien expiré, liste de résultats), **aucune carte n'est créée**.

## Configuration

Variables d'environnement lues par `add_stage.py` et `server.py` :

| Variable | Obligatoire | Description |
|---|---|---|
| `TRELLO_KEY` | oui | Clé d'API Trello |
| `TRELLO_TOKEN` | oui | Jeton Trello (lecture et écriture) |
| `TRELLO_LIST` | non | Nom exact de la liste cible (défaut : `Stages`) |
| `GEMINI_API_KEY` | recommandé | Clé API Gemini ; sans elle, le script bascule sur un mode de secours par mots-clés, nettement moins fiable |
| `GEMINI_MODELS` | non | Modèles à essayer, séparés par des virgules, du préféré au dernier recours |
| `STAGE_TOKEN` | pour le serveur | Secret partagé entre l'extension et le serveur local |

Autres réglages dans le code :

- `BOARD_ID`, `LABEL_NAMES`, `KEYWORDS` dans `add_stage.py` ;
- `PORT` dans `server.py` (si tu le changes, mets aussi à jour `manifest.json` et `background.js`).

Les quotas et la liste des modèles de l'offre gratuite varient selon les comptes et changent régulièrement : consulte la console AI Studio, et liste les modèles accessibles avec :

```bash
curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY" | grep '"name"'
```

## Détail du fonctionnement

### `add_stage.py`

| Étape | Fonction | Rôle |
|---|---|---|
| Récupération | `fetch` | Télécharge la page avec `requests`, ou la rend avec Playwright (Chromium headless) si `render=True` |
| Nettoyage | `page_text`, `page_meta` | `trafilatura` extrait le contenu principal en markdown ; `BeautifulSoup` lit le titre et `og:site_name` |
| Extraction | `llm_extract`, `call_gemini` | Envoie le texte à Gemini et récupère `FOUND`, `COMPANY`, `TITLE`, `LABELS` et la description complète |
| Secours | `heuristic_extract` | Sans clé Gemini : devine l'entreprise et le titre depuis les métadonnées, étiquettes par mots-clés |
| Trello | `create_card` | Retrouve la liste et les étiquettes par leur **nom**, crée la carte, ajoute l'URL en pièce jointe |
| Orchestration | `main` | Essaie dans l'ordre : HTML fourni par l'extension → téléchargement simple → rendu Playwright, et s'arrête dès qu'une offre est détectée |

Points notables :

- **Format de réponse du LLM** : un en-tête en clair (`FOUND`, `COMPANY`, `TITLE`, `LABELS`) suivi de `---DESCRIPTION---` et du texte. C'est plus robuste que du JSON pour de longs textes contenant guillemets et retours à la ligne.
- **Garde-fou `FOUND`** : si le modèle estime que la page n'est pas une offre précise, rien n'est créé.
- **Résilience Gemini** : les modèles sont essayés **tour à tour sans attendre** en cas d'erreur 429/5xx, jusqu'à 3 tours avec une courte pause. La « réflexion » du modèle est désactivée pour accélérer la réponse ; un modèle qui refuse l'option est mémorisé et rappelé sans elle.
- **Limites Trello** : la description est tronquée à 16 000 caractères (la limite est de 16 384).
- **Étiquettes** : 1 à 3 par offre, uniquement parmi `LABEL_NAMES` et uniquement si elles existent sur le tableau.

### `server.py`

- Serveur HTTP (`ThreadingHTTPServer`) écoutant **uniquement sur `127.0.0.1:8765`**.
- Un seul endpoint : `POST /add` avec le corps JSON `{"url": "...", "html": "..."}` (`html` est optionnel).
- Exige l'en-tête `X-Token` égal à `STAGE_TOKEN`, sinon `403`.
- Vérifie que l'URL commence par `http://` ou `https://`.
- Un **verrou** garantit une seule création de carte à la fois.
- Répond `{"ok": true, "name": "...", "card": "<url>"}` ou `{"ok": false, "error": "..."}`.
- Gère le préflight CORS (`OPTIONS`).

### Extension Firefox

- **Permissions** : `activeTab` (lire la page active au clic), `notifications`, `storage` (mémoriser le token) et l'accès à `http://127.0.0.1:8765/*` uniquement.
- **`background.js`** : au clic, lit le token depuis `browser.storage.local`, récupère `document.documentElement.outerHTML` de l'onglet actif, envoie `{url, html}` au serveur, puis affiche badge et notification. Sur une page protégée (ex. `about:` ou la boutique d'extensions), l'envoi du HTML échoue silencieusement et c'est le serveur qui télécharge l'URL.
- **Page de réglages** (`options.html`, `options.js`) : saisie du token, stocké localement dans le profil Firefox. **Aucun secret n'est présent dans le code de l'extension.**
- **Raccourci** : `Alt+Shift+S` (modifiable dans `about:addons` → ⚙ → **Gérer les raccourcis des extensions**).

## Sécurité et confidentialité

- Le serveur n'écoute que sur **localhost** et exige un **token secret** : une page web quelconque ne peut pas déclencher la création de cartes.
- **Ne publie jamais `.env`** : ajoute-le à `.gitignore` avec `venv/` et `*.xpi`. Les clés Trello, Gemini et le `STAGE_TOKEN` ne doivent apparaître nulle part dans le dépôt.
- Le jeton Trello donne accès à ton compte : si un secret a été exposé, régénère-le.
- **Données envoyées à Google** : le texte de la page de l'offre est transmis à l'API Gemini. Sur l'offre gratuite, Google indique pouvoir utiliser les requêtes pour améliorer ses produits. Ne l'utilise donc que sur des contenus publics (offres d'emploi), pas sur des pages privées ou sensibles. Une offre payante modifie ces conditions.
- L'extension envoie le **HTML complet de la page active**, y compris ce qui s'affiche quand tu es connecté. N'appuie sur le bouton que sur des offres.

## Limites connues

- Il faut l'**URL directe de l'offre**. Sur une page de liste ou une page générique, le script répond « Aucune offre trouvée ».
- Certains sites ne servent le contenu qu'après connexion ou action de l'utilisateur : le fait d'envoyer le HTML déjà affiché contourne la plupart de ces cas, mais pas tous.
- La fidélité de la recopie de la description dépend du modèle ; relis la carte en cas de doute.
- Les quotas gratuits de Gemini sont limités et peuvent changer ; en cas de surcharge, le script bascule sur le modèle suivant de `GEMINI_MODELS`.
- Les étiquettes sont celles de **ton** tableau : adapte `LABEL_NAMES`.
- Testé sous Linux et Firefox ; non testé sous macOS/Windows ni sous Chrome.

## Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| Notification « Token manquant » | Token pas encore saisi | Préférences de l'extension → coller `STAGE_TOKEN` |
| `✗` « token invalide » (log `403`) | Token de l'extension ≠ `STAGE_TOKEN` | Recopier la valeur exacte du `.env`, sans espace ni guillemets |
| `✗` « NetworkError » | Serveur arrêté | `systemctl --user status stage-server` puis `restart` |
| `Address already in use` | Un ancien `server.py` occupe le port, éventuellement suspendu par `Ctrl+Z` | `ss -ltnp \| grep 8765` puis `kill -9 <PID>`, enfin `systemctl --user reset-failed stage-server && systemctl --user restart stage-server` |
| `curl` vers le serveur qui ne répond jamais | Processus suspendu (état `T`) | Même solution : `kill -9` |
| Service `systemd` en échec immédiat | Variable manquante dans `.env` ou mot `export` en début de ligne | `journalctl --user -u stage-server -n 30 --no-pager` |
| `503` / « indisponible » de Gemini | Modèle surchargé | Normal : le script passe au modèle suivant. Ajuste `GEMINI_MODELS` |
| `429` sur tous les modèles | Quota gratuit épuisé | Attends la réinitialisation quotidienne ou ajoute d'autres modèles |
| « Aucune offre trouvée » | Page générique, liste, lien expiré | Ouvre l'offre elle-même |
| Carte sans étiquettes | Noms absents du tableau | Fais correspondre `LABEL_NAMES` exactement aux étiquettes Trello |
| « Playwright non installé » | Navigateur headless absent | `pip install playwright && playwright install chromium` (sur Ubuntu, au besoin : `sudo $(which playwright) install-deps chromium`) |

Logs en direct : `journalctl --user -u stage-server -f`.

## Licence

À choisir avant la publication, par exemple [MIT](https://choosealicense.com/licenses/mit/). Ajoute un fichier `LICENSE` à la racine du dépôt.
