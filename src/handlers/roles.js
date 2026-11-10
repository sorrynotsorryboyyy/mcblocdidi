// Menu de sélection des rôles : sélectionner un rôle l'ajoute ou le retire (bascule).
const { MessageFlags } = require('discord.js');
const { allRoleDefs, getRole, setAgeRole } = require('../utils/helpers');
const { base, error, success } = require('../utils/embeds');
const config = require('../../config');

module.exports = {
  prefixes: ['roles_select', 'age_select'],
  async handle(interaction, _arg, prefix) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const member = interaction.member;

    // Menu « Ton âge » : choix unique, remplace l'ancien rôle d'âge
    if (prefix === 'age_select') {
      const key = interaction.values[0];
      const ok = await setAgeRole(member, key);
      await interaction.message.edit({ components: interaction.message.components }).catch(() => null);
      if (!ok) return interaction.editReply({ embeds: [error('Rôle d\'âge introuvable. Un admin doit relancer `/setup`.')] });
      return interaction.editReply({ embeds: [success(`Ton âge est enregistré : ${getRole(interaction.guild, key)}.`)] });
    }
    const allowed = new Set(allRoleDefs().filter((d) => d.selfAssign).map((d) => d.key));

    const added = [];
    const removed = [];
    for (const key of interaction.values) {
      if (!allowed.has(key)) continue;
      const role = getRole(interaction.guild, key);
      if (!role) continue;
      if (member.roles.cache.has(role.id)) {
        await member.roles.remove(role, 'Rôle auto');
        removed.push(role);
      } else {
        await member.roles.add(role, 'Rôle auto');
        added.push(role);
      }
    }

    if (!added.length && !removed.length) {
      return interaction.editReply({ embeds: [error('Aucun rôle modifié.')] });
    }

    // Réinitialise la sélection visuelle du menu pour l'utilisateur
    await interaction.message.edit({ components: interaction.message.components }).catch(() => null);

    const lines = [];
    if (added.length) lines.push(`➕ Ajouté : ${added.join(', ')}`);
    if (removed.length) lines.push(`➖ Retiré : ${removed.join(', ')}`);
    return interaction.editReply({ embeds: [base(config.colors.success).setDescription(lines.join('\n'))] });
  },
};
