// Auto-modération : invitations Discord, spam, mentions de masse.
const { Events, PermissionFlagsBits } = require('discord.js');
const config = require('../../config');
const { isStaff } = require('../utils/helpers');
const { addWarn } = require('../utils/sanctions');
const { modAction, notifyUser } = require('../utils/modlog');
const { formatDuration } = require('../utils/helpers');
const boosts = require('../utils/boosts');
const levels = require('../utils/levels');

const INVITE_RE = /(?:discord(?:app)?\.com\/invite|discord\.(?:gg|io|me|li)|dsc\.gg)\/[\w-]+/i;
const recent = new Map(); // userId → timestamps des derniers messages

/** Message court dans le salon, supprimé au bout de 6 s. */
async function notice(message, text) {
  const m = await message.channel.send({ content: `${message.author} ${text}`, allowedMentions: { users: [message.author.id] } }).catch(() => null);
  if (m) setTimeout(() => m.delete().catch(() => null), 6000);
}

function detect(message) {
  const am = config.autoMod;
  if (am.antiInvite && INVITE_RE.test(message.content)) return { type: 'invite' };

  if (am.antiMassMention.enabled) {
    const count = message.mentions.users.size + message.mentions.roles.size + (message.mentions.everyone ? 5 : 0);
    if (count > am.antiMassMention.maxMentions) return { type: 'mentions', count };
  }

  if (am.antiSpam.enabled) {
    const now = Date.now();
    const list = (recent.get(message.author.id) ?? []).filter((t) => now - t < am.antiSpam.intervalMs);
    list.push(now);
    recent.set(message.author.id, list);
    if (list.length > am.antiSpam.maxMessages) {
      recent.delete(message.author.id);
      return { type: 'spam' };
    }
  }
  return null;
}

// Nettoyage périodique de la mémoire anti-spam
setInterval(() => {
  const now = Date.now();
  for (const [id, list] of recent) if (!list.some((t) => now - t < 60_000)) recent.delete(id);
}, 60_000).unref();

module.exports = {
  name: Events.MessageCreate,
  detect, // exporté pour les tests
  async execute(message, client) {
    if (!message.inGuild()) return;
    // Message système « X a boosté le serveur » (un par boost acheté)
    if (boosts.BOOST_TYPES.has(message.type)) return boosts.onBoostMessage(message);
    if (message.author.bot || !message.member) return;

    const exempt = isStaff(message.member) || message.member.permissions.has(PermissionFlagsBits.ManageMessages);
    const hit = config.autoMod.enabled && !exempt ? detect(message) : null;
    // XP uniquement pour les messages qui n'ont pas été sanctionnés
    if (!hit) return levels.onMessage(message);
    const { guild, member } = message;

    if (hit.type === 'invite') {
      await message.delete().catch(() => null);
      await notice(message, '🚫 les invitations vers d\'autres serveurs sont interdites.');
      await addWarn({ guild, member, moderator: client.user, reason: 'Auto-mod : invitation Discord' });
    }

    if (hit.type === 'mentions') {
      await message.delete().catch(() => null);
      await notice(message, `🚫 trop de mentions dans un seul message (${hit.count}).`);
      await addWarn({ guild, member, moderator: client.user, reason: `Auto-mod : mentions de masse (${hit.count})` });
    }

    if (hit.type === 'spam') {
      const ms = config.autoMod.antiSpam.muteMinutes * 60_000;
      if (!member.moderatable) return;
      await member.timeout(ms, 'Auto-mod : spam').catch(() => null);
      // Supprime ses messages récents dans ce salon
      const msgs = await message.channel.messages.fetch({ limit: 30 }).catch(() => null);
      if (msgs) {
        const own = msgs.filter((m) => m.author.id === member.id && Date.now() - m.createdTimestamp < 30_000);
        await message.channel.bulkDelete(own, true).catch(() => null);
      }
      await notice(message, `🔇 tu as été mute **${formatDuration(ms)}** pour spam.`);
      await notifyUser('mute', guild, member.user, 'Auto-mod : spam', `\n**Durée :** ${formatDuration(ms)}`);
      await modAction({
        action: 'mute', guild, user: member.user, moderator: client.user, reason: 'Auto-mod : spam',
        extra: [{ name: 'Durée', value: formatDuration(ms) }, { name: 'Salon', value: `${message.channel}` }],
      });
    }
  },
};
