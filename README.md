# 🎮 Bot Discord — McBlocDidi (serveur Minecraft mini-jeux)

Bot Discord (discord.js v14) qui **configure tout le serveur en une commande** et gère :
statut Minecraft en direct, vérification, rôles à choisir, tickets par catégorie, modération + auto-mod,
suggestions, giveaways, LFG, tournois et salons compteurs.

---

## 🚀 Héberger sur Railway

### 1. Créer le projet
1. <https://railway.com> → **New Project** → **Deploy from GitHub repo** → choisis `mcblocdidi`.
2. Railway détecte Node.js et lance `npm start` automatiquement (voir `railway.json`).

### 2. Variables (onglet **Variables** du service)
| Variable | Valeur |
|---|---|
| `DISCORD_TOKEN` | le token du bot |
| `CLIENT_ID` | l'ID de l'application |
| `GUILD_ID` | l'ID du serveur Discord |
| `DATA_DIR` | `/data` |
| `MC_HOST` / `MC_PORT` | *(optionnel)* pour changer l'IP Minecraft sans toucher au code |
| `DB_SEED` | *(optionnel, 1ʳᵉ fois)* ta base locale encodée, voir ci-dessous |

### 3. Ajouter un Volume (IMPORTANT)
Sans volume, Railway efface les fichiers à chaque mise à jour : le bot oublierait warns, giveaways, tournois…
→ Clic droit sur le service (ou **Ctrl+K**) → **Add Volume** → *Mount path* : **`/data`**.

### 4. (Optionnel) Reprendre la base locale
Pour garder les données de ton PC (warns, IDs des salons…), avant le premier déploiement :
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("data\db.json")) | Set-Clipboard
```
Colle le résultat dans une variable `DB_SEED`. Elle n'est utilisée que si le volume est vide ; tu peux la supprimer ensuite.
*(Sinon, relancer `/setup` suffit : il retrouve les salons et rôles existants par leur nom.)*

### 5. Déployer
- Chaque `git push` sur GitHub redéploie automatiquement le bot.
- Logs : onglet **Deployments** → tu dois voir `✅ Connecté en tant que MCBLOC`.
- ⚠️ **Arrête le bot sur ton PC** quand il tourne sur Railway, sinon deux instances répondront en même temps.

---

## 💻 Lancer en local

1. Copie `.env.example` en `.env` et remplis `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`.
2. `npm install` (une fois), puis `npm start`.

Les commandes slash sont **enregistrées automatiquement au démarrage** (`npm run deploy` reste disponible en secours).

### Prérequis Discord (Developer Portal → onglet Bot)
- **SERVER MEMBERS INTENT** et **MESSAGE CONTENT INTENT** activés.
- Bot invité avec les scopes `bot` + `applications.commands` et la permission Administrateur.
- Rôle du bot placé **tout en haut** de la liste des rôles.

---

## ⚙️ Configuration (`config.js`)

| Clé | Rôle |
|---|---|
| `serverName`, `minecraft`, `links` | nom, IP, version, liens |
| `minigames` | mini-jeux (un salon + un rôle chacun). Retirer un jeu puis relancer `/setup` supprime son salon et son rôle |
| `rules` | règlement affiché dans #règles |
| `ticketTypes` | catégories de tickets et leurs questions (5 max) |
| `autoMod` | anti-invitations, anti-spam, anti-mentions, sanctions automatiques |
| `announceOnline` | annonce quand le serveur MC repasse en ligne |
| `roles`, `categories` | rôles et salons créés par `/setup` |

Après une modification : `git push` (Railway) ou redémarre le bot, puis relance **`/setup`** si tu as touché aux salons, rôles, jeux, règles ou tickets.

---

## 📋 Commandes

| Commande | Description | Qui |
|---|---|---|
| `/help`, `/ping` | Aide, latence | Tous |
| `/ip`, `/status`, `/jeux` | Infos serveur Minecraft | Tous |
| `/suggestion <idée>` | Propose une idée (votes 👍/👎 + fil de discussion) | Tous |
| `/lfg <jeu>` | Cherche des joueurs (ping le rôle du jeu) | Tous |
| `/tournoi creer` / `liste` | Tournoi avec inscriptions | Staff |
| `/giveaway lancer` / `terminer` / `reroll` / `liste` | Giveaways | Staff |
| `/ban`, `/unban`, `/kick`, `/mute`, `/unmute` | Sanctions | Modérateurs |
| `/warn`, `/warns voir/retirer/effacer` | Avertissements | Modérateurs |
| `/clear <nombre> [membre]` | Supprime des messages | Modérateurs |
| `/embed [salon]` | Embed personnalisé | Staff |
| `/setup` | Configure / met à jour le serveur | Admin |

## 🤖 Automatique

- **📊 STATISTIQUES** : salons compteurs (membres, joueurs en jeu, état du serveur), mis à jour toutes les 10 min.
- **#statut-serveur** : embed mis à jour chaque minute, salon renommé 🟢/🔴, présence du bot = joueurs connectés.
- **Annonce** dans #annonces (ping 🔔 Annonces) quand le serveur Minecraft redémarre.
- **Vérification** : rôle 🔒 Non vérifié à l'arrivée → bouton « J'accepte » → ✅ Membre.
- **Tickets** : menu (Support, Signalement, Boutique, Bug, Candidature) → formulaire → salon privé → fermer / rouvrir / supprimer (transcription dans #logs).
- **Auto-mod** : invitations Discord et mentions de masse supprimées + warn, spam → mute 5 min. 3 warns → mute 1 h, 5 warns → mute 24 h. Le staff n'est jamais concerné.
- **Logs** : sanctions, tickets, suggestions traitées → #logs.

## 📁 Structure

```
config.js              ← toute la configuration
railway.json           ← config de déploiement Railway
src/index.js           ← démarrage
src/commands/          ← une commande par fichier (admin, general, minecraft, moderation)
src/events/            ← ready, interactions, messages (auto-mod), arrivées/départs
src/handlers/          ← boutons, menus et formulaires
src/utils/             ← db, embeds, statut MC, compteurs, sanctions, giveaways...
```
