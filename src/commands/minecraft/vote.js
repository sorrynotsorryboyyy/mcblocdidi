const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../../config');
const { base } = require('../../utils/embeds');

const CRATES = { basique: 'Coffre basique', rare: 'Coffre rare', legendaire: 'Coffre légendaire' };
const crateName = (id) => CRATES[id] ?? id;
const pct = (n) => `${Math.round(Number(n) * 1000) / 10} %`;

/** Texte de la récompense d'un site : « 150 pièces + 15 % Coffre basique, 3 % Coffre rare ». */
function rewardText(reward) {
  if (!reward) return '—';
  const crates = (reward.crates ?? []).map((c) => `${pct(c.chance)} ${crateName(c.id)}`);
  return `**${Number(reward.coins ?? 0).toLocaleString('fr-FR')} pièces**${crates.length ? ` + ${crates.join(', ')}` : ''}`;
}

/** Embed + boutons de vote (fonction pure, testée). */
function votePayload(cfg = config) {
  const sites = [...(cfg.votes?.sites ?? [])].sort((a, b) => Number(!!b.partner) - Number(!!a.partner));
  const embed = base(cfg.colors.accent)
    .setTitle(`🗳️ Vote pour ${cfg.serverName} !`)
    .setDescription(
      'Chaque vote fait connaître le serveur et te rapporte des **pièces** et des chances de gagner des **coffres** en jeu.\n'
      + 'Entre ton **pseudo Minecraft exact** sur le site : la récompense arrive automatiquement, même hors ligne.',
    );
  for (const site of sites.slice(0, 10)) {
    embed.addFields({
      name: `${site.partner ? '⭐ ' : ''}${site.name}${site.partner ? ' — partenaire' : ''}`,
      value: [rewardText(site.reward), `⏱️ Un vote toutes les ${site.cooldownHours} h`, site.howTo].filter(Boolean).join('\n').slice(0, 1024),
    });
  }
  const milestones = cfg.votes?.milestones ?? [];
  if (milestones.length) {
    embed.addFields({
      name: '🎯 Paliers du mois',
      value: milestones.map((m) => `**${m.votes} votes** → ${crateName(m.crate)}`).join(' · ').slice(0, 1024),
    });
  }
  if (!sites.length) embed.addFields({ name: 'Sites de vote', value: 'Aucun site de vote pour le moment.' });

  const buttons = sites.slice(0, 4).map((s) => new ButtonBuilder().setLabel(`Voter sur ${s.name}`.slice(0, 80)).setURL(s.url).setStyle(ButtonStyle.Link));
  if (cfg.links.vote) buttons.push(new ButtonBuilder().setLabel('Tout savoir sur les votes').setURL(cfg.links.vote).setStyle(ButtonStyle.Link));
  return { embeds: [embed], components: buttons.length ? [new ActionRowBuilder().addComponents(buttons.slice(0, 5))] : [] };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vote')
    .setDescription('Vote pour le serveur et gagne des pièces et des coffres en jeu'),

  votePayload,

  async execute(interaction) {
    return interaction.reply(votePayload());
  },
};
