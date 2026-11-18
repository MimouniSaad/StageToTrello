# StageToTrello

[![CI](https://github.com/MimouniSaad/StageToTrello/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/MimouniSaad/StageToTrello/actions/workflows/ci.yml)

Extension Firefox qui transforme une offre de stage (ou d'emploi) ouverte dans le navigateur en **carte Trello complète, en un clic**. Rien à installer en dehors de Firefox : l'utilisateur clique sur **Connecter Trello**, autorise l'accès, et c'est prêt.

Chaque carte contient :

- un **titre normalisé** : `Entreprise - Poste` (ex. `Capgemini - Ingénieur GRC`) ;
- la **description de l'offre** (missions, profil, avantages…), reprise des données structurées de la page ou, à défaut, de son texte principal ;
- le **lien de l'offre en pièce jointe** ;
- des **étiquettes** (DevOps, Cloud, Cybersécurité…) choisies parmi celles du tableau.

L'entreprise, l'intitulé du poste et les étiquettes sont déterminés par un modèle d'IA hébergé chez Groq, interrogé via un petit relais (Cloudflare Worker) qui garde la clé Groq. Ça fonctionne sur n'importe quel site, sans règles à écrire site par site, et l'extension ne contient aucun secret.


> StageToTrello est un projet indépendant, **non affilié à Trello ni à Atlassian**. Politique de confidentialité : [`PRIVACY.md`](PRIVACY.md).
---

## Sommaire

1. [Installation](#installation)
2. [Comment ça marche](#comment-ça-marche)
3. [Contenu du dépôt](#contenu-du-dépôt)
4. [Mise en place (propriétaire de l'extension)](#mise-en-place-propriétaire-de-lextension)
5. [Publier une nouvelle version](#publier-une-nouvelle-version)
6. [Utilisation](#utilisation)
7. [Détail du fonctionnement](#détail-du-fonctionnement)
8. [Tests](#tests)
9. [Sécurité et confidentialité](#sécurité-et-confidentialité)
10. [Limites connues](#limites-connues)
11. [Dépannage](#dépannage)
12. [Licence](#licence)

---

## Installation

Pour les utilisateurs, rien d'autre que Firefox (version 140 ou plus récente sur ordinateur) :

1. Installe **StageToTrello** depuis le site des modules complémentaires de Firefox (<https://addons.mozilla.org>) : le lien direct sera ajouté ici dès la publication.
2. Épingle le bouton dans la barre d'outils (icône de pièce de puzzle → ⚙ à côté de StageToTrello → **Épingler à la barre d'outils**).
3. Ouvre le popup, clique sur **Connecter Trello** et autorise l'accès. C'est tout : aucune clé à créer, aucun réglage.

## Comment ça marche

```
 Firefox                                               Services externes
┌──────────────────────────────────────┐
│  Popup : tableau, liste, bouton      │
│                                      │
│  Arrière-plan                        │   ┌──────────────┐   ┌──────────┐
│   1. lit la page de l'offre          │──▶│ Relais       │──▶│ API Groq │ entreprise, poste,
│   2. extrait les informations        │   │ (Cloudflare) │   └──────────┘ étiquettes
│                                      │   └──────────────┘
│   3. crée la carte                   │   ┌──────────────┐
│                                      │──▶│ API Trello   │ tableaux, carte, pièce jointe
│   + connexion Trello                 │   └──────────────┘
└──────────────────────────────────────┘
```

1. Au premier usage, l'utilisateur clique sur **Connecter Trello**. La page d'autorisation officielle de Trello s'ouvre ; après accord, Trello renvoie un jeton personnel que l'extension garde dans son stockage local.
2. Sur la page d'une offre, le popup affiche ses tableaux et listes Trello.
3. Au clic sur **Ajouter à Trello**, l'extension lit la page telle qu'elle est affichée (données `JobPosting` JSON-LD, titre, nom du site, texte principal via Mozilla Readability).
4. Elle envoie le texte de l'offre au relais avec le jeton Trello de l'utilisateur. Le relais vérifie le jeton, applique la limite quotidienne et demande à Groq l'entreprise, l'intitulé et les étiquettes.
5. L'extension crée la carte et y joint le lien. Tout se passe dans le script d'arrière-plan : fermer le popup n'interrompt rien, et le résultat s'affiche sur le bouton (badge) et dans une notification.

## Contenu du dépôt

```
.
├── extension/
│   ├── manifest.json         # Manifeste Firefox (Manifest V2)
│   ├── config.js             # Configuration (clé publique de l'app Trello, adresse du relais) ; aucun secret
│   ├── background.js         # Connexion Trello et ajout des offres (badge, notification, un ajout à la fois)
│   ├── popup.html, popup.js  # Popup : connexion, choix du tableau et de la liste, envoi
│   ├── THIRD_PARTY_NOTICES.txt  # Licence et mentions de Readability (Apache-2.0), incluses dans le paquet
│   ├── icons/                # Logo : icon.svg (barre d'outils) + PNG 48/96/128 (AMO, about:addons)
│   └── lib/
│       ├── core.js           # Logique pure : prompt, lecture de réponse, JSON-LD, mode de secours
│       ├── add.js            # Ajout d'une offre : lecture de la page, analyse, création de la carte
│       ├── relay.js          # Client du relais (analyse par IA, compteur quotidien)
│       ├── quota.js          # Limite quotidienne : copie locale du compteur du relais, temps d'attente
│       ├── trello.js         # Client Trello (en-tête OAuth, erreurs lisibles)
│       ├── page.js           # Script injecté dans l'onglet pour lire la page
│       └── Readability.js    # Mozilla Readability 0.6.0 (Apache-2.0)
├── relay/                    # Relais Cloudflare Worker : garde la clé Groq, vérifie le jeton Trello, limite quotidienne (voir relay/README.md)
├── tests/                    # Tests Node (node --test)
├── PRIVACY.md                # Politique de confidentialité (lien « Confidentialité » du popup)
├── CHANGELOG.md              # Journal des modifications (Keep a Changelog, SemVer)
├── scripts/package.js        # npm run package : vérifications, tests, lint et zip pour AMO
├── scripts/check-version.js  # npm run version:check : même version SemVer partout (CI)
├── package.json              # Scripts test, lint, package ; web-ext en dépendance de développement
└── docs/superpowers/         # Design et plan d'implémentation
```

## Mise en place (propriétaire de l'extension)

Ces étapes ne sont à faire qu'une fois, par la personne qui publie l'extension. Les utilisateurs n'ont rien à configurer.

### 1. Créer l'application Trello

1. Crée une application sur <https://trello.com/power-ups/admin> (choisis « **n'utilise pas les fonctionnalités Power-up** »).
2. Dans la section **API Key**, génère une clé. Cette clé est **publique** : elle identifie l'application, pas un utilisateur. Seul le jeton obtenu par chaque utilisateur est secret.

### 2. Configurer l'extension

`extension/config.js` est commité avec les valeurs de l'extension publiée. Pour pointer vers ta propre app Trello ou ton propre relais (fork), modifie-le :

| Champ | Description |
|---|---|
| `TRELLO_KEY` | Clé de l'application Trello (étape 1) |
| `RELAY_URL` | Adresse du relais déployé (`https://stage-trello-relay.mimsaad03.workers.dev`, voir `relay/README.md`) |
| `DEFAULT_LIST` | Nom de la liste présélectionnée au premier usage (défaut : `Stages`) |

`config.js` ne contient aucun secret (la clé Trello est publique, la clé Groq reste sur le relais). La `TRELLO_KEY` identifie l'application, pas un utilisateur : elle est la même pour tous et peut être publique. Ne confonds pas avec le *Secret* OAuth de la page d'admin Trello, qui ne doit jamais être publié (l'extension ne l'utilise pas).

### 3. Autoriser l'URL de redirection dans Trello

Trello ne renvoie le jeton qu'aux adresses autorisées.

1. Charge l'extension (voir l'étape 4), ouvre `about:debugging#/runtime/this-firefox`, clique sur **Examiner** à côté de « StageToTrello » et tape dans la console :

   ```js
   browser.identity.getRedirectURL()
   ```

2. Copie l'adresse obtenue (de la forme `https://….extensions.allizom.org/`) et ajoute-la dans **Allowed origins** de l'application Trello (<https://trello.com/power-ups/admin>).

Cette adresse dépend de l'identifiant de l'extension (`browser_specific_settings.gecko.id` dans `manifest.json`) : si tu le changes, recommence cette étape.

### 4. Tester l'extension

`about:debugging#/runtime/this-firefox` → **Charger un module complémentaire temporaire…** → `extension/manifest.json`. L'extension disparaît au redémarrage de Firefox.

Les installations permanentes passent par la version publiée sur AMO (voir ci-dessous).

## Publier une nouvelle version

Branches : on développe sur des branches `feature/`, `fix/`, `refactor/`, `chore/` ou `docs/` fusionnées dans `develop` (branche par défaut) ; `main` ne reçoit que des versions validées, par une PR `develop` → `main`. Les deux branches sont protégées par un ruleset : PR obligatoire, contrôles CI verts (`Tests`, `Lint de l'extension`, `Paquet AMO`, `Construction du relais`, `Source de la PR vers main`), aucun push direct, *force push* ni suppression ; `main` n'accepte que des PR venant de `develop`. Les branches fusionnées sont supprimées automatiquement. Un `Closes #<ticket>` dans la description d'une PR ferme le ticket à la fusion dans `develop`.

1. **Valider sur `develop`** : tester la version dans Firefox (connexion, ajout avec et sans `JobPosting`, page sans offre, limite quotidienne, relais indisponible).
2. **Version** (SemVer `MAJEUR.MINEUR.CORRECTIF`) :
   - **CORRECTIF** (`3.0.1`) : correction de bug ; **MINEUR** (`3.1.0`) : nouvelle fonctionnalité ou nouvel outillage ; **MAJEUR** (`4.0.0`) : changement incompatible (par exemple une API du relais qui oblige à mettre à jour l'extension) ;
   - mets la même version dans `extension/manifest.json` et `package.json`, et transforme la section `[Non publié]` de `CHANGELOG.md` en `[x.y.z] - AAAA-MM-JJ` ; `npm run version:check` (aussi lancé par la CI) vérifie la cohérence ;
   - une seule version pour tout le dépôt : une version qui ne touche pas `extension/` (CI, relais, documentation) est étiquetée et publiée sur GitHub, mais **pas envoyée sur AMO** ;
   - Mozilla refuse de signer deux fois la même version.
3. **Relais** : si `relay/` ou `extension/lib/core.js` (dont le relais réutilise le prompt) a changé, redéploie-le d'abord, en restant compatible avec la version de l'extension déjà publiée :

   ```bash
   cd relay && npx wrangler deploy && cd ..
   ```

4. **Paquet** :

   ```bash
   npm install          # une fois : installe web-ext (version figée)
   npm run package      # → web-ext-artifacts/stagetotrello-<version>.zip
   ```

   Le script vérifie le manifeste et `config.js` (clé Trello, adresse du relais autorisée), l'absence de clé Groq dans `extension/`, la présence des icônes et des mentions de licence, puis lance les tests et `web-ext lint` (0 erreur exigée) avant de créer le zip. Il s'arrête au premier problème.

5. **Envoi sur AMO** : <https://addons.mozilla.org/developers/> → StageToTrello → **Envoyer une nouvelle version** (première fois : **Submit a New Add-on** → **On this site**). Envoie le zip ; à la question sur le code source, réponds **Non** (aucune minification ni outil de build). Ajoute des notes de version et, pour les relecteurs, comment tester (connexion avec leur propre compte Trello, rôle du relais).
6. **Publier sur `main`** : PR `develop` → `main`, puis étiquette la version :

   ```bash
   git checkout main && git pull && git tag v<version> && git push origin v<version>
   ```

7. **Politique de confidentialité** : si les données traitées changent, mets à jour `PRIVACY.md` (et sa date) dans la même version, ainsi que le champ correspondant sur AMO.

## Utilisation

1. Installe l'extension et épingle son bouton dans la barre d'outils.
2. Ouvre le popup et clique sur **Connecter Trello**, puis autorise l'accès dans la fenêtre Trello. Le popup peut se fermer pendant l'autorisation : rouvre-le ensuite.
3. Ouvre la **page de l'offre elle-même** (pas une liste de résultats), puis le popup (bouton ou `Alt+Shift+S`).
4. Choisis le tableau et la liste (le choix est mémorisé), puis clique sur **Ajouter à Trello**. Coche « Envoyer dès l'ouverture » pour que les prochaines ouvertures du popup envoient directement l'offre.
5. Le popup affiche `✓ Entreprise - Poste`, ou `✗` avec le message d'erreur. Tu peux le fermer sans attendre : l'ajout continue, le bouton affiche un badge (`…`, puis `✓` ou `✗`) et une notification donne le résultat. Clique sur la notification pour ouvrir la carte.

Si la page ne contient pas d'offre (page générique, lien expiré, liste de résultats), **aucune carte n'est créée**. Le lien **Déconnecter** efface le jeton Trello de l'extension.

## Détail du fonctionnement

| Étape | Fichier | Rôle |
|---|---|---|
| Connexion | `background.js` | `browser.identity.launchWebAuthFlow` vers `https://trello.com/1/authorize` (`scope=read,write`, `expiration=never`, `callback_method=fragment`) ; jeton lu dans le fragment de l'URL de retour et stocké dans `storage.local` |
| Lecture | `lib/page.js` | Injecté dans l'onglet : JSON-LD, `og:title`, `og:site_name`, `<title>`, texte principal via Readability (repli sur le texte visible) |
| Sans IA | `lib/core.js` | Si la page publie un `JobPosting` JSON-LD avec entreprise **et** intitulé : carte créée directement, sans appel au relais ni quota consommé. Intitulé nettoyé (`cleanTitle` : H/F, durée, « (stage de fin d'études) », ville), étiquettes par mots-clés |
| Extraction | `lib/relay.js`, `lib/core.js` | Envoie les 10 000 premiers caractères au relais, qui interroge Groq ; lit 4 lignes : `FOUND`, `COMPANY`, `TITLE`, `LABELS` |
| Limite | `lib/quota.js` | Copie locale du compteur du relais (`used`, `limit`, `resetAt`) : offres restantes, bouton bloqué et temps d'attente quand la limite est atteinte |
| Secours | `lib/core.js` | Si le relais est saturé ou injoignable : la carte n'est créée que si la page publie un `JobPosting` JSON-LD (entreprise ou intitulé) ; étiquettes par mots-clés (`keywordLabels`). Sinon : « Analyse indisponible et offre non détectée automatiquement, réessaie plus tard. » |
| Description | `lib/core.js` | Description JSON-LD si elle dépasse 300 caractères, sinon texte de la page ; tronquée à 16 000 caractères (limite Trello : 16 384) |
| Trello | `lib/trello.js` | Tableaux, étiquettes, création de la carte et pièce jointe |
| Ajout | `background.js`, `lib/add.js` | Le popup envoie `{type: "add", tabId, board, list}` ; l'arrière-plan enchaîne lecture, analyse et création, un seul ajout à la fois, puis affiche le badge et, si le popup est fermé, une notification |

Points notables :

- **Garde-fou `FOUND`** : si le modèle estime que la page n'est pas une offre précise, rien n'est créé.
- **Réponses du relais** : `401` → jeton effacé et retour à **Connecter Trello** ; `429` (limite du jour) → aucune carte, message de limite avec le temps d'attente ; `503`, `502` ou relais injoignable (délai de 25 s) → mode de secours. Le relais essaie lui-même les modèles Groq tour à tour.
- **Authentification Trello** : clé et jeton dans l'en-tête `Authorization: OAuth oauth_consumer_key="…", oauth_token="…"`, jamais dans l'URL. Si Trello répond 401 (jeton révoqué), l'extension efface le jeton et réaffiche **Connecter Trello**.
- **Étiquettes** : 1 à 3 par offre, uniquement parmi les étiquettes nommées du tableau choisi. Sans IA (`JobPosting` ou mode de secours), `keywordLabels` rattache chaque étiquette à un thème (DevOps, Cloud, Cybersécurité, Data, Développement, Marketing, RH…) d'après son nom, sans tenir compte de la casse ni des accents, et la choisit si l'offre contient un mot-clé du thème ou le nom de l'étiquette ; celles trouvées dans le titre passent en premier. Ça marche avec les étiquettes de n'importe quel tableau ; pour ajouter un thème, complète `THEMES` dans `lib/core.js`.
- **Connexion et ajout en arrière-plan** : Firefox ferme le popup dès qu'il perd le focus ; la connexion Trello et l'ajout des offres tournent donc dans `background.js`, gardé éveillé pendant le traitement. Un popup rouvert pendant un ajout affiche « Création de la carte… » puis le résultat.

## Tests

La logique (prompt, lecture des réponses, JSON-LD, mode de secours, limite quotidienne, clients du relais et de Trello) et le relais lui-même sont testés sous Node, sans dépendance :

```bash
npm test
```

Le popup et la connexion Trello se testent à la main dans Firefox (étape 4 de la mise en place).

## Sécurité et confidentialité

- **Clé Groq** : elle n'est **pas** dans l'extension. Elle est enregistrée comme secret du relais Cloudflare (`wrangler secret put GROQ_API_KEY`) et ne doit **jamais** apparaître dans le dépôt Git. En cas de fuite, régénère-la sur la console Groq puis remplace le secret, sans mise à jour de l'extension.
- **Jeton Trello** : propre à chaque utilisateur, stocké uniquement dans le profil Firefox (`storage.local`). Il donne accès en lecture et écriture au compte Trello ; l'utilisateur peut le révoquer depuis les réglages de son compte Trello, rubrique applications.
- **Données transmises** : au clic, le début du texte de la page est envoyé au relais, qui le transmet à Groq sans le conserver ; la description est envoyée à Trello. Le relais ne garde qu'un compteur quotidien lié à l'identifiant Trello (2 jours au plus) et un cache d'une heure de la vérification du jeton, sous forme hachée. Le manifeste le déclare (`data_collection_permissions` : `websiteContent`). Consulte les conditions d'utilisation de Groq et n'utilise l'extension que sur des offres publiques, pas sur des pages privées ou sensibles.
- **Permissions** : `activeTab` (lire la page active au clic), `storage`, `identity` (connexion Trello), `notifications` (résultat de l'ajout quand le popup est fermé), et l'accès à `api.trello.com` et au relais `stage-trello-relay.mimsaad03.workers.dev` uniquement.

- **Politique de confidentialité** : [`PRIVACY.md`](PRIVACY.md), accessible depuis le lien « Confidentialité » du popup (avant et après la connexion).

## Limites connues

- **40 analyses par jour et par compte Trello** au maximum, comptées par le relais (remise à zéro à minuit UTC, soit 01:00 ou 02:00 en France). Seules les analyses réussies comptent ; les offres qui publient un `JobPosting` complet sont ajoutées sans IA et ne comptent pas. Quand la limite est atteinte, le popup indique le temps restant avant la réinitialisation.
- Il faut l'**URL directe de l'offre**. Sur une page de liste ou une page générique, l'extension répond « Aucune offre trouvée sur cette page. ».
- Les pages protégées de Firefox (`about:`, boutique d'extensions) ne peuvent pas être lues.
- Sans données `JobPosting`, la description est le texte extrait par Readability : il peut contenir des éléments parasites ; relis la carte en cas de doute.
- Le modèle ne voit que les 10 000 premiers caractères de la page.
- Les quotas gratuits de Groq sont limités (≈ 330 analyses par jour pour tous les utilisateurs, voir la spec) ; en cas de surcharge, le relais passe au modèle suivant, puis l'extension passe au mode de secours.
- Testé sous Linux et Firefox ; non testé sous macOS/Windows ni sous Chrome.

## Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| `✗ config.js manquant ou incomplet` | `extension/config.js` absent, ou `TRELLO_KEY` / `RELAY_URL` vide | Restaurer `extension/config.js` depuis le dépôt (`git checkout extension/config.js`) |
| « Connexion Trello annulée. » sans avoir annulé | URL de redirection absente des « Allowed origins » de l'app Trello | Refaire l'étape 3 de la mise en place |
| « Session Trello expirée, reconnecte-toi. » | Jeton révoqué ou invalide (401) | Cliquer sur **Connecter Trello** |
| `✗ Erreur Trello 4xx : …` | Trello refuse la requête (liste supprimée, droits insuffisants) | Lire le message ; rechoisir le tableau et la liste |
| « Impossible de lire cette page. » | Page protégée de Firefox | Ouvrir l'offre dans un onglet normal |
| « Aucune offre trouvée sur cette page. » | Page générique, liste, lien expiré | Ouvrir l'offre elle-même |
| « Analyse indisponible et offre non détectée automatiquement… » | Relais saturé ou injoignable, et la page ne publie pas de `JobPosting` | Réessayer un peu plus tard |
| Étiquettes absentes ou peu pertinentes | Relais saturé ou injoignable (mode de secours) ou étiquettes sans nom | Vérifier le relais (`curl …/` doit répondre `{"ok":true}`, logs : `npx wrangler tail`) ; nommer les étiquettes Trello ; au besoin, compléter `THEMES` dans `lib/core.js` |
| « Limite de 40 offres par jour atteinte » | Limite quotidienne du relais | Attendre l'heure de réinitialisation affichée |

Pour voir les messages techniques (par exemple « Analyse indisponible ») : `about:debugging#/runtime/this-firefox` → **Examiner** sur l'extension.

## Licence

[MIT](LICENSE). L'extension inclut Mozilla Readability 0.6.0 (Apache-2.0), non modifié : voir [`extension/THIRD_PARTY_NOTICES.txt`](extension/THIRD_PARTY_NOTICES.txt).
