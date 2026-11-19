// /tache : ajoute une tâche dans #tâches (prise en charge et fin par boutons, récapitulatif épinglé).
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { success, error } = require('../../utils/embeds');
const { getChannel, isStaff, replyEphemeral } = require('../../utils/helpers');
const db = require('../../utils/db');
const staff = require('../../utils/staff');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tache')
    .setDescription('Ajoute une tâche pour l\'équipe dans #tâches')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((o) => o.setName('titre').setDescription('Ce qu\'il faut faire').setRequired(true).setMaxLength(150))
    .addStringOption((o) => o.setName('priorite').setDescription('Priorité (défaut : normale)')
      .addChoices(...Object.entries(staff.PRIORITIES).map(([value, p]) => ({ name: `${p.emoji} ${p.label}`, value }))))
    .addUserOption((o) => o.setName('pour').setDescription('Membre du staff à qui la confier (facultatif)'))
    .addStringOption((o) => o.setName('details').setDescription('Précisions, liens…').setMaxLength(1000)),

  async execute(interaction) {
    if (!isStaff(interaction.member)) return replyEphemeral(interaction, { embeds: [error('Réservé au staff.')] });
    const channel = getChannel(interaction.guild, 'staffTasks');
    if (!channel) return replyEphemeral(interaction, { embeds: [error('Le salon #tâches n\'existe pas encore : un admin doit relancer `/setup`.')] });
    const target = interaction.options.getMember('pour');
    if (target && !isStaff(target)) return replyEphemeral(interaction, { embeds: [error('Une tâche se confie à un membre du staff.')] });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const t = staff.addTask(interaction.guild.id, {
      title: interaction.options.getString('titre'),
      details: interaction.options.getString('details'),
      priority: interaction.options.getString('priorite') ?? 'normal',
      authorId: interaction.user.id,
      assigneeId: target?.id ?? null,
    });
    if (t.assigneeId) t.status = 'doing';
    const msg = await channel.send({
      content: target ? `${target}` : undefined,
      allowedMentions: { users: target ? [target.id] : [] },
      ...staff.taskCard(t),
    });
    t.channelId = channel.id;
    t.messageId = msg.id;
    db.save();
    await staff.refreshTasks(interaction.guild).catch(() => null);
    return interaction.editReply({ embeds: [success(`Tâche **#${t.number}** ajoutée dans ${channel}.`)] });
  },
};
