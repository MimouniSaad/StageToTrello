# Journal des modifications

Toutes les modifications notables de StageToTrello sont décrites ici.

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Numérotation : [Semantic Versioning](https://semver.org/lang/fr/) (`MAJEUR.MINEUR.CORRECTIF`).

## [Non publié]

### Modifié
- Politique de confidentialité : mention du compteur de pages sans offre conservé par le relais (#118).

### Sécurité
- Wrangler figé à une version exacte dans `package-lock.json` (avec son empreinte) ; la CI refuse d'en télécharger une autre version (`npx --no-install`) (#114).

## [3.1.0] - 2026-11-21

Nouveau design du popup, description des cartes mise en forme, et chaîne DevOps complète (CI, protection des branches, release automatique, Dependabot, ESLint et Prettier, conteneur de développement).

### Ajouté
- CI GitHub Actions sur chaque PR et chaque push vers `develop` et `main` : tests, lint de l'extension, paquet AMO, construction du relais (#53).
- Protection des branches `main` et `develop` par un ruleset ; `main` n'accepte que des PR venant de `develop` (#54).
- Numérotation SemVer, ce journal des modifications et vérification de la cohérence des versions en CI (#57).
- Couverture de tests mesurée en CI avec seuils minimaux (lignes 95 %, branches 85 %, fonctions 95 %) et résumé dans l'exécution ; nouveaux tests des cas d'erreur du relais (#56).
- Release automatique : une étiquette `v<version>` sur `main` crée la GitHub Release avec le zip et les notes du CHANGELOG, après vérification de la version (#58).
- Dependabot : mises à jour hebdomadaires groupées des dépendances npm et des GitHub Actions, PR vers `develop` (#59).
- ESLint (configuration par environnement : extension, relais, tests, scripts) et Prettier, vérifiés par la CI dans le job « Lint de l'extension » ; scripts `lint:js`, `format`, `format:check` (#55).
- Conteneur de développement (`.devcontainer/`) : Node 22 (image figée), dépendances installées automatiquement, GitHub CLI, extensions ESLint et Prettier, port du relais local, jeton Cloudflare transmis depuis la machine hôte (#60).
- Lien d'installation depuis addons.mozilla.org et badges AMO (version publiée, nombre d'utilisateurs) dans le README.

### Modifié
- Nouveau design du popup, plus apaisant : palette douce, mode sombre dédié, compteur avec barre de progression, bandeau d'état avec icône, focus visible au clavier (#61).
- Description de la carte mise en forme en Markdown : titres, sous-titres, paragraphes, gras, listes et liens de l'offre conservés, sans lignes parasites (#100).

### Corrigé
- Le compteur ne baisse plus sur les pages qui ne sont pas des offres : le relais ne compte que les analyses qui trouvent une offre ; les pages sans offre restent bornées à 20 gratuites par jour et par compte, puis comptent (#118).

## [3.0.0] - 2026-11-18

Première version publique, sur addons.mozilla.org.

### Ajouté
- Connexion à Trello en un clic (flux d'autorisation officiel), sans clé à créer.
- Relais Cloudflare Worker : la clé Groq n'est plus dans l'extension ; vérification du jeton Trello ; limite de 40 analyses par jour et par compte Trello.
- Ajout en arrière-plan : badge `…`/`✓`/`✗`, notification si le popup est fermé, un seul ajout à la fois.
- Création directe, sans IA, quand la page publie un `JobPosting` complet ; titre nettoyé (H/F, durée, ville).
- Étiquettes par mots-clés valables pour n'importe quel tableau (`THEMES`).
- Politique de confidentialité (`PRIVACY.md`) et lien « Confidentialité » dans le popup.
- Script `npm run package` : vérifications, tests, lint et zip pour AMO.
- Nom public StageToTrello et nouveau logo.

### Modifié
- Le mode de secours ne crée une carte que pour une offre avec `JobPosting`.

### Supprimé
- Serveur Python local (`server.py`, `add_stage.py`, service systemd).

### Sécurité
- Aucun secret dans le paquet de l'extension ; clé Groq en secret Cloudflare.

## [2.0] - 2026-11-17

Extension autonome (sans serveur Python), clé Groq intégrée au paquet ; diffusion privée uniquement.

## [1.2] - 2026-11-17

Extension Firefox et serveur Python local (Gemini puis Groq) ; usage personnel.

[Non publié]: https://github.com/MimouniSaad/StageToTrello/compare/v3.1.0...develop
[3.1.0]: https://github.com/MimouniSaad/StageToTrello/compare/v3.0.0...v3.1.0
[3.0.0]: https://github.com/MimouniSaad/StageToTrello/releases/tag/v3.0.0
