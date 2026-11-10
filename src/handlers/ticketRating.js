// Note ⭐ d'un ticket, envoyée en MP à l'auteur à la fermeture.
// customId : ticket_rate:<guildId>:<channelId>:<1-5> (le MP n'a pas de serveur, il est dans l'id).
const config = require('../../config');
const db = require('../utils/db');
const { base } = require('../utils/embeds');
const { sendLog } = require('../utils/logger');

module.exports = {
  prefixes: ['ticket_rate'],
  allowDM: true,
  async handle(interaction, arg) {
    const [guildId, channelId, n] = arg.split(':');
    const rating = Number(n);
    const meta = db.guild(guildId).ticketMeta?.[channelId];
    const done = (text) => interaction.update({ embeds: [base(config.colors.info).setDescription(text)], components: [] });

    if (!meta || meta.ownerId !== interaction.user.id || !(rating >= 1 && rating <= 5)) {
      return done('Ce ticket est introuvable.');
    }
    if (meta.rating) return done(`Tu as déjà noté ce ticket : ${'⭐'.repeat(meta.rating)}`);

    meta.rating = rating;
    meta.ratedAt = Date.now();
    db.save();
    await done(`Merci pour ta note : ${'⭐'.repeat(rating)} ! 💙`);

    const guild = interaction.client.guilds.cache.get(guildId);
    if (guild) {
      await sendLog(guild, base(rating >= 4 ? config.colors.success : rating === 3 ? config.colors.warning : config.colors.error)
        .setTitle('⭐ Note de ticket')
        .setDescription(`<@${meta.ownerId}> a noté son ticket **${'⭐'.repeat(rating)}** (${rating}/5)`
          + (meta.claimedBy ? `\nPris en charge par <@${meta.claimedBy}>` : '')));
    }
  },
};
