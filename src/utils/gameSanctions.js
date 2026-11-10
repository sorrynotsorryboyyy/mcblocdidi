// Sanctions appliquées en jeu, envoyées par le proxy (POST /api/sanctions) → #sanctions-en-jeu.
const config = require('../../config');
const db = require('./db');
const { base } = require('./embeds');
const { getChannel } = require('./helpers');

const TYPES = {
  BAN: { label: 'Bannissement', emoji: '🔨', color: config.colors.error, lasting: true },
  MUTE: { label: 'Mute', emoji: '🔇', color: 0xe67e22, lasting: true },
  KICK: { label: 'Expulsion', emoji: '👢', color: config.colors.warning, lasting: false },
  WARN: { label: 'Avertissement', emoji: '⚠️', color: config.colors.warning, lasting: false },
};
const MAX_SEEN = 500;

/** Clé de dédoublonnage (un renvoi du proxy ne crée pas un 2e message). */
function dedupeKey(s) {
  return `${s.action}:${s.id ?? `${s.target?.uuid}:${s.type}:${s.at ?? ''}`}`;
}

function embedFor(s, discordId) {
  const t = TYPES[s.type] ?? { label: s.type, emoji: '🛡️', color: config.colors.neutral, lasting: false };
  const revoke = s.action === 'revoke';
  const player = `**${s.target?.name ?? '?'}**${discordId ? ` (<@${discordId}>)` : ''}${s.ipBan ? ' — **ban IP**' : ''}`;
  const embed = base(revoke ? config.colors.success : t.color)
    .setTitle(`${revoke ? '✅' : t.emoji} ${revoke ? `Fin de ${t.label.toLowerCase()}` : t.label} (en jeu)`)
    .addFields(
      { name: 'Joueur', value: player, inline: true },
      { name: 'Staff', value: String(s.staff ?? 'Console'), inline: true },
    );
  if (!revoke) {
    embed.addFields({ name: 'Raison', value: String(s.reason || 'Aucune').slice(0, 1024) });
    if (t.lasting) {
      embed.addFields({ name: 'Durée', value: s.expiresAt ? `jusqu'au <t:${Math.floor(s.expiresAt / 1000)}:f> (<t:${Math.floor(s.expiresAt / 1000)}:R>)` : '**Permanent**', inline: true });
    }
    if (s.server) embed.addFields({ name: 'Serveur', value: String(s.server), inline: true });
  }
  if (s.id) embed.setFooter({ text: `${config.footer} • Sanction #${s.id}` });
  return embed;
}

async function handle(client, s) {
  if (!s || !['create', 'revoke'].includes(s.action) || typeof s.type !== 'string') return false;
  let posted = false;
  for (const guild of client.guilds.cache.values()) {
    const g = db.guild(guild.id);
    g.state.sanctionsSeen ??= [];
    const key = dedupeKey(s);
    if (g.state.sanctionsSeen.includes(key)) continue;
    g.state.sanctionsSeen.push(key);
    if (g.state.sanctionsSeen.length > MAX_SEEN) g.state.sanctionsSeen.splice(0, g.state.sanctionsSeen.length - MAX_SEEN);
    db.save();

    const channel = getChannel(guild, 'gameSanctions') ?? getChannel(guild, 'logs');
    if (!channel) continue;
    const uuid = String(s.target?.uuid ?? '').toLowerCase();
    const discordId = Object.entries(g.links).find(([, l]) => l.uuid === uuid)?.[0];
    await channel.send({ embeds: [embedFor(s, discordId)], allowedMentions: { parse: [] } }).catch(() => null);
    posted = true;
  }
  return posted;
}

module.exports = { handle, embedFor, dedupeKey };
