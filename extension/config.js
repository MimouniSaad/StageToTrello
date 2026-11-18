// Configuration de l'extension. Aucun secret ici :
// - TRELLO_KEY est la clé publique de l'application Trello StageToTrello (identique pour tous les
//   utilisateurs) ; chaque utilisateur obtient son propre jeton en cliquant sur « Connecter Trello ».
// - La clé Groq reste sur le relais Cloudflare (secret GROQ_API_KEY), jamais dans l'extension.
const CONFIG = {
  TRELLO_KEY: "02f429cd8c24a132c9d118d78f6eab9a",
  RELAY_URL: "https://stage-trello-relay.mimsaad03.workers.dev",
  DEFAULT_LIST: "Stages",
};
