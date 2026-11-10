const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../../../config');
const db = require('../../utils/db');
const { base, success, error } = require('../../utils/embeds');
const { getChannel } = require('../../utils/helpers');
const launch = require('../../utils/launch');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lancement')
    .setDescription('Compte à rebours de l\'ouverture du serveur')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName('creer').setDescription('Programme l\'ouverture (heure de Paris)')
      .addStringOption((o) => o.setName('date').setDescription('JJ/MM/AAAA HH:MM, ex. 20/12/2026 18:00').setRequired(true))
      .addIntegerOption((o) => o.setName('recompense').setDescription(`Pièces par pionnier (défaut ${config.launch.pioneerCoins})`).setMinValue(0).setMaxValue(100000)))
    .addSubcommand((s) => s.setName('statut').setDescription('Où en est le lancement ?'))
    .addSubcommand((s) => s.setName('ouvrir').setDescription('Ouvre maintenant (sans attendre la date)'))
    .addSubcommand((s) => s.setName('annuler').setDescription('Annule le lancement programmé')),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const { guild } = interaction;
    const st = db.guild(guild.id).state;
    const sub = interaction.options.getSubcommand();

    if (sub === 'creer') {
      const at = launch.parseDate(interaction.options.getString('date'));
      if (!at) return interaction.editReply({ embeds: [error('Date invalide. Format : `JJ/MM/AAAA HH:MM`, ex. `20/12/2026 18:00`.')] });
      if (at <= Date.now()) return interaction.editReply({ embeds: [error('La date doit être dans le futur.')] });
      if (!getChannel(guild, 'announcements')) return interaction.editReply({ embeds: [error('#annonces introuvable : lance `/setup`.')] });
      const previous = st.launch?.status === 'scheduled' ? st.launch.pioneers : [];
      st.launch = {
        at,
        status: 'scheduled',
        rewardCoins: interaction.options.getInteger('recompense') ?? config.launch.pioneerCoins,
        pioneers: previous, // reprogrammer garde les inscrits
        createdBy: interaction.user.id,
      };
      db.save();
      await launch.refreshPanel(guild);
      return interaction.editReply({ embeds: [success(`Lancement programmé <t:${Math.floor(at / 1000)}:F> (<t:${Math.floor(at / 1000)}:R>). Le compte à rebours est dans #annonces.`)] });
    }

    const data = st.launch;
    if (!data || data.status === 'cancelled') return interaction.editReply({ embeds: [error('Aucun lancement programmé. Utilise `/lancement creer`.')] });

    if (sub === 'statut') {
      return interaction.editReply({
        embeds: [base(config.colors.info).setTitle('🚀 Lancement').addFields(
          { name: 'Statut', value: { scheduled: '⏳ Programmé', launched: '✅ Ouvert' }[data.status] ?? data.status, inline: true },
          { name: 'Date', value: `<t:${Math.floor(data.at / 1000)}:F>`, inline: true },
          { name: 'Pionniers', value: String(data.pioneers.length), inline: true },
          { name: 'Récompense', value: `${data.rewardCoins} pièces`, inline: true },
        )],
      });
    }

    if (data.status !== 'scheduled') return interaction.editReply({ embeds: [error('Le serveur est déjà ouvert.')] });

    if (sub === 'ouvrir') {
      data.at = Date.now();
      const rewarded = await launch.openServer(guild);
      return interaction.editReply({ embeds: [success(`Serveur ouvert ! ${rewarded} pionnier(s) récompensé(s).`)] });
    }

    // annuler
    data.status = 'cancelled';
    db.save();
    const ref = db.guild(guild.id).messages.launch;
    const msg = ref && await guild.channels.cache.get(ref.channelId)?.messages.fetch(ref.messageId).catch(() => null);
    await msg?.delete().catch(() => null);
    delete db.guild(guild.id).messages.launch;
    db.save();
    return interaction.editReply({ embeds: [success('Lancement annulé et compte à rebours retiré.')] });
  },
};
