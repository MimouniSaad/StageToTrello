# Extension autonome avec connexion Trello

## Intention

Supprimer le serveur Python local : l'extension Firefox fait tout elle-même. Les utilisateurs n'ont plus à créer une clé et un jeton Trello à la main ; ils cliquent sur « Connecter Trello », autorisent l'application sur la page officielle de Trello, et le jeton arrive directement dans l'extension. Peu d'utilisateurs au départ.

## Objectifs

- Aucune installation hors de Firefox (plus de Python, venv, systemd, `.env`).
- Connexion Trello en un clic via le flux d'autorisation officiel.
- Même qualité d'extraction qu'aujourd'hui (Groq + données JSON-LD + secours par mots-clés).

## Non-objectifs

- Support de Chrome.
- Utilisation en ligne de commande (`add_stage.py` est supprimé).
- Clé Groq par utilisateur.

## Anti-objectifs

- Publier la clé Groq sur GitHub.
- Réintroduire un serveur (proxy compris).

## Approches

1. **Retenue : clé Groq du propriétaire intégrée à l'extension**, dans un `config.js` ignoré par git. Risque accepté : la clé est lisible par quiconque ouvre le paquet ; quota gratuit partagé.
2. Clé Groq saisie par chaque utilisateur : refusée par le propriétaire (trop de friction).
3. Proxy hébergé gardant la clé : refusé, recrée un serveur.

## Décisions

- **Supprimés** : `server.py`, `add_stage.py`, `requirements.txt`, `systemd/`, `.env.example`, `extension/options.html`, `extension/options.js`.
- **`extension/config.js`** (ignoré par git) : `TRELLO_KEY` (publique), `GROQ_API_KEY`, `GROQ_MODELS`, `DEFAULT_LIST` ; `config.example.js` commité.
- **Connexion** : `browser.identity.launchWebAuthFlow` vers `https://trello.com/1/authorize?key=…&name=Stage%20vers%20Trello&scope=read,write&expiration=never&response_type=token&callback_method=fragment&return_url=<browser.identity.getRedirectURL()>` ; jeton lu dans le fragment `#token=…`, stocké dans `storage.local`. Lien « Déconnecter » qui l'efface. Un `401` de Trello efface le jeton et réaffiche « Connecter Trello ».
- **Popup** : écran de connexion si pas de jeton, sinon l'écran actuel (tableau, liste, envoi automatique, bouton).
- **Lecture de la page** dans l'onglet actif via `tabs.executeScript` : JSON-LD `JobPosting`, `og:title`, `og:site_name`, `<title>`, texte principal via Mozilla Readability (fichier embarqué, licence Apache-2.0) avec repli sur `document.body.innerText`.
- **Logique reprise de `add_stage.py`** : prompt 4 lignes (`FOUND`, `COMPANY`, `TITLE`, `LABELS`), texte limité à 10 000 caractères, essais des modèles tour à tour sur 429/5xx jusqu'à 3 tours, `reasoning_effort: low` pour `gpt-oss`, mode de secours `KEYWORDS`, description JSON-LD si > 300 caractères sinon texte de la page, tronquée à 16 000, titre `Entreprise - Poste`, URL en pièce jointe.
- **Trello** : en-tête `Authorization: OAuth oauth_consumer_key="…", oauth_token="…"`, erreurs lisibles (code + message), liste introuvable signalée clairement.
- **Manifeste** : MV2, version 2.0, permissions `activeTab`, `storage`, `identity`, `https://api.trello.com/*`, `https://api.groq.com/*` ; `data_collection_permissions` `websiteContent`.
- **README** réécrit, avec l'étape unique côté propriétaire : ajouter l'URL de redirection de l'extension dans les « Allowed origins » de l'app Trello.

## Laissé au constructeur

- Découpage exact des fichiers JS.
- Version précise de Readability embarquée (à vérifier, pas deviner).

## Décisions de publication (phase 0)

| Sujet | Décision | Ticket |
|---|---|---|
| ID de l'extension | _à définir_ | #2 |
| Nom public | **StageToTrello** (nom vérifié unique sur AMO) | #3 |
| Résumé AMO et description du manifeste | « Ajoute l’offre de stage ou d’emploi ouverte à ton tableau Trello en un clic : titre « Entreprise - Poste », description complète, lien et étiquettes choisies automatiquement. » | #3 |
| Langue | **Français uniquement** pour la v3 : interface, messages et fiche AMO en français. L'anglais (`_locales`) est reporté. | #4 |
| Support | **Issues GitHub** : https://github.com/MimouniSaad/StageTrello/issues, avec le modèle `.github/ISSUE_TEMPLATE/bug.yml` | #7 |
| Modèles Groq | _à définir après la mesure des limites_ | #6, #11 |
| Limite par utilisateur | _à définir après la mesure des limites_ | #5, #11 |
