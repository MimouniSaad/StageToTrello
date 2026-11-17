# Stage → Trello

Extension Firefox qui transforme une offre de stage (ou d'emploi) ouverte dans le navigateur en **carte Trello complète, en un clic**. Rien à installer en dehors de Firefox : l'utilisateur clique sur **Connecter Trello**, autorise l'accès, et c'est prêt.

Chaque carte contient :

- un **titre normalisé** : `Entreprise - Poste` (ex. `Capgemini - Ingénieur GRC`) ;
- la **description de l'offre** (missions, profil, avantages…), reprise des données structurées de la page ou, à défaut, de son texte principal ;
- le **lien de l'offre en pièce jointe** ;
- des **étiquettes** (DevOps, Cloud, Cybersécurité…) choisies parmi celles du tableau.

L'entreprise, l'intitulé du poste et les étiquettes sont déterminés par un modèle hébergé chez Groq, ce qui fonctionne sur n'importe quel site sans règles à écrire site par site.

---

## Sommaire

1. [Comment ça marche](#comment-ça-marche)
2. [Contenu du dépôt](#contenu-du-dépôt)
3. [Mise en place (propriétaire de l'extension)](#mise-en-place-propriétaire-de-lextension)
4. [Utilisation](#utilisation)
5. [Détail du fonctionnement](#détail-du-fonctionnement)
6. [Tests](#tests)
7. [Sécurité et confidentialité](#sécurité-et-confidentialité)
8. [Limites connues](#limites-connues)
9. [Dépannage](#dépannage)
10. [Licence](#licence)

---

## Comment ça marche

```
 Firefox                                               Services externes
┌──────────────────────────────────────┐
│  Popup                               │   ┌──────────────┐
│   1. lit la page de l'offre          │──▶│ API Groq     │ entreprise, poste, étiquettes
│   2. extrait les informations        │   └──────────────┘
│   3. crée la carte                   │   ┌──────────────┐
│                                      │──▶│ API Trello   │ tableaux, carte, pièce jointe
│  Arrière-plan : connexion Trello     │   └──────────────┘
└──────────────────────────────────────┘
```

1. Au premier usage, l'utilisateur clique sur **Connecter Trello**. La page d'autorisation officielle de Trello s'ouvre ; après accord, Trello renvoie un jeton personnel que l'extension garde dans son stockage local.
2. Sur la page d'une offre, le popup affiche ses tableaux et listes Trello.
3. Au clic sur **Ajouter à Trello**, l'extension lit la page telle qu'elle est affichée (données `JobPosting` JSON-LD, titre, nom du site, texte principal via Mozilla Readability).
4. Elle demande à Groq l'entreprise, l'intitulé et les étiquettes, puis crée la carte et y joint le lien.

## Contenu du dépôt

```
.
├── extension/
│   ├── manifest.json         # Manifeste Firefox (Manifest V2)
│   ├── config.example.js     # Modèle de configuration (à copier en config.js, jamais commité)
│   ├── background.js         # Connexion Trello (flux d'autorisation officiel)
│   ├── popup.html, popup.js  # Popup : connexion, choix du tableau et de la liste, envoi
│   ├── icon.svg
│   └── lib/
│       ├── core.js           # Logique pure : prompt, lecture de réponse, JSON-LD, mode de secours
│       ├── groq.js           # Client Groq (modèles tour à tour, relances)
│       ├── trello.js         # Client Trello (en-tête OAuth, erreurs lisibles)
│       ├── page.js           # Script injecté dans l'onglet pour lire la page
│       └── Readability.js    # Mozilla Readability 0.6.0 (Apache-2.0)
├── tests/                    # Tests Node (node --test)
├── package.json
└── docs/superpowers/         # Design et plan d'implémentation
```

## Mise en place (propriétaire de l'extension)

Ces étapes ne sont à faire qu'une fois, par la personne qui publie l'extension. Les utilisateurs n'ont rien à configurer.

### 1. Créer l'application Trello

1. Crée une application sur <https://trello.com/power-ups/admin> (choisis « **n'utilise pas les fonctionnalités Power-up** »).
2. Dans la section **API Key**, génère une clé. Cette clé est **publique** : elle identifie l'application, pas un utilisateur. Seul le jeton obtenu par chaque utilisateur est secret.

### 2. Configurer l'extension

```bash
cp extension/config.example.js extension/config.js
```

Remplis `extension/config.js` :

| Champ | Description |
|---|---|
| `TRELLO_KEY` | Clé de l'application Trello (étape 1) |
| `GROQ_API_KEY` | Clé Groq (<https://console.groq.com/keys>) ; vide = mode de secours par mots-clés, moins fiable |
| `GROQ_MODELS` | Modèles essayés dans l'ordre, du préféré au dernier recours |
| `DEFAULT_LIST` | Nom de la liste présélectionnée au premier usage (défaut : `Stages`) |

`config.js` est dans `.gitignore` : **ne le commite jamais**.

### 3. Autoriser l'URL de redirection dans Trello

Trello ne renvoie le jeton qu'aux adresses autorisées.

1. Charge l'extension (voir l'étape 4), ouvre `about:debugging#/runtime/this-firefox`, clique sur **Examiner** à côté de « Stage vers Trello » et tape dans la console :

   ```js
   browser.identity.getRedirectURL()
   ```

2. Copie l'adresse obtenue (de la forme `https://….extensions.allizom.org/`) et ajoute-la dans **Allowed origins** de l'application Trello (<https://trello.com/power-ups/admin>).

Cette adresse dépend de l'identifiant de l'extension (`browser_specific_settings.gecko.id` dans `manifest.json`) : si tu le changes, recommence cette étape.

### 4. Installer l'extension

**Pour tester (temporaire, disparaît au redémarrage de Firefox)** : `about:debugging#/runtime/this-firefox` → **Charger un module complémentaire temporaire…** → `extension/manifest.json`.

**Pour une installation permanente** : Firefox n'accepte que les extensions signées par Mozilla. La signature « non listée » est gratuite et l'extension reste privée.

1. Si besoin, change l'identifiant dans `extension/manifest.json` pour qu'il soit unique (puis refais l'étape 3).
2. Crée le paquet (il contient `config.js`) :

   ```bash
   cd extension && zip -r ../stage-trello.zip . && cd ..
   ```

3. Envoie `stage-trello.zip` sur <https://addons.mozilla.org/developers/> (**Submit a New Add-on** → **On your own**). À la question sur le code source, réponds **No** (aucune minification ni outil de build).
4. Télécharge le `.xpi` signé et distribue-le. Installation : `about:addons` → ⚙ → **Installer un module depuis un fichier…**.

Pour publier une mise à jour, incrémente `"version"` dans `manifest.json` : Mozilla refuse de signer deux fois la même version.

## Utilisation

1. Installe l'extension et épingle son bouton dans la barre d'outils.
2. Ouvre le popup et clique sur **Connecter Trello**, puis autorise l'accès dans la fenêtre Trello. Le popup peut se fermer pendant l'autorisation : rouvre-le ensuite.
3. Ouvre la **page de l'offre elle-même** (pas une liste de résultats), puis le popup (bouton ou `Alt+Shift+S`).
4. Choisis le tableau et la liste (le choix est mémorisé), puis clique sur **Ajouter à Trello**. Coche « Envoyer dès l'ouverture » pour que les prochaines ouvertures du popup envoient directement l'offre.
5. Le popup affiche `✓ Entreprise - Poste`, ou `✗` avec le message d'erreur.

Si la page ne contient pas d'offre (page générique, lien expiré, liste de résultats), **aucune carte n'est créée**. Le lien **Déconnecter** efface le jeton Trello de l'extension.

## Détail du fonctionnement

| Étape | Fichier | Rôle |
|---|---|---|
| Connexion | `background.js` | `browser.identity.launchWebAuthFlow` vers `https://trello.com/1/authorize` (`scope=read,write`, `expiration=never`, `callback_method=fragment`) ; jeton lu dans le fragment de l'URL de retour et stocké dans `storage.local` |
| Lecture | `lib/page.js` | Injecté dans l'onglet : JSON-LD, `og:title`, `og:site_name`, `<title>`, texte principal via Readability (repli sur le texte visible) |
| Extraction | `lib/groq.js`, `lib/core.js` | Envoie les 10 000 premiers caractères à Groq et lit 4 lignes : `FOUND`, `COMPANY`, `TITLE`, `LABELS` |
| Secours | `lib/core.js` | Sans clé Groq ou si Groq échoue : entreprise et titre depuis le JSON-LD ou les métadonnées, étiquettes par mots-clés (`KEYWORDS`) |
| Description | `lib/core.js` | Description JSON-LD si elle dépasse 300 caractères, sinon texte de la page ; tronquée à 16 000 caractères (limite Trello : 16 384) |
| Trello | `lib/trello.js` | Tableaux, étiquettes, création de la carte et pièce jointe |

Points notables :

- **Garde-fou `FOUND`** : si le modèle estime que la page n'est pas une offre précise, rien n'est créé.
- **Résilience Groq** : les modèles sont essayés tour à tour en cas d'erreur 429/5xx, sur 2 tours avec une seule pause (selon `retry-after`, 10 s max) ; ensuite le mode de secours prend le relais, pour que le popup ne reste pas bloqué. Pour les modèles `gpt-oss`, `reasoning_effort` est réglé sur `low`.
- **Authentification Trello** : clé et jeton dans l'en-tête `Authorization: OAuth oauth_consumer_key="…", oauth_token="…"`, jamais dans l'URL. Si Trello répond 401 (jeton révoqué), l'extension efface le jeton et réaffiche **Connecter Trello**.
- **Étiquettes** : 1 à 3 par offre, uniquement parmi les étiquettes nommées du tableau choisi. `KEYWORDS` (mode de secours) doit utiliser les mêmes noms.
- **Connexion en arrière-plan** : Firefox ferme le popup quand la fenêtre d'autorisation prend le focus ; le flux tourne donc dans `background.js`.

## Tests

La logique (prompt, lecture des réponses, JSON-LD, mode de secours, clients Groq et Trello) est testée sous Node, sans dépendance :

```bash
npm test
```

Le popup et la connexion Trello se testent à la main dans Firefox (étape 4 de la mise en place).

## Sécurité et confidentialité

- **Clé Groq** : elle est incluse dans le paquet de l'extension, donc lisible par toute personne qui l'ouvre, et le quota gratuit est partagé entre tous les utilisateurs. C'est acceptable pour une diffusion restreinte ; en cas d'abus, régénère-la sur la console Groq. Elle ne doit **jamais** apparaître dans le dépôt Git.
- **Jeton Trello** : propre à chaque utilisateur, stocké uniquement dans le profil Firefox (`storage.local`). Il donne accès en lecture et écriture au compte Trello ; l'utilisateur peut le révoquer depuis les réglages de son compte Trello, rubrique applications.
- **Données transmises** : au clic, le début du texte de la page est envoyé à Groq et la description à Trello. Le manifeste le déclare (`data_collection_permissions` : `websiteContent`). Consulte les conditions d'utilisation de Groq et n'utilise l'extension que sur des offres publiques, pas sur des pages privées ou sensibles.
- **Permissions** : `activeTab` (lire la page active au clic), `storage`, `identity` (connexion Trello), et l'accès à `api.trello.com` et `api.groq.com` uniquement.

## Limites connues

- Il faut l'**URL directe de l'offre**. Sur une page de liste ou une page générique, l'extension répond « Aucune offre trouvée sur cette page. ».
- Les pages protégées de Firefox (`about:`, boutique d'extensions) ne peuvent pas être lues.
- Sans données `JobPosting`, la description est le texte extrait par Readability : il peut contenir des éléments parasites ; relis la carte en cas de doute.
- Le modèle ne voit que les 10 000 premiers caractères de la page.
- Les quotas gratuits de Groq sont limités et peuvent changer ; en cas de surcharge, l'extension passe au modèle suivant, puis au mode de secours.
- Testé sous Linux et Firefox ; non testé sous macOS/Windows ni sous Chrome.

## Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| `✗ config.js manquant` | `extension/config.js` absent ou `TRELLO_KEY` vide | Copier `config.example.js` en `config.js` et le remplir |
| « Connexion Trello annulée. » sans avoir annulé | URL de redirection absente des « Allowed origins » de l'app Trello | Refaire l'étape 3 de la mise en place |
| « Session Trello expirée, reconnecte-toi. » | Jeton révoqué ou invalide (401) | Cliquer sur **Connecter Trello** |
| `✗ Erreur Trello 4xx : …` | Trello refuse la requête (liste supprimée, droits insuffisants) | Lire le message ; rechoisir le tableau et la liste |
| « Impossible de lire cette page. » | Page protégée de Firefox | Ouvrir l'offre dans un onglet normal |
| « Aucune offre trouvée sur cette page. » | Page générique, liste, lien expiré | Ouvrir l'offre elle-même |
| Étiquettes absentes ou peu pertinentes | Groq indisponible (mode de secours) ou étiquettes sans nom | Vérifier la clé Groq ; nommer les étiquettes Trello ; aligner `KEYWORDS` |

Pour voir les messages techniques (par exemple « IA indisponible ») : `about:debugging#/runtime/this-firefox` → **Examiner** sur l'extension.

## Licence

[MIT](LICENSE).
