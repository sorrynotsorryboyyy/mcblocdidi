const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../../../config');
const { success, error, base } = require('../../utils/embeds');
const antiraid = require('../../utils/antiraid');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lockdown')
    .setDescription('Verrouillage anti-raid (invitations en pause + vérification renforcée)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('on').setDescription('Verrouille le serveur')
      .addIntegerOption((o) => o.setName('minutes').setDescription(`Durée (défaut ${config.antiRaid.lockMinutes})`).setMinValue(1).setMaxValue(1440))
      .addStringOption((o) => o.setName('raison').setDescription('Raison').setMaxLength(200)))
    .addSubcommand((s) => s.setName('off').setDescription('Lève le verrouillage'))
    .addSubcommand((s) => s.setName('statut').setDescription('État du verrouillage')),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand();
    const { guild } = interaction;

    if (sub === 'on') {
      const minutes = interaction.options.getInteger('minutes') ?? config.antiRaid.lockMinutes;
      const reason = interaction.options.getString('raison') ?? `Manuel (${interaction.user.tag})`;
      const created = await antiraid.lock(guild, { minutes, reason, by: interaction.user.id });
      return interaction.editReply({ embeds: [success(created ? `Serveur verrouillé pour ${minutes} min.` : 'Déjà verrouillé : durée prolongée.')] });
    }
    if (sub === 'off') {
      const done = await antiraid.unlock(guild, interaction.user.id);
      return interaction.editReply({ embeds: [done ? success('Verrouillage levé.') : error('Le serveur n\'est pas verrouillé.')] });
    }
    const st = antiraid.lockState(guild.id);
    return interaction.editReply({
      embeds: [st
        ? base(config.colors.warning).setDescription(`🔒 Verrouillé jusqu'à <t:${Math.floor(st.until / 1000)}:t> — ${st.reason}\n${st.joins} arrivée(s) depuis.`)
        : success('Le serveur n\'est pas verrouillé.')],
    });
  },
};
