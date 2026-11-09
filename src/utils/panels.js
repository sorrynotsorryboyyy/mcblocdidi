// Embeds « uniques » (panneaux, classements…) : un seul exemplaire par salon, édité en place.
// Ne jamais faire channel.send() directement pour ce type d'embed : passer par ensurePanel().
const db = require('./db');
const { getChannel } = require('./helpers');

/**
 * Crée ou met à jour le panneau `key` dans le salon `channelKey`, et supprime ses doublons.
 * @param {object} [opts]
 * @param {(msg) => boolean} [opts.match] reconnaît un exemplaire de CE panneau parmi les messages du bot.
 *   Par défaut : tout embed du bot (salon dédié au panneau). Dans un salon partagé
 *   (ex. #invitations), passer un match sur le titre pour ne pas toucher aux autres messages.
 * @returns {Promise<number>} nombre de doublons supprimés
 */
async function ensurePanel(guild, key, channelKey, payload, { match } = {}) {
  const channel = getChannel(guild, channelKey);
  if (!channel) return 0;
  const g = db.guild(guild.id);
  const meId = guild.members.me.id;
  const isMine = (m) => m.author.id === meId && m.embeds.length > 0 && (!match || match(m));

  const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  const mine = recent ? [...recent.filter(isMine).values()] : []; // du plus récent au plus ancien

  // 1. message enregistré ; 2. sinon le plus récent du bot (base vide) ; 3. sinon nouveau message
  const ref = g.messages[key];
  let msg = null;
  if (ref?.channelId === channel.id) {
    msg = mine.find((m) => m.id === ref.messageId) ?? await channel.messages.fetch(ref.messageId).catch(() => null);
  }
  msg ??= mine[0] ?? null;

  if (msg) await msg.edit(payload);
  else msg = await channel.send(payload);
  if (g.messages[key]?.messageId !== msg.id) {
    g.messages[key] = { channelId: channel.id, messageId: msg.id };
    db.save();
  }

  const duplicates = mine.filter((m) => m.id !== msg.id);
  for (const d of duplicates) await d.delete().catch(() => null);
  return duplicates.length;
}

/** Reconnaît un panneau par le titre de son premier embed. */
const byTitle = (title) => (m) => m.embeds[0]?.title === title;

module.exports = { ensurePanel, byTitle };
