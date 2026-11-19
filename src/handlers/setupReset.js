// Confirmation de « /setup nettoyage:true » (remise à neuf) : "setup_reset:confirm:<horodatage>" | "setup_reset:cancel".
const { PermissionFlagsBits } = require('discord.js');
const { success, error } = require('../utils/embeds');
const { replyEphemeral } = require('../utils/helpers');

const VALID_MS = 5 * 60_000;

module.exports = {
  prefixes: ['setup_reset'],
  async handle(interaction, arg) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return replyEphemeral(interaction, { embeds: [error('Réservé aux administrateurs.')] });
    }
    const [action, at] = arg.split(':');
    if (action === 'cancel') return interaction.update({ embeds: [success('Remise à neuf annulée : rien n\'a été supprimé.')], components: [] });
    if (action !== 'confirm' || !(Date.now() - Number(at) < VALID_MS)) {
      return interaction.update({ embeds: [error('Confirmation expirée. Relance `/setup nettoyage:true`.')], components: [] });
    }
    await interaction.deferUpdate();
    return require('../commands/admin/setup').run(interaction, { reset: true });
  },
};
