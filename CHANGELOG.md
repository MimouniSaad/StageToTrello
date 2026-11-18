# Journal des modifications

Toutes les modifications notables de StageToTrello sont décrites ici.

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/). Numérotation : [Semantic Versioning](https://semver.org/lang/fr/) (`MAJEUR.MINEUR.CORRECTIF`).

## [Non publié]

### Ajouté
- CI GitHub Actions sur chaque PR et chaque push vers `develop` et `main` : tests, lint de l'extension, paquet AMO, construction du relais (#53).
- Protection des branches `main` et `develop` par un ruleset ; `main` n'accepte que des PR venant de `develop` (#54).
- Numérotation SemVer, ce journal des modifications et vérification de la cohérence des versions en CI (#57).

### Modifié
- Nouveau design du popup, plus apaisant : palette douce, mode sombre dédié, compteur avec barre de progression, bandeau d'état avec icône, focus visible au clavier (#61).

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

[Non publié]: https://github.com/MimouniSaad/StageToTrello/compare/v3.0.0...develop
[3.0.0]: https://github.com/MimouniSaad/StageToTrello/releases/tag/v3.0.0
