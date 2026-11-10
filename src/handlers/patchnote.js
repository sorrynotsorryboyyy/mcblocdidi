// Formulaire de /patchnote → embed dans #annonces, mention 🆕 Mises à jour, publication auto.
const { MessageFlags } = require('discord.js');
const config = require('../../config');
const { base, success, error } = require('../utils/embeds');
const { getChannel, getRole, isStaff } = require('../utils/helpers');

/** "a\n- b\n\n• c" → "• a\n• b\n• c" */
function bullets(text) {
  return text.split('\n').map((l) => l.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean).map((l) => `• ${l}`).join('\n');
}

module.exports = {
  prefixes: ['patchnote_modal'],
  bullets,
  async handle(interaction) {
    if (!isStaff(interaction.member)) {
      return interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [error('Réservé au staff.')] });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const channel = getChannel(interaction.guild, 'announcements');
    if (!channel) return interaction.editReply({ embeds: [error('#annonces introuvable : lance `/setup`.')] });

    const f = (k) => interaction.fields.getTextInputValue(k).trim();
    const version = f('version');
    const embed = base(0x57f287)
      .setTitle(`🆕 Mise à jour ${version}${f('title') ? ` — ${f('title')}` : ''}`.slice(0, 256))
      .setThumbnail(interaction.guild.iconURL());
    const sections = [['✨ Nouveautés', f('added')], ['🐛 Corrections', f('fixed')], ['⚙️ Autres changements', f('other')]];
    for (const [name, text] of sections) {
      if (text) embed.addFields({ name, value: bullets(text).slice(0, 1024) || '—' });
    }
    embed.addFields({ name: '🌐 Rejoindre', value: `\`${config.minecraft.host}\`` });

    const role = getRole(interaction.guild, 'notifUpdates');
    const msg = await channel.send({
      content: role ? `${role}` : undefined,
      embeds: [embed],
      allowedMentions: { roles: role ? [role.id] : [] },
    });
    if (msg.crosspostable) await msg.crosspost().catch(() => null);
    return interaction.editReply({ embeds: [success(`Note de mise à jour publiée : ${msg.url}`)] });
  },
};
