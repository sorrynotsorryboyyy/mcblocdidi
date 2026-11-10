// #vérification : accepter le règlement en indiquant son âge.
// customId : "verify_accept:minor" | "verify_accept:adult" (l'ancien "verify_accept" sans âge reste accepté).
const { getRole, replyEphemeral, setAgeRole } = require('../utils/helpers');
const { success, error } = require('../utils/embeds');
const invites = require('../utils/invites');

const AGE_KEYS = { minor: 'ageMinor', adult: 'ageAdult' };

module.exports = {
  prefixes: ['verify_accept'],
  async handle(interaction, arg) {
    const member = interaction.member;
    const memberRole = getRole(interaction.guild, 'member');
    const unverified = getRole(interaction.guild, 'unverified');
    const ageKey = AGE_KEYS[arg] ?? null;

    if (!memberRole) return replyEphemeral(interaction, { embeds: [error('Le serveur n\'est pas configuré. Un admin doit lancer `/setup`.')] });

    if (ageKey) await setAgeRole(member, ageKey);

    if (member.roles.cache.has(memberRole.id)) {
      return replyEphemeral(interaction, { embeds: [success(ageKey ? 'Ton âge a été mis à jour.' : 'Tu as déjà accepté le règlement !')] });
    }

    await member.roles.add(memberRole, 'Règlement accepté');
    if (unverified && member.roles.cache.has(unverified.id)) await member.roles.remove(unverified).catch(() => null);
    invites.onVerified(member); // condition de validation du parrainage

    return replyEphemeral(interaction, {
      embeds: [success('Merci ! Tu as maintenant accès à tout le serveur. Bon jeu ! 🎮')],
    });
  },
};
