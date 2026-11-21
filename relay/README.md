# Relais StageToTrello (Cloudflare Worker)

Le relais garde la clé Groq côté serveur. L'extension lui envoie le contenu de l'offre avec le jeton Trello de l'utilisateur ; il :

1. vérifie le jeton auprès de Trello (`/members/me`) et met l'ID du membre en cache 1 h, sous le hash SHA-256 du jeton ;
2. applique la limite de **40 analyses par jour et par compte Trello** (remise à zéro à minuit UTC). Seules les analyses qui trouvent une offre comptent ; les pages sans offre (`FOUND: no`) sont gratuites dans la limite de **20 par jour** (`FREE_MISSES`), puis comptent comme les autres, pour que le nombre d'appels à Groq reste borné ;
3. construit le prompt avec `Core.buildPrompt` (le même code que l'extension) et appelle Groq, en passant au modèle suivant en cas de 429 ou 5xx ;
4. renvoie le texte de la réponse, le modèle utilisé et le compteur du jour.

Compteurs dans KV : `use:<membre>:<jour>` (analyses comptées) et `miss:<membre>:<jour>` (pages sans offre gratuites), effacés après 2 jours.

Rien d'autre n'est stocké : ni contenu de page, ni jeton en clair.

Adresse : `https://stage-trello-relay.mimsaad03.workers.dev`

## API

`POST /extract` avec `Authorization: Bearer <jeton Trello>` et le corps JSON :

```json
{ "url": "https://…", "title": "…", "site": "…", "text": "texte de l'offre", "labels": ["Cloud", "DevOps"] }
```

| Code | `code` | Signification |
|---|---|---|
| 200 | — | `{ ok, content, model, found, used, limit, resetAt }` ; `found` indique si l'IA a trouvé une offre |
| 400 | `bad_request` | Corps invalide (URL non http(s), texte vide, JSON invalide) |
| 401 | `unauthorized` | Jeton absent, mal formé ou refusé par Trello |
| 429 | `daily_limit` | Limite du jour atteinte ; `resetAt` = minuit UTC suivant (ms) |
| 502 | `trello_unreachable` | Trello injoignable |
| 503 | `groq_busy` | Tous les modèles sont indisponibles ou le quota Groq du jour est épuisé ; `retryAfter` en secondes |

`GET /` répond `{"ok":true}`.

Champs bornés : URL 2 000 caractères, titre 500, site 200, texte 10 000, 50 étiquettes de 60 caractères au plus.

## Réglages (`wrangler.toml`)

| Variable | Valeur | Rôle |
|---|---|---|
| `GROQ_MODELS` | `openai/gpt-oss-120b,openai/gpt-oss-20b` | Ordre des modèles essayés |
| `DAILY_LIMIT` | `40` | Analyses réussies par compte Trello et par jour |

Secrets (jamais dans le dépôt) : `GROQ_API_KEY` (clé `stage-trello-prod`) et `TRELLO_KEY` (clé publique de l'app Trello).

## Déploiement (depuis ce dossier)

```bash
cd relay
npx wrangler kv namespace create USAGE      # copie l'id affiché dans wrangler.toml (id = "…")
npx wrangler secret put GROQ_API_KEY
npx wrangler secret put TRELLO_KEY
npx wrangler deploy
curl https://stage-trello-relay.mimsaad03.workers.dev/   # → {"ok":true}
```

Logs en direct : `npx wrangler tail`.

## Tests

```bash
npm test          # à la racine du dépôt : extension + relais
```

## Limites de l'offre gratuite

- Cloudflare Workers : 100 000 requêtes/jour.
- Workers KV : 1 000 écritures/jour. Chaque analyse réussie fait 1 écriture, plus 1 par utilisateur et par heure pour le cache du jeton : largement suffisant face au quota Groq (≈ 330 analyses/jour, voir la spec).
