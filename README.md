# 🎮 Bot Discord — MCBLOC (réseau Minecraft mini-jeux)

Bot Discord (discord.js v14) qui **configure tout le serveur en une commande** et le relie au réseau Minecraft :
statut en direct, vérification, rôles, tickets, modération + auto-mod, suggestions, giveaways, votes,
partenaires, **parrainage récompensé en pièces** et **VIP en jeu pour chaque boost**.

---

## 🚀 Héberger sur Railway

### 1. Projet et variables
<https://railway.com> → **New Project** → **Deploy from GitHub repo** → `mcblocdidi`. Onglet **Variables** :

| Variable | Valeur |
|---|---|
| `DISCORD_TOKEN` | le token du bot (uniquement la valeur, sans guillemets) |
| `CLIENT_ID` | l'ID de l'application |
| `GUILD_ID` | l'ID du serveur Discord |
| `DATA_DIR` | `/data` |
| `BRIDGE_SECRET` | une longue chaîne aléatoire (≥ 32 caractères), **identique** dans la config du proxy |
| `INVITE_REWARD` | *(optionnel)* pièces par invitation validée, 500 par défaut |
| `MC_HOST` / `MC_PORT` | *(optionnel)* IP du serveur Minecraft |
| `NETWORK_URL` | *(optionnel)* infos publiques du réseau, `https://mcbloc.fr/network.json` par défaut (liens, jeux, règles, votes) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | *(boutique)* clés Stripe : **uniquement ici**, jamais dans le code ni sur le site. Voir « Boutique Stripe » |
| `PUBLIC_ORIGINS` | *(optionnel)* sites autorisés à lire `/public/votes`, `/public/leaderboards` et `/public/guide`, `https://mcbloc.fr,https://www.mcbloc.fr` par défaut |

### 2. Volume (indispensable)
Clic droit sur le service → **Add Volume** → *Mount path* **`/data`**. Sans volume, le bot oublie tout à chaque mise à jour.

### 3. Domaine public (pour le pont Minecraft)
**Settings → Networking → Generate Domain**. Note l'adresse, ex. `https://mcblocdidi-production.up.railway.app`.

### 4. Déployer
Chaque `git push` redéploie. Logs attendus : `🌉 API du pont…` puis `✅ Connecté en tant que MCBLOC`.
⚠️ N'oublie pas d'arrêter le bot sur ton PC : deux instances répondraient en même temps.

---

## 🌉 Pont Discord ↔ Minecraft (mcblocManager)

Le **proxy BungeeCord** interroge le bot toutes les 30 s (connexion sortante : aucun port à ouvrir, MySQL reste privé).

1. Compile `mcblocManager` (`gradlew build`) et dépose **`proxy/build/libs/mcbloc-proxy-1.0.jar`** dans `plugins/` du BungeeCord.
2. Dans `plugins/mcbloc-proxy/config.yml` :
   ```yaml
   discord-bridge:
     enabled: true
     url: "https://mcblocdidi-production.up.railway.app"   # ton domaine Railway
     secret: "la-même-valeur-que-BRIDGE_SECRET"
     poll-seconds: 30
   ```
3. Redémarre le proxy. Log attendu : `Pont Discord actif (...)`. La table `mcbloc_discord_rewards` est créée automatiquement.

**Liaison de compte** : `/lier` sur Discord → code `MCB-XXXXXX` (10 min, usage unique) → `/lier MCB-XXXXXX` en jeu.
Chaque récompense a un identifiant unique : elle ne peut **jamais** être donnée deux fois, même en cas de coupure.

---

## 📖 Guide des jeux (#guide, /guide)

Le serveur Minecraft est la **seule source** : chaque serveur publie sa section (règles, commandes, chiffres tirés
de sa config) et le proxy l'envoie au bot (`POST /api/guide`) quand elle change, et en entier toutes les heures.

- **#guide** (catégorie INFORMATIONS, créé par `/setup`) : un message par section — Réseau, Progression, Grades,
  Cosmétiques, Piggy Wars, SumoGames, CoreWars, WildFarm. Seules les sections qui changent sont éditées, sans doublon.
  Les grands tableaux sont résumés (« … et N de plus : /guide en jeu »).
- **`/guide <section>`** : la même section, visible seulement par le joueur.
- **`GET /public/guide`** : le guide complet pour le site (pages mcbloc.fr/guide, catalogue des cosmétiques).
- Colonnes « _… » (icônes, identifiants) : données pour le site, jamais affichées sur Discord.

## 💳 Boutique Stripe (paiements de mcbloc.fr)

