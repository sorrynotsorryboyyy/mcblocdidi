// /reunion : programme une réunion staff dans #réunions (présences par boutons, rappels automatiques).
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { success, error } = require('../../utils/embeds');
const { getChannel, isStaff, replyEphemeral } = require('../../utils/helpers');
const db = require('../../utils/db');
const staff = require('../../utils/staff');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reunion')
    .setDescription('Programme une réunion du staff (présences + rappels automatiques)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((o) => o.setName('date').setDescription('Jour (JJ/MM), ex. 24/12').setRequired(true).setMaxLength(10))
    .addStringOption((o) => o.setName('heure').setDescription('Heure de Paris (HH:MM), ex. 20:30').setRequired(true).setMaxLength(5))
    .addStringOption((o) => o.setName('sujet').setDescription('Sujet de la réunion').setRequired(true).setMaxLength(150))
    .addStringOption((o) => o.setName('ordre_du_jour').setDescription('Points à aborder (séparés par ; )').setMaxLength(1000)),

  async execute(interaction) {
    if (!isStaff(interaction.member)) return replyEphemeral(interaction, { embeds: [error('Réservé au staff.')] });
    const when = staff.meetingTime(interaction.options.getString('date'), interaction.options.getString('heure'));
    if (when.error) return replyEphemeral(interaction, { embeds: [error(when.error)] });
    const channel = getChannel(interaction.guild, 'staffMeetings');
    if (!channel) return replyEphemeral(interaction, { embeds: [error('Le salon #réunions n\'existe pas encore : un admin doit relancer `/setup`.')] });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const agenda = interaction.options.getString('ordre_du_jour');
    const m = staff.addMeeting(interaction.guild.id, {
      subject: interaction.options.getString('sujet'),
      agenda: agenda ? agenda.split(';').map((p) => p.trim()).filter(Boolean).map((p) => `• ${p}`).join('\n') : null,
      at: when.at,
      authorId: interaction.user.id,
    });
    const msg = await channel.send({ ...staff.staffPing(interaction.guild), ...staff.meetingMessage(interaction.guild, m) });
    m.channelId = channel.id;
    m.messageId = msg.id;
    db.save();
    return interaction.editReply({ embeds: [success(`Réunion programmée dans ${channel} pour le <t:${Math.floor(m.at / 1000)}:F>. Rappel automatique 1 h avant.`)] });
  },
};
