const { getRole, replyEphemeral } = require('../utils/helpers');
const { success, error } = require('../utils/embeds');

module.exports = {
  prefixes: ['verify_accept'],
  async handle(interaction) {
    const member = interaction.member;
    const memberRole = getRole(interaction.guild, 'member');
    const unverified = getRole(interaction.guild, 'unverified');

    if (!memberRole) return replyEphemeral(interaction, { embeds: [error('Le serveur n\'est pas configuré. Un admin doit lancer `/setup`.')] });
    if (member.roles.cache.has(memberRole.id)) {
      return replyEphemeral(interaction, { embeds: [success('Tu as déjà accepté le règlement !')] });
    }

    await member.roles.add(memberRole, 'Règlement accepté');
    if (unverified && member.roles.cache.has(unverified.id)) await member.roles.remove(unverified).catch(() => null);

    return replyEphemeral(interaction, {
      embeds: [success('Merci ! Tu as maintenant accès à tout le serveur. Bon jeu ! 🎮')],
    });
  },
};
