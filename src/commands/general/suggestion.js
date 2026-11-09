const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const db = require('../../utils/db');
const { suggestionMessage, success, error } = require('../../utils/embeds');
const { getChannel } = require('../../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suggestion')
    .setDescription('Propose une idée pour le serveur')
    .addStringOption((o) => o.setName('idee').setDescription('Ta suggestion').setRequired(true).setMinLength(10).setMaxLength(1500)),

  async execute(interaction) {
    const channel = getChannel(interaction.guild, 'suggestions');
    if (!channel) {
      return interaction.reply({ embeds: [error('Le salon des suggestions n\'existe pas. Un admin doit lancer `/setup`.')], flags: MessageFlags.Ephemeral });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const g = db.guild(interaction.guild.id);
    g.state.suggestionCount = (g.state.suggestionCount ?? 0) + 1;
    const s = {
      id: Date.now().toString(36),
      number: g.state.suggestionCount,
      authorId: interaction.user.id,
      authorTag: interaction.member.displayName,
      authorAvatar: interaction.user.displayAvatarURL(),
      text: interaction.options.getString('idee'),
      up: [],
      down: [],
      status: 'pending',
    };

    const msg = await channel.send(suggestionMessage(s));
    s.channelId = channel.id;
    s.messageId = msg.id;
    g.suggestions[s.id] = s;
    db.save();

    // Fil de discussion sous la suggestion
    await msg.startThread({ name: `💬 Suggestion #${s.number}`, autoArchiveDuration: 10080 }).catch(() => null);

    return interaction.editReply({ embeds: [success(`Ta suggestion a été publiée : ${msg.url}`)] });
  },
};
