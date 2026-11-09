const {
  SlashCommandBuilder, PermissionFlagsBits, ChannelType, ModalBuilder, ActionRowBuilder,
  TextInputBuilder, TextInputStyle,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Crée un embed personnalisé (annonce, info...)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addChannelOption((o) => o.setName('salon').setDescription('Salon où envoyer l\'embed')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),

  async execute(interaction) {
    const channel = interaction.options.getChannel('salon') ?? interaction.channel;
    const field = (id, label, style, required, max, placeholder) => new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(max)
        .setPlaceholder(placeholder),
    );

    const modal = new ModalBuilder()
      .setCustomId(`embed_modal:${channel.id}`)
      .setTitle('Créer un embed')
      .addComponents(
        field('titre', 'Titre', TextInputStyle.Short, false, 256, '📢 Nouvelle mise à jour !'),
        field('description', 'Contenu', TextInputStyle.Paragraph, true, 4000, 'Le texte de ton embed (markdown accepté)'),
        field('couleur', 'Couleur (hex)', TextInputStyle.Short, false, 7, '#2ecc71'),
        field('image', 'URL d\'une image', TextInputStyle.Short, false, 500, 'https://...'),
      );
    return interaction.showModal(modal);
  },
};
