# Politique de confidentialité — StageToTrello

*Dernière mise à jour : 18 novembre 2026*

StageToTrello est une extension Firefox gratuite et open source qui ajoute l'offre de stage ou d'emploi ouverte dans le navigateur à un tableau Trello. Elle est éditée par Saad Mimouni ; le code source est public : <https://github.com/MimouniSaad/StageToTrello>.

StageToTrello n'est pas affiliée à Trello ni à Atlassian.

## En bref

- L'extension ne lit une page **que lorsque tu cliques** sur « Ajouter à Trello » (ou utilises le raccourci), et seulement l'onglet actif.
- Le texte de l'offre sert à créer la carte. Il est envoyé à **Trello** (ton compte) et, si l'analyse par IA est nécessaire, à notre **relais** puis à **Groq**. Il n'est **conservé ni par l'extension ni par le relais**.
- Aucune publicité, aucun outil de mesure d'audience, aucune revente de données.

## Données traitées

### 1. Contenu de la page de l'offre
Au clic, l'extension lit dans l'onglet actif : l'adresse de la page, son titre, le nom du site, les données structurées d'offre d'emploi (`JobPosting`) si la page en publie, et le texte principal (10 000 premiers caractères).

- **Si la page publie un `JobPosting` complet** (entreprise et intitulé), la carte est créée directement : rien n'est envoyé au relais ni à Groq.
- **Sinon**, ces éléments et les noms des étiquettes de ton tableau sont envoyés au relais StageToTrello, qui les transmet à Groq pour déterminer l'entreprise, l'intitulé et les étiquettes. Le relais ne les enregistre pas.

### 2. Compte Trello
- **Jeton Trello** : obtenu quand tu cliques sur « Connecter Trello » et autorises l'application sur la page officielle de Trello. Il donne accès en lecture et écriture à ton compte Trello, pour lister tes tableaux et créer les cartes. Il est stocké **uniquement dans ton profil Firefox**. Il est aussi envoyé au relais à chaque analyse, qui s'en sert seulement pour vérifier auprès de Trello que la demande vient d'un utilisateur connecté.
- **Carte créée** : titre « Entreprise - Poste », description de l'offre, lien de l'offre et étiquettes, dans la liste que tu as choisie.

### 3. Données conservées

| Où | Quoi | Durée |
|---|---|---|
| Ton profil Firefox (`storage.local`) | Jeton Trello, dernier tableau et dernière liste choisis, option « Envoyer dès l'ouverture », compteur d'analyses du jour | Jusqu'à la déconnexion (lien « Déconnecter ») ou la désinstallation de l'extension |
| Relais StageToTrello (Cloudflare Workers KV) | Identifiant interne de ton compte Trello et nombre d'analyses du jour, pour appliquer la limite de 40 par jour | 2 jours au plus |
| Relais StageToTrello (Cloudflare Workers KV) | Empreinte (hash SHA-256) du jeton Trello associée à l'identifiant du compte, pour éviter de redemander à Trello à chaque clic. Le jeton lui-même n'est pas conservé | 1 heure |

Le relais ne conserve ni le contenu des pages, ni les adresses des offres, ni ton nom, ni ton adresse e-mail.

## Services tiers

| Service | Rôle | Politique de confidentialité |
|---|---|---|
| Trello (Atlassian) | Connexion, tableaux, création des cartes | <https://www.atlassian.com/legal/privacy-policy> |
| Cloudflare | Hébergement du relais (`stage-trello-relay.mimsaad03.workers.dev`). Cloudflare traite techniquement l'adresse IP pour acheminer les requêtes ; le relais ne l'enregistre pas | <https://www.cloudflare.com/privacypolicy/> |
| Groq | Analyse du texte de l'offre par un modèle d'IA | <https://groq.com/privacy-policy/> |

## Tes choix

- **Ne clique sur « Ajouter à Trello » que sur des offres publiques**, pas sur des pages privées ou sensibles : c'est le contenu de la page active qui est lu.
- **Déconnexion** : le lien « Déconnecter » efface le jeton Trello de l'extension.
- **Révoquer l'accès** : dans Trello, ouvre les paramètres de ton compte, rubrique des applications autorisées, et révoque « StageToTrello ».
- **Tout effacer** : désinstaller l'extension supprime les données stockées dans Firefox ; le compteur du relais disparaît de lui-même au bout de 2 jours.

## Contact

Pour toute question ou demande liée à tes données : ouvre un ticket sur <https://github.com/MimouniSaad/StageToTrello/issues>. N'y colle jamais ton jeton Trello.

## Modifications

Toute modification de cette politique est publiée dans ce fichier, avec sa date de mise à jour. L'historique complet est visible dans le dépôt GitHub.
