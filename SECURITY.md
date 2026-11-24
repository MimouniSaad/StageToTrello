# Politique de sécurité

> **English:** please report security vulnerabilities **privately** through [GitHub's private vulnerability reporting](https://github.com/MimouniSaad/StageToTrello/security/advisories/new), never in a public issue. Reports in English are welcome.

StageToTrello est un projet open source maintenu par une seule personne, sur son temps libre. Les signalements de sécurité sont pris au sérieux et traités en priorité, dans la mesure des délais indiqués ci-dessous.

## Versions prises en charge

| Composant | Version prise en charge | Remarque |
|---|---|---|
| Extension Firefox | **la dernière version publiée** sur [addons.mozilla.org](https://addons.mozilla.org/fr/firefox/addon/stagetotrello/) | Firefox met l'extension à jour automatiquement : un correctif est publié dans une nouvelle version, pas sur les anciennes. |
| Relais (Cloudflare Worker) | la version déployée | Service unique, sans versions côté utilisateur : un correctif s'applique à tous les utilisateurs dès son déploiement. |

## Signaler une vulnérabilité

**Utilise le signalement privé de GitHub :** onglet **Security** du dépôt → **Report a vulnerability**, ou directement :
<https://github.com/MimouniSaad/StageToTrello/security/advisories/new>

Le rapport n'est visible que par le mainteneur. On peut y échanger en privé et, si besoin, préparer le correctif avant toute publication.

**Ne signale pas une faille** dans un ticket public, une pull request, une discussion ou sur un réseau social : elle deviendrait exploitable avant d'être corrigée.

Pour un traitement rapide, indique si possible :

- le composant concerné (extension ou relais) et la version de l'extension (`about:addons`) ;
- une description de la faille et de son impact (qu'est-ce qu'un attaquant peut obtenir ou faire ?) ;
- les étapes pour la reproduire, ou une preuve de concept minimale ;
- tes conditions de publication et la façon dont tu souhaites être remercié.

**N'envoie jamais un vrai jeton, une vraie clé ou les données d'une autre personne**, même dans le rapport privé : remplace-les par `XXXX`.

## Délais indicatifs

| Étape | Délai visé |
|---|---|
| Accusé de réception | sous **7 jours** |
| Première évaluation (faille confirmée ou non, gravité) | sous **14 jours** |
| Correctif d'une faille critique ou haute | dès que possible, objectif **30 jours** |
| Correctif d'une faille moyenne ou basse | dans une prochaine version |

Ces délais ne sont pas un engagement contractuel. Tu seras tenu au courant de l'avancement dans le rapport privé.

Une fois le correctif publié (nouvelle version sur AMO ou relais redéployé), un **avis de sécurité** (GitHub Security Advisory) décrit la faille, les versions concernées et la correction, avec un identifiant CVE si la gravité le justifie. Les personnes qui ont signalé la faille y sont remerciées, si elles le souhaitent, ainsi que dans le [journal des modifications](CHANGELOG.md). Le projet n'a pas de programme de récompense (*bug bounty*).

## Périmètre

### Dans le périmètre

- **L'extension** (`extension/`), telle que publiée sur AMO.
- **Le relais** (`relay/`) et le Worker déployé sur `stage-trello-relay.mimsaad03.workers.dev`.
- **La chaîne de publication** de ce dépôt (workflows GitHub Actions, paquet joint aux releases).

Exemples de failles recherchées :

- vol ou fuite du jeton Trello d'un utilisateur (par une page web, un autre site, les journaux du relais…) ;
- contournement de la vérification du jeton par le relais, ou accès aux compteurs d'un autre compte Trello ;
- fuite de la clé Groq conservée par le relais ;
- contournement à grande échelle de la limite quotidienne permettant d'épuiser le quota du relais ;
- exécution de code ou injection de contenu dans le popup, la page visitée ou la carte Trello à partir du contenu d'une offre ;
- contenu d'une page qui détourne l'analyse par IA pour provoquer une action non voulue (au-delà d'une simple carte mal remplie) ;
- permissions de l'extension utilisables au-delà de leur objectif.

### Hors périmètre

- Les failles de **Trello, Groq, Cloudflare, Firefox ou addons.mozilla.org** : signale-les à l'éditeur concerné.
- La **clé publique de l'application Trello** dans `extension/config.js` : elle est publique par conception (seul le jeton de chaque utilisateur donne accès à un compte), voir le README.
- Les limites **voulues et documentées** : 40 analyses par jour et par compte Trello, 20 pages sans offre gratuites par jour.
- Une carte mal remplie (mauvaise entreprise, mauvais intitulé) : c'est un bug, à signaler dans un [ticket](https://github.com/MimouniSaad/StageToTrello/issues/new/choose).
- Les rapports d'outils automatiques sans démonstration d'un impact réel, l'ingénierie sociale, l'accès physique à l'appareil, et les attaques par déni de service volumétrique.

## Tests de bonne foi

Les recherches menées de bonne foi dans le respect de ces règles sont bienvenues :

- teste uniquement avec **ton propre compte Trello** et tes propres tableaux ;
- n'accède pas aux données d'autres personnes, ne les modifie pas et ne les conserve pas ; si cela arrive par accident, arrête-toi et signale-le ;
- limite le nombre de requêtes au relais : il dépend d'un quota gratuit partagé par tous les utilisateurs ; pas de scan automatisé massif ni de test de charge ;
- laisse un délai raisonnable pour corriger avant toute publication.
