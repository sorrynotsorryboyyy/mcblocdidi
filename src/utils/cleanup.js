// Nettoyage des anciens messages du bot : le pied de page des embeds devient le pied actuel
// (« MCBLOC • play.mcbloc.fr »). Seul le pied de page change : texte, champs et boutons sont conservés.
const { ChannelType, EmbedBuilder } = require('discord.js');
const config = require('../../config');

const MAX_PER_CHANNEL = 500; // messages parcourus au plus par salon

/**
 * Nouveau pied de page, ou null s'il est déjà bon.
 * Ancien format : « McBlocDidi » ou « McBlocDidi • ID : 3 » → « MCBLOC • play.mcbloc.fr » (+ « • ID : 3 »).
 */
function fixedFooter(text) {
  if (typeof text !== 'string' || !text || text.startsWith(config.footer)) return null;
  const [, ...rest] = text.split(' • ');
  const host = config.footer.split(' • ').slice(1);
  const extra = rest.filter((part) => !host.includes(part));
  return [config.footer, ...extra].join(' • ');
}

/** Embeds corrigés d'un message, ou null s'il n'y a rien à changer. */
function fixedEmbeds(message) {
  let changed = false;
  const embeds = message.embeds.map((e) => {
    const footer = fixedFooter(e.footer?.text);
    if (!footer) return e;
    changed = true;
    return EmbedBuilder.from(e).setFooter({ text: footer, iconURL: e.footer.iconURL ?? undefined });
  });
  return changed ? embeds : null;
}

async function fixFooters(guild) {
  const meId = guild.members.me.id;
  const result = { channels: 0, scanned: 0, fixed: 0 };
  const channels = guild.channels.cache.filter((c) => [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(c.type)
    && c.permissionsFor(guild.members.me)?.has(['ViewChannel', 'ReadMessageHistory']));
  for (const channel of channels.values()) {
    result.channels += 1;
    let before;
    for (let seen = 0; seen < MAX_PER_CHANNEL;) {
      const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
      if (!batch?.size) break;
      seen += batch.size;
      before = batch.last().id;
      for (const msg of batch.values()) {
        if (msg.author.id !== meId || !msg.embeds.length) continue;
        result.scanned += 1;
        const embeds = fixedEmbeds(msg);
        if (!embeds) continue;
        await msg.edit({ embeds }).then(() => { result.fixed += 1; }).catch(() => null);
      }
      if (batch.size < 100) break;
    }
  }
  return result;
}

module.exports = { fixFooters, fixedFooter };
