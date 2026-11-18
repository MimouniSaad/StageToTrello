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
| ID de l'extension | **`stage-trello@mimounisaad`** (disponibilité sur AMO à confirmer au premier envoi) | #2 |
| Nom public | **StageToTrello** (nom vérifié unique sur AMO) | #3 |
| Résumé AMO et description du manifeste | « Ajoute l’offre de stage ou d’emploi ouverte à ton tableau Trello en un clic : titre « Entreprise - Poste », description complète, lien et étiquettes choisies automatiquement. » | #3 |
| Langue | **Français uniquement** pour la v3 : interface, messages et fiche AMO en français. L'anglais (`_locales`) est reporté. | #4 |
| Support | **Issues GitHub** : https://github.com/MimouniSaad/StageToTrello/issues, avec le modèle `.github/ISSUE_TEMPLATE/bug.yml` | #7 |
| Modèles Groq | _à définir_ : proposition `gpt-oss-20b` en principal, `gpt-oss-120b` en secours, sous réserve de la qualité des réponses | #6 |
| Limite par utilisateur | **40 offres analysées par jour** (voir ci-dessous) | #5 |

### Limite d'utilisation (#5) — relevé du 18/11/2026

- **Limite** : 40 offres analysées par jour. Chaque analyse compte, même si aucune carte n'est créée (page qui n'est pas une offre, erreur Trello) : c'est l'analyse qui consomme le quota Groq partagé.
- **Réinitialisation** : chaque jour à minuit UTC (01:00 en heure d'hiver française, 02:00 en heure d'été), comme le futur relais. Une fois la limite atteinte, le bouton est bloqué et le popup affiche le temps restant et l'heure locale de réinitialisation, rafraîchis toutes les 20 s.
- **Mise en œuvre actuelle** : compteur dans `storage.local` (`lib/quota.js`), donc par profil Firefox. Il peut être contourné (changement d'horloge, réinstallation) : la limite qui fera foi sera celle du relais Cloudflare, par compte Trello (phase 2), avec la même valeur.
- **Coût mesuré d'une analyse** (relevé du 18/11/2026, 11 requêtes) : 12 000 tokens en entrée et 1 200 en sortie, soit **≈ 1 200 tokens par requête** en moyenne (≈ 1 090 en entrée, ≈ 110 en sortie). C'est bien en dessous du maximum, probablement parce que le texte extrait par Readability est en général nettement plus court que la limite de 10 000 caractères. **Pire cas** (page coupée à 10 000 caractères) : ≈ 3 200 tokens. Réserve : une analyse qui passe au modèle suivant compte pour plusieurs requêtes, le coût réel par analyse peut donc être légèrement supérieur.

### Limites Groq (#11) — offre Free, relevé du 18/11/2026

| Modèle | Requêtes/min | Requêtes/jour | Tokens/min | Tokens/jour |
|---|---|---|---|---|
| `openai/gpt-oss-20b` | 30 | 1 000 | 8 000 | 200 000 |
| `openai/gpt-oss-120b` | 30 | 1 000 | 8 000 | 200 000 |
| `qwen/qwen3.8-27b` (secours possible, qualité non testée) | 30 | 1 000 | 8 000 | 200 000 |

Les quotas sont comptés séparément pour chaque modèle. Ce sont les **tokens** qui limitent, pas le nombre de requêtes.

### Capacité calculée (offre Free)

Formules : `analyses/jour = min(requêtes/jour, tokens/jour ÷ coût)` et `analyses/min = tokens/min ÷ coût`.

| | Par modèle | 2 modèles (principal + secours) |
|---|---|---|
| Analyses par jour (coût moyen 1 200) | ≈ 166 | **≈ 330** |
| Analyses par minute (coût moyen 1 200) | ≈ 6 | **≈ 13** |
| Analyses par jour (pire cas 3 200) | ≈ 62 | ≈ 125 |
| Utilisateurs à 40 offres/jour | — | ≈ 8 |
| Utilisateurs actifs à ≈ 8 offres/jour (usage réaliste) | — | **≈ 40** |

Conséquences :
- La limite de **40 offres par jour et par utilisateur** est conservée : elle protège contre les abus sans gêner un usage normal.
- Le relais (phase 2) aura un **plafond global d'environ 300 analyses par jour** : au-delà, tous les utilisateurs passent en mode simple au lieu d'enchaîner les erreurs 429.
- Optimisation gratuite à prévoir : ne pas appeler Groq quand la page contient un `JobPosting` JSON-LD (entreprise, poste et description déjà connus).
- Au-delà d'environ 40 utilisateurs actifs par jour : passer à l'offre payante de Groq, avec un plafond de dépenses.

### Configuration commitée (version 3.0)

Depuis le relais, `extension/config.js` ne contient plus aucun secret (`TRELLO_KEY` publique, `RELAY_URL`, `DEFAULT_LIST`). Il est **commité** et `config.example.js` est supprimé : le paquet envoyé à AMO correspond exactement au dépôt. La clé Groq n'existe que dans les secrets du relais Cloudflare.
