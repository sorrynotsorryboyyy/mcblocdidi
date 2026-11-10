const {
  SlashCommandBuilder, PermissionFlagsBits, ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');

const field = (id, label, style, required, max, placeholder) => new ActionRowBuilder().addComponents(
  new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(max).setPlaceholder(placeholder),
);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('patchnote')
    .setDescription('Publie une note de mise à jour dans #annonces (mention 🆕 Mises à jour)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    return interaction.showModal(new ModalBuilder()
      .setCustomId('patchnote_modal')
      .setTitle('🆕 Note de mise à jour')
      .addComponents(
        field('version', 'Version', TextInputStyle.Short, true, 30, 'ex. 1.2.0'),
        field('title', 'Titre (optionnel)', TextInputStyle.Short, false, 100, 'ex. La mise à jour CoreWars !'),
        field('added', '✨ Nouveautés (une par ligne)', TextInputStyle.Paragraph, true, 1500, 'Nouveau kit Archer\nNouvelle map « Volcan »'),
        field('fixed', '🐛 Corrections (une par ligne)', TextInputStyle.Paragraph, false, 1000, 'Correction du lag au spawn'),
        field('other', '⚙️ Autres changements (une par ligne)', TextInputStyle.Paragraph, false, 1000, 'Équilibrage des classes'),
      ));
  },
};
