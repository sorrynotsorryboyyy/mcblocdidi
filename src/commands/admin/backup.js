const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { success } = require('../../utils/embeds');
const backup = require('../../utils/backup');
const monitor = require('../../utils/monitor');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('backup')
    .setDescription('Télécharge une sauvegarde de la base du bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const file = backup.makeBackup();
    const { lastSeen } = monitor.status();
    return interaction.editReply({
      embeds: [success(
        'Sauvegarde créée. Garde ce fichier en lieu sûr (il contient les comptes liés, avertissements, récompenses...).\n'
        + `🌉 Pont Minecraft : ${lastSeen ? `dernier contact <t:${Math.floor(lastSeen / 1000)}:R>` : 'aucun contact depuis le démarrage du bot'}`,
      )],
      files: [backup.attachment(file)],
    });
  },
};
