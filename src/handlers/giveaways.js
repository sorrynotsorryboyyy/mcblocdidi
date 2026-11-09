const db = require('../utils/db');
const { replyEphemeral } = require('../utils/helpers');
const { giveawayMessage, error, success } = require('../utils/embeds');

module.exports = {
  prefixes: ['gw_join'],
  async handle(interaction, id) {
    const gw = db.guild(interaction.guild.id).giveaways[id];
    if (!gw) return replyEphemeral(interaction, { embeds: [error('Ce giveaway n\'existe plus.')] });
    if (gw.ended || gw.endsAt <= Date.now()) return replyEphemeral(interaction, { embeds: [error('Ce giveaway est terminé.')] });

    const userId = interaction.user.id;
    const joined = !gw.participants.includes(userId);
    gw.participants = joined ? [...gw.participants, userId] : gw.participants.filter((p) => p !== userId);
    db.save();

    await interaction.update(giveawayMessage(gw));
    return replyEphemeral(interaction, {
      embeds: [joined ? success('Tu participes au giveaway ! Bonne chance 🍀') : success('Tu ne participes plus au giveaway.')],
    });
  },
};
