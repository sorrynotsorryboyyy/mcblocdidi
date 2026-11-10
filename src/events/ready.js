const { Events } = require('discord.js');
const statusUpdater = require('../utils/statusUpdater');
const giveaways = require('../utils/giveaways');
const invites = require('../utils/invites');
const boosts = require('../utils/boosts');
const levels = require('../utils/levels');
const polls = require('../utils/polls');
const launch = require('../utils/launch');
const antiraid = require('../utils/antiraid');
const monitor = require('../utils/monitor');
const backup = require('../utils/backup');
const leaderboards = require('../utils/leaderboards');
const { registerCommands } = require('../utils/commands');
const db = require('../utils/db');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`✅ Connecté en tant que ${client.user.tag} sur ${client.guilds.cache.size} serveur(s).`);
    console.log(`💾 Données : ${db.FILE}`);
    await registerCommands(client);
    // Remplit le cache des membres (tickets, rôles, compteurs, boosters)
    for (const guild of client.guilds.cache.values()) await guild.members.fetch().catch(() => null);

    // Minuteurs (tous repartent de l'état en base : rien n'est perdu au redémarrage)
    statusUpdater.start(client);
    giveaways.start(client);
    polls.start(client);
    launch.start(client);
    antiraid.start(client);
    levels.start(client);
    monitor.start(client);
    backup.start(client);
    await invites.start(client);

    for (const guild of client.guilds.cache.values()) {
      await boosts.refreshBoard(guild);
      await leaderboards.refreshPanels(guild);
    }
  },
};
