const { SlashCommandBuilder, MessageFlags, PermissionsBitField } = require('discord.js');
const config = require('../../../config');
const guide = require('../../utils/guide');

const STAFF_CATEGORIES = {
  moderation: '🛡️ Modération',
  admin: '⚙️ Administration',
};

/** Le membre peut-il utiliser cette commande (permissions par défaut de la commande) ? */
function canUse(member, command) {
  const required = command.data.default_member_permissions;
  if (required === undefined || required === null) return true;
  return !!member?.permissions?.has?.(new PermissionsBitField(BigInt(required)));
}

/** Liste personnalisée : le guide joueur, plus les commandes staff que le membre peut utiliser. */
function helpPayload(member, commands) {
  const payload = guide.commandsPayload();
  const embed = payload.embeds[0];
  for (const [cat, label] of Object.entries(STAFF_CATEGORIES)) {
    const usable = [...commands.values()].filter((c) => c.category === cat && canUse(member, c));
    if (!usable.length) continue;
    embed.addFields({ name: `${label} (staff)`, value: usable.map((c) => `\`/${c.data.name}\` — ${c.data.description}`).join('\n').slice(0, 1024) });
  }
  return payload;
}

module.exports = {
  data: new SlashCommandBuilder().setName('help').setDescription(`Les commandes de ${config.serverName}`),

  helpPayload,
  canUse,

  async execute(interaction, client) {
    return interaction.reply({ ...helpPayload(interaction.member, client.commands), flags: MessageFlags.Ephemeral });
  },
};