La boutique est sur le site ; **Stripe encaisse** (la micro-entreprise est le vendeur). Aucun produit à créer dans Stripe :
le bot envoie le nom et le **prix de `network.json`** au moment du paiement (le navigateur n'envoie que des identifiants
d'articles, jamais de prix).

| Étape | Route |
|---|---|
| Pseudo vérifié chez Mojang + session de paiement Stripe | `POST /public/shop/checkout` (10 par IP / 10 min) |
| Paiement confirmé, remboursé, contesté | `POST /stripe/webhook` : signature `Stripe-Signature` obligatoire (5 min max) |

- **Interrupteur unique** : `"shop": { "open": false }` dans `network.json` du site. Fermé = aucune session créée, boutons désactivés.
- **Ce qui est vendu** est enregistré par le bot à la création de la session ; le montant payé doit correspondre, sinon rien
  n'est livré (alerte).
- **Livraison** : par le proxy, avec les récompenses (`/api/rewards/pending`). Identifiant fixe `shop:<paiement>:<article>` :
  jamais livré deux fois, même si Stripe renvoie l'événement. Joueur hors ligne : livré à sa connexion.
- **Remboursement / litige** : retrait automatique (`shop-revoke:…`) de ce qui a été livré, jamais plus (pièces jusqu'à 0)
  + alerte dans #logs. Litige clos : alerte seulement. **Jamais de sanction automatique.**
- **Moyens de paiement** : ceux activés dans le tableau de bord Stripe (cartes, Apple Pay, Google Pay ; PayPal plus tard
  sans toucher au code).
- Achats : `$DATA_DIR/shop.json` ; en jeu : tables `mcbloc_purchases`, `mcbloc_boosters`, `mcbloc_network_booster`.

**Configuration Stripe** (une fois, en mode test d'abord) : clé secrète → `STRIPE_SECRET_KEY` ; webhook vers
`https://<domaine-railway>/stripe/webhook` avec `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed` ; son secret
(`whsec_…`) → `STRIPE_WEBHOOK_SECRET`. À l'ouverture : clé et webhook du mode réel.

## 🎁 Parrainage et boosts

| | Règle |
|---|---|
| **Invitation** | Le parrain gagne **500 pièces** quand l'invité a accepté le règlement, est toujours là **3 jours** après, et a un compte Discord de plus de **7 jours**. Une seule récompense par invité, à vie. |
| **Boost** | Chaque boost acheté = **1 mois de VIP en jeu, cumulable** (2 boosts = 2 mois) + rôle 💎 VIP sur Discord tant que le membre booste. Un VIP permanent n'est pas modifié. |

Salons : **#📨┃invitations** (arrivées + classement des parrains) et **#🚀┃boosters** (remerciements + liste des boosters).
Les messages système de Discord (boosts) sont envoyés dans #logs : c'est le bot qui remercie publiquement, sans doublon.
Tant qu'un membre n'a pas lié son compte, ses récompenses restent en attente (il est prévenu en MP).

---

## 💻 En local

1. `.env.example` → `.env`, remplis les variables.
2. `npm install` puis `npm start` (les commandes slash s'enregistrent toutes seules).
3. `npm run check` : linter + tests automatiques.

Developer Portal → Bot : **SERVER MEMBERS INTENT** et **MESSAGE CONTENT INTENT** activés, rôle du bot **tout en haut**.

---

## ⚙️ Configuration (`config.js`)

| Clé | Rôle |
|---|---|
| `serverName`, `minecraft`, `links` | nom, IP, version, liens |
| `minigames` | mini-jeux (un salon + un rôle chacun). `formerIds` = renommage sans perte de messages |
| `invites`, `boosts` | montants et conditions du parrainage / des boosts |
| `ticketTypes`, `autoMod`, `rules` | tickets, auto-modération, règlement |
| `roles`, `categories` | rôles et salons créés par `/setup` |

Après une modification : `git push`, puis **`/setup`** si tu as touché aux salons, rôles, jeux, règles ou tickets.
`/setup` est relançable sans risque : rien n'est dupliqué, les salons renommés sont retrouvés, les doublons vides supprimés.

---

## 🌐 Communauté Discord, âge et rôles

- `/setup` **active la Communauté** : niveau de vérification ≥ faible, filtre de contenu pour tous, notifications « mentions seulement », #règles comme salon des règles, **#📣┃discord-updates** (staff) pour les messages de Discord. **#📢┃annonces** devient un salon d'annonces suivable (les annonces du bot sont publiées automatiquement).
- **Arrivée en 3 étapes** : #vérification (âge « -18 ans » / « +18 ans ») → #règles apparaît, bouton « J'accepte le règlement » (rôle 📜 Règlement accepté) → #guide apparaît, bouton « J'ai lu le guide » tout en bas → ✅ Membre, tout le serveur se débloque. Les membres déjà vérifiés changent leur âge dans #rôles (menu « Ton âge »).
- **Notifications** (#rôles) : 🔔 Annonces, 🆕 Mises à jour, 🛠️ Statut serveur (redémarrage du serveur), 🎉 Events, 🎁 Giveaways (mentionné à chaque /giveaway), 📊 Sondages, + un rôle par mini-jeu.
- `/embed mention:@rôle` : publie un embed en mentionnant un rôle (ex. 🆕 Mises à jour).
- **#👀┃spoilers** (COMMUNAUTÉ, entre #médias et #suggestions) : avant-premières, seul le staff publie.
- **#🛒┃achats-boutique** : chaque paiement confirmé est annoncé (pseudo + articles, jamais de montant).
- **#ℹ️┃infos-serveur** : IP, liens, à quoi servent les tickets et **statut du serveur en direct** (l'ancien #statut-serveur est supprimé). Les bugs passent par les tickets (#bugs supprimé).
- `/setup nettoyage:true` : corrige en plus le pied de page de tous les anciens messages du bot (« McBlocDidi » → « MCBLOC • play.mcbloc.fr »).

## 🛡️ Espace staff

- **#📢┃annonces-staff** : Fondateur et Admin écrivent, le reste du staff lit.
- **#🗓️┃absences** : bouton « Déclarer une absence » (du / au / motif) → tableau des absents à jour, fin automatique ; « Je suis de retour » retire ses absences.
- **#📅┃réunions** + vocal **🔊 Réunion staff** : `/reunion date heure sujet [ordre_du_jour]` → présences par boutons, rappel 1 h avant et au début.
- **#📋┃tâches** : `/tache titre [priorite] [pour] [details]` → carte « Je m'en occupe » / « Terminée » / « Supprimer » + récapitulatif épinglé.

## 🚀 Pack lancement

| Fonction | Utilisation |
|---|---|
| **Compte à rebours** | `/lancement creer date:20/12/2026 18:00` → embed dans #annonces + bouton « Je serai là ! » (rôle 🚀 Pionnier). À l'heure H : annonce + **1000 pièces** en jeu par pionnier lié. `/lancement statut`, `ouvrir`, `annuler`. |
| **Patch notes** | `/patchnote` → formulaire → #annonces avec mention 🆕 Mises à jour |
| **Guide en MP** | envoyé automatiquement à chaque nouveau membre (une seule fois) |
| **Compte lié** | après `/lier` : rôle 🔗 Compte lié + surnom = pseudo Minecraft |
| **Niveaux** | XP en écrivant (1×/min) et en vocal (≥ 2 personnes). Paliers 5/10/20/35 → rôles 🌱 🔥 ⚡ 👑 + pièces. `/niveau`, `/top` |
| **Classements** | #classements : **un seul embed** mis à jour tout seul — top 5 des votes du mois, de Piggy Wars / SumoGames / CoreWars (victoires) et WildFarm (extractions), envoyés par le proxy toutes les 5 min, et des niveaux Discord |
| **Votes** | #votes : panneau fixe (sites de vote, récompenses, paliers) + une annonce par vote (regroupées toutes les 15 s), envoyée par le proxy |
| **Commandes** | Les joueurs utilisent les commandes **uniquement dans #commandes-bot** (liste épinglée) ; le staff partout. Les commandes staff sont cachées aux joueurs |
| **/daily** | 100 pièces/jour (compte lié), +20 %/jour de série (max +100 %) |
| **/sondage** | `question`, `choix:Oui | Non | Peut-être`, `duree:1h`, résultats en direct |
| **Anti-raid** | ≥ 10 arrivées en 30 s → invitations en pause + vérification élevée + alerte staff, 15 min. `/lockdown on/off/statut` |
| **Sanctions en jeu** | bans/mutes/kicks/warns du jeu → #🔨┃sanctions-en-jeu |
| **Tickets** | bouton ✋ Prendre en charge, note ⭐ en MP à la fermeture, `/tickets stats` |
| **Surveillance** | alerte dans #logs si le pont Minecraft se tait 5 min ; sauvegarde quotidienne (4 h) dans #logs ; `/backup` |

Tous les montants et seuils se règlent dans `config.js` (`launch`, `levels`, `daily`, `antiRaid`, `backup`).

## 📋 Commandes

| Commande | Description | Qui |
|---|---|---|
| `/help`, `/ip` | Infos | Tous |
| `/ping` | Latence du bot | Staff |
| `/vote` | Sites de vote (Aevum en partenaire), récompenses et paliers du mois | Tous |
| `/guide <section>` | Règles, commandes et chiffres d'un jeu, des grades ou des cosmétiques | Tous |
| `/lier`, `/delier`, `/compte` | Liaison Minecraft, récompenses | Tous |
| `/suggestion` | Proposer une idée | Tous |
| `/giveaway`, `/embed` | Événements | Staff |
| `/ban`, `/unban`, `/kick`, `/mute`, `/unmute`, `/warn`, `/warns`, `/clear` | Modération | Modérateurs |
| `/setup` | Configure / met à jour le serveur | Admin |

**Partenaires** : panneau dans #gestion-partenaires (staff) → ajouter / modifier / retirer ; fiches publiques dans #partenaires.

## 📁 Structure

```
config.js            ← toute la configuration
src/api/             ← API du pont Minecraft (récompenses, liaison)
src/commands/        ← une commande par fichier
src/events/          ← événements Discord
src/handlers/        ← boutons, menus, formulaires
src/utils/           ← db, panneaux anti-doublons, invitations, boosts, récompenses...
test/                ← tests automatiques (npm test)
```
