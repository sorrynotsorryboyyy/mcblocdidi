const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../../../config');
const db = require('../../utils/db');
const { base } = require('../../utils/embeds');

/** Statistiques des tickets (fonction pure, testée). */
function computeStats(metas, since = 0) {
  const list = Object.values(metas).filter((m) => (m.openedAt ?? 0) >= since);
  const rated = list.filter((m) => m.rating);
  const staff = new Map();
  for (const m of list) {
    if (!m.claimedBy) continue;
    const s = staff.get(m.claimedBy) ?? { claimed: 0, ratings: [] };
    s.claimed++;
    if (m.rating) s.ratings.push(m.rating);
    staff.set(m.claimedBy, s);
  }
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  return {
    total: list.length,
    open: list.filter((m) => !m.closedAt).length,
    unclaimed: list.filter((m) => !m.claimedBy && !m.closedAt).length,
    average: avg(rated.map((m) => m.rating)),
    ratedCount: rated.length,
    staff: [...staff].map(([id, s]) => ({ id, claimed: s.claimed, average: avg(s.ratings), rated: s.ratings.length }))
      .sort((a, b) => b.claimed - a.claimed),
  };
}

module.exports = {
  computeStats,
  data: new SlashCommandBuilder()
    .setName('tickets')
    .setDescription('Statistiques des tickets')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((s) => s.setName('stats').setDescription('Tickets, notes et activité du staff')
      .addIntegerOption((o) => o.setName('jours').setDescription('Période (défaut : 30 jours)').setMinValue(1).setMaxValue(365))),

  async execute(interaction) {
    const days = interaction.options.getInteger('jours') ?? 30;
    const s = computeStats(db.guild(interaction.guild.id).ticketMeta, Date.now() - days * 864e5);
    const stars = (v) => (v === null ? '—' : `${v.toFixed(1)} ⭐`);
    const embed = base(config.colors.info)
      .setTitle(`🎫 Tickets — ${days} derniers jours`)
      .addFields(
        { name: 'Tickets', value: String(s.total), inline: true },
        { name: 'Encore ouverts', value: `${s.open} (dont ${s.unclaimed} sans staff)`, inline: true },
        { name: 'Note moyenne', value: `${stars(s.average)} (${s.ratedCount} avis)`, inline: true },
        {
          name: '🏅 Staff',
          value: s.staff.length
            ? s.staff.slice(0, 15).map((x) => `<@${x.id}> — **${x.claimed}** pris en charge · ${stars(x.average)}`).join('\n')
            : 'Aucun ticket pris en charge pour le moment.',
        },
      );
    return interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [embed] });
  },
};
