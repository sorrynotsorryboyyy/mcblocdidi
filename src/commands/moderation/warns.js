const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../../../config');
const db = require('../../utils/db');
const { base, success } = require('../../utils/embeds');
const { replyEphemeral } = require('../../utils/helpers');
const { sendLog } = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warns')
    .setDescription('Gère les avertissements d\'un membre')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((s) => s.setName('voir').setDescription('Affiche les avertissements')
      .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true)))
    .addSubcommand((s) => s.setName('retirer').setDescription('Retire un avertissement')
      .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true))
      .addIntegerOption((o) => o.setName('numero').setDescription('Numéro de l\'avertissement (voir /warns voir)').setRequired(true).setMinValue(1)))
    .addSubcommand((s) => s.setName('effacer').setDescription('Efface tous les avertissements')
      .addUserOption((o) => o.setName('membre').setDescription('Membre').setRequired(true))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser('membre');
    const g = db.guild(interaction.guild.id);
    const list = g.warns[user.id] ?? [];

    if (sub === 'voir') {
      const embed = base(config.colors.warning)
        .setTitle(`⚠️ Avertissements de ${user.tag}`)
        .setThumbnail(user.displayAvatarURL())
        .setDescription(list.length
          ? list.map((w, i) => `**#${i + 1}** — <t:${Math.floor(w.date / 1000)}:d> par <@${w.modId}>\n> ${w.reason}`).join('\n\n').slice(0, 4000)
          : 'Aucun avertissement. ✨');
      return replyEphemeral(interaction, { embeds: [embed] });
    }

    if (sub === 'retirer') {
      const n = interaction.options.getInteger('numero');
      if (n > list.length) return replyEphemeral(interaction, `Ce membre n'a que ${list.length} avertissement(s).`);
      const [removed] = list.splice(n - 1, 1);
      g.warns[user.id] = list;
      db.save();
      await sendLog(interaction.guild, base(config.colors.success).setTitle('➖ Avertissement retiré')
        .setDescription(`${user} — #${n} : ${removed.reason}\nPar ${interaction.user}`));
      return replyEphemeral(interaction, { embeds: [success(`Avertissement #${n} retiré pour ${user}.`)] });
    }

    delete g.warns[user.id];
    db.save();
    await sendLog(interaction.guild, base(config.colors.success).setTitle('🧽 Avertissements effacés')
      .setDescription(`${user} — ${list.length} avertissement(s) effacé(s) par ${interaction.user}`));
    return replyEphemeral(interaction, { embeds: [success(`${list.length} avertissement(s) effacé(s) pour ${user}.`)] });
  },
};
