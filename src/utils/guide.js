// Guide des joueurs : la liste des commandes (une seule source pour /help, le panneau de
// #commandes-bot et la restriction des commandes à ce salon) et le panneau fixe de #votes.
const { PermissionFlagsBits: P } = require('discord.js');
const config = require('../../config');
const { base } = require('./embeds');
const { ensurePanel, byTitle } = require('./panels');
const { getChannel } = require('./helpers');

/** Commandes des joueurs, par thème. Les autres (modération, admin) sont réservées au staff. */
const PLAYER_COMMANDS = [
  {
    theme: '🎮 Le serveur',
    commands: [
      { name: 'ip', text: 'L\'adresse pour rejoindre le serveur Minecraft' },
      { name: 'vote', text: 'Voter pour le serveur et gagner des pièces et des coffres' },
    ],
  },
  {
    theme: '🔗 Ton compte',
    commands: [
      { name: 'lier', text: 'Relier ton compte Minecraft à Discord (code à taper en jeu)' },
      { name: 'delier', text: 'Retirer la liaison avec ton compte Minecraft' },
      { name: 'compte', text: 'Ton compte lié, tes invitations et tes récompenses' },
    ],
  },
  {
    theme: '🎁 Récompenses et niveaux',
    commands: [
      { name: 'daily', text: 'Ta récompense du jour (pièces en jeu), à récupérer chaque jour' },
      { name: 'niveau', text: 'Ton niveau Discord (gagné en discutant et en vocal)' },
      { name: 'top', text: 'Le classement des niveaux Discord' },
    ],
  },
  {
    theme: '💡 Autre',
    commands: [
      { name: 'suggestion', text: 'Proposer une idée pour le serveur' },
      { name: 'help', text: 'Afficher cette liste' },
    ],
  },
];

const PLAYER_COMMAND_NAMES = new Set(PLAYER_COMMANDS.flatMap((t) => t.commands.map((c) => c.name)));
const COMMANDS_TITLE = '📖 Commandes MCBloc';
const VOTES_TITLE = `🗳️ Vote pour ${config.serverName} !`;

/** Panneau épinglé de #commandes-bot (et contenu de /help pour les joueurs). */
function commandsPayload() {
  const embed = base(config.colors.primary)
    .setTitle(COMMANDS_TITLE)
    .setDescription(
      'Toutes les commandes se tapent **ici, dans ce salon**. Commence à écrire `/` puis choisis la commande dans la liste.\n'
      + 'Le reste se passe dans les salons : infos, classements, votes… pas besoin de commande !',
    );
  for (const t of PLAYER_COMMANDS) {
    embed.addFields({ name: t.theme, value: t.commands.map((c) => `**/${c.name}** — ${c.text}`).join('\n') });
  }
  return { embeds: [embed] };
}

/** Panneau fixe de #votes : l'embed de /vote + « comment ça marche ». */
function votesPayload() {
  const { votePayload } = require('../commands/minecraft/vote');
  const payload = votePayload();
  const embed = payload.embeds[0];
  embed.addFields({
    name: '❓ Comment ça marche',
    value: [
      '**1.** Clique sur un bouton ci-dessous pour ouvrir le site de vote.',
      '**2.** Entre ton **pseudo Minecraft exact** et valide.',
      '**3.** Ta récompense arrive toute seule en jeu, et ton vote s\'affiche dans ce salon. Merci !',
    ].join('\n'),
  });
  return payload;
}

/** Joueur (pas staff) ? Le staff peut utiliser les commandes partout. */
function isPlayer(member) {
  return !member?.permissions?.has?.(P.ManageMessages);
}

/**
 * Une commande est-elle autorisée dans ce salon ?
 * Les joueurs ne peuvent utiliser les commandes que dans #commandes-bot (s'il existe).
 */
function commandAllowed(interaction) {
  const channel = getChannel(interaction.guild, 'botCommands');
  if (!channel || !isPlayer(interaction.member)) return { ok: true };
  if (interaction.channelId === channel.id) return { ok: true };
  return { ok: false, channel };
}

async function refreshPanels(guild) {
  let duplicates = 0;
  duplicates += await ensurePanel(guild, 'commandsPanel', 'botCommands', commandsPayload(), { match: byTitle(COMMANDS_TITLE) })
    .catch((err) => { console.error('[guide] commandes :', err.message); return 0; });
  // match obligatoire : #votes contient aussi les annonces de vote (à ne pas supprimer)
  duplicates += await ensurePanel(guild, 'votesPanel', 'votes', votesPayload(), { match: byTitle(VOTES_TITLE) })
    .catch((err) => { console.error('[guide] votes :', err.message); return 0; });
  return duplicates;
}

module.exports = {
  PLAYER_COMMANDS, PLAYER_COMMAND_NAMES, COMMANDS_TITLE, VOTES_TITLE,
  commandsPayload, votesPayload, isPlayer, commandAllowed, refreshPanels,
};
