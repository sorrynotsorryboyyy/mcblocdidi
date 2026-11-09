const db = require('../utils/db');
const { isStaff, replyEphemeral } = require('../utils/helpers');
const { tournamentMessage, error, success } = require('../utils/embeds');

module.exports = {
  prefixes: ['tournoi_join', 'tournoi_leave', 'tournoi_close'],

  async handle(interaction, id, prefix) {
    const g = db.guild(interaction.guild.id);
    const t = g.tournaments[id];
    if (!t) return replyEphemeral(interaction, { embeds: [error('Ce tournoi n\'existe plus.')] });
    const userId = interaction.user.id;

    if (prefix === 'tournoi_join') {
      if (t.closed) return replyEphemeral(interaction, { embeds: [error('Les inscriptions sont closes.')] });
      if (t.participants.includes(userId)) return replyEphemeral(interaction, { embeds: [error('Tu es déjà inscrit !')] });
      if (t.participants.length >= t.slots) return replyEphemeral(interaction, { embeds: [error('Le tournoi est complet.')] });
      t.participants.push(userId);
    } else if (prefix === 'tournoi_leave') {
      if (!t.participants.includes(userId)) return replyEphemeral(interaction, { embeds: [error('Tu n\'es pas inscrit.')] });
      t.participants = t.participants.filter((p) => p !== userId);
    } else if (prefix === 'tournoi_close') {
      if (!isStaff(interaction.member)) return replyEphemeral(interaction, { embeds: [error('Réservé au staff.')] });
      t.closed = !t.closed;
    }

    db.save();
    await interaction.update(tournamentMessage(t, interaction.guild));

    const msg = {
      tournoi_join: `Inscription confirmée ! (${t.participants.length}/${t.slots})`,
      tournoi_leave: 'Tu as été désinscrit.',
      tournoi_close: t.closed ? 'Inscriptions clôturées.' : 'Inscriptions rouvertes.',
    }[prefix];
    return replyEphemeral(interaction, { embeds: [success(msg)] });
  },
};
