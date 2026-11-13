const fs = require('node:fs');
const path = require('node:path');
const { Events } = require('discord.js');
const { replyEphemeral } = require('../utils/helpers');
const { error } = require('../utils/embeds');
const { commandAllowed } = require('../utils/guide');

// Handlers de composants : chaque fichier exporte { prefixes: [...], handle(interaction, arg) }
// Le customId est de la forme "prefix" ou "prefix:argument".
const handlers = new Map();
const dir = path.join(__dirname, '..', 'handlers');
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
  const h = require(path.join(dir, file));
  for (const p of h.prefixes) handlers.set(p, h);
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    // En MP, seuls les handlers marqués allowDM répondent (ex. note de ticket)
    if (!interaction.inGuild()) {
      const h = interaction.isButton() ? handlers.get(interaction.customId.split(':')[0]) : null;
      if (!h?.allowDM) return;
    }

    try {
      if (interaction.isChatInputCommand()) {
        const cmd = client.commands.get(interaction.commandName);
        if (!cmd) return replyEphemeral(interaction, 'Commande inconnue. Relance `npm run deploy`.');
        // Les joueurs utilisent les commandes uniquement dans #commandes-bot (le staff partout)
        const place = commandAllowed(interaction);
        if (!place.ok) {
          return replyEphemeral(interaction, `🤖 Les commandes se font dans ${place.channel} 👉 tu y trouveras aussi la liste de toutes les commandes.`);
        }
        return await cmd.execute(interaction, client);
      }

      if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
        const [prefix, ...rest] = interaction.customId.split(':');
        const h = handlers.get(prefix);
        if (h) return await h.handle(interaction, rest.join(':'), prefix);
      }
    } catch (err) {
      console.error(`[interaction ${interaction.customId ?? interaction.commandName}]`, err);
      await replyEphemeral(interaction, { embeds: [error('Une erreur est survenue. Réessaie ou contacte le staff.')] })
        .catch(() => null);
    }
  },
};
