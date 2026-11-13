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
| `PUBLIC_ORIGINS` | *(optionnel)* sites autorisés à lire `/public/votes` et `/public/leaderboards`, `https://mcbloc.fr,https://www.mcbloc.fr` par défaut |

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
- **Âge** : dans #vérification, le membre accepte le règlement avec « -18 ans » ou « +18 ans ». Les membres déjà vérifiés choisissent leur âge dans #rôles (menu « Ton âge »).
- **Notifications** (#rôles) : 🔔 Annonces, 🆕 Mises à jour, 🛠️ Statut serveur (redémarrage du serveur), 🎉 Events, 🎁 Giveaways (mentionné à chaque /giveaway), 📊 Sondages, + un rôle par mini-jeu.
- `/embed mention:@rôle` : publie un embed en mentionnant un rôle (ex. 🆕 Mises à jour).
- **#👀┃spoilers** (MINI-JEUX) : avant-premières, seul le staff publie.

## 🚀 Pack lancement

| Fonction | Utilisation |
|---|---|
| **Compte à rebours** | `/lancement creer date:20/12/2026 18:00` → embed dans #annonces + bouton « Je serai là ! » (rôle 🚀 Pionnier). À l'heure H : annonce + **1000 pièces** en jeu par pionnier lié. `/lancement statut`, `ouvrir`, `annuler`. |
| **Patch notes** | `/patchnote` → formulaire → #annonces avec mention 🆕 Mises à jour |
| **Guide en MP** | envoyé automatiquement à chaque nouveau membre (une seule fois) |
| **Compte lié** | après `/lier` : rôle 🔗 Compte lié + surnom = pseudo Minecraft |
| **Niveaux** | XP en écrivant (1×/min) et en vocal (≥ 2 personnes). Paliers 5/10/20/35 → rôles 🌱 🔥 ⚡ 👑 + pièces. `/niveau`, `/top` |
| **Classements** | #classements : **un seul embed** mis à jour tout seul — top 5 des votes du mois, de Piggy Wars / SumoGames / CoreWars (victoires, envoyés par le proxy toutes les 5 min) et des niveaux Discord |
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
