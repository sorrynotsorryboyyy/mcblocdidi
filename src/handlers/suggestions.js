const {
  ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle, MessageFlags,
} = require('discord.js');
const config = require('../../config');
const db = require('../utils/db');
const { isStaff, replyEphemeral } = require('../utils/helpers');
const { suggestionMessage, base, error } = require('../utils/embeds');
const { sendLog } = require('../utils/logger');

module.exports = {
  prefixes: ['sugg_up', 'sugg_down', 'sugg_accept', 'sugg_refuse', 'sugg_reason'],

  async handle(interaction, arg, prefix) {
    const [id, decision] = arg.split(':');
    const g = db.guild(interaction.guild.id);
    const s = g.suggestions[id];
    if (!s) return replyEphemeral(interaction, { embeds: [error('Suggestion introuvable.')] });
    const userId = interaction.user.id;

    // ---------- Votes (un vote par membre, modifiable, re-cliquer annule) ----------
    if (prefix === 'sugg_up' || prefix === 'sugg_down') {
      if (s.status !== 'pending') return replyEphemeral(interaction, { embeds: [error('Les votes sont clos.')] });
      const [mine, other] = prefix === 'sugg_up' ? ['up', 'down'] : ['down', 'up'];
      s[other] = s[other].filter((u) => u !== userId);
      s[mine] = s[mine].includes(userId) ? s[mine].filter((u) => u !== userId) : [...s[mine], userId];
      db.save();
      return interaction.update(suggestionMessage(s));
    }

    // ---------- Staff : accepter / refuser → formulaire de réponse ----------
    if (!isStaff(interaction.member)) return replyEphemeral(interaction, { embeds: [error('Réservé au staff.')] });

    if (prefix === 'sugg_accept' || prefix === 'sugg_refuse') {
      if (s.status !== 'pending') return replyEphemeral(interaction, { embeds: [error('Cette suggestion a déjà été traitée.')] });
      const status = prefix === 'sugg_accept' ? 'accepted' : 'refused';
      const modal = new ModalBuilder()
        .setCustomId(`sugg_reason:${id}:${status}`)
        .setTitle(status === 'accepted' ? '✅ Accepter la suggestion' : '❌ Refuser la suggestion')
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('reason').setLabel('Réponse (visible par tous)')
            .setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500),
        ));
      return interaction.showModal(modal);
    }

    if (prefix === 'sugg_reason') {
      if (s.status !== 'pending') return replyEphemeral(interaction, { embeds: [error('Cette suggestion a déjà été traitée.')] });
      s.status = decision === 'accepted' ? 'accepted' : 'refused';
      s.reason = interaction.fields.getTextInputValue('reason').trim();
      s.staffId = userId;
      db.save();

      const channel = interaction.guild.channels.cache.get(s.channelId);
      const msg = await channel?.messages.fetch(s.messageId).catch(() => null);
      if (msg) await msg.edit(suggestionMessage(s));

      const accepted = s.status === 'accepted';
      const author = await interaction.client.users.fetch(s.authorId).catch(() => null);
      await author?.send({
        embeds: [base(accepted ? config.colors.success : config.colors.error).setDescription(
          `${accepted ? '✅' : '❌'} Ta suggestion **#${s.number}** a été **${accepted ? 'acceptée' : 'refusée'}** sur ${interaction.guild.name}.`
          + `${s.reason ? `\n**Réponse :** ${s.reason}` : ''}${msg ? `\n${msg.url}` : ''}`,
        )],
      }).catch(() => null);

      await sendLog(interaction.guild, base(accepted ? config.colors.success : config.colors.error)
        .setTitle(`💡 Suggestion #${s.number} ${accepted ? 'acceptée' : 'refusée'}`)
        .setDescription(`${s.text.slice(0, 500)}\n\n**Par :** ${interaction.user}${s.reason ? `\n**Réponse :** ${s.reason}` : ''}`));

      return interaction.reply({ content: `Suggestion #${s.number} ${accepted ? 'acceptée' : 'refusée'}.`, flags: MessageFlags.Ephemeral });
    }
  },
};
