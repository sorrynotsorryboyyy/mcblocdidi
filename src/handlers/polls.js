const db = require('../utils/db');
const { replyEphemeral } = require('../utils/helpers');
const { error, success } = require('../utils/embeds');
const polls = require('../utils/polls');

module.exports = {
  prefixes: ['poll_vote'],
  async handle(interaction, arg) {
    const [id, n] = arg.split(':');
    const poll = db.guild(interaction.guild.id).polls[id];
    if (!poll) return replyEphemeral(interaction, { embeds: [error('Ce sondage n\'existe plus.')] });
    if (poll.ended || (poll.endsAt && poll.endsAt <= Date.now())) {
      return replyEphemeral(interaction, { embeds: [error('Ce sondage est terminé.')] });
    }
    const choice = Number(n);
    if (!Number.isInteger(choice) || !poll.choices[choice]) return replyEphemeral(interaction, { embeds: [error('Choix invalide.')] });

    const result = polls.vote(poll, interaction.user.id, choice);
    db.save();
    await interaction.update(polls.pollMessage(poll));
    return replyEphemeral(interaction, {
      embeds: [success(result === null ? 'Ton vote a été retiré.' : `Vote enregistré : ${polls.NUMBERS[choice]} **${poll.choices[choice]}**`)],
    });
  },
};
