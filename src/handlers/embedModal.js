// Formulaire de /embed : crée un embed personnalisé dans le salon choisi.
const { MessageFlags } = require('discord.js');
const config = require('../../config');
const { base, success, error } = require('../utils/embeds');

module.exports = {
  prefixes: ['embed_modal'],
  async handle(interaction, channelId) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const channel = interaction.guild.channels.cache.get(channelId);
    if (!channel?.isTextBased()) return interaction.editReply({ embeds: [error('Salon introuvable.')] });

    const title = interaction.fields.getTextInputValue('titre');
    const description = interaction.fields.getTextInputValue('description');
    const colorRaw = interaction.fields.getTextInputValue('couleur').replace('#', '').trim();
    const image = interaction.fields.getTextInputValue('image').trim();

    const color = /^[0-9a-f]{6}$/i.test(colorRaw) ? parseInt(colorRaw, 16) : config.colors.primary;
    const embed = base(color).setDescription(description);
    if (title) embed.setTitle(title);
    if (image) {
      if (!/^https?:\/\/\S+$/i.test(image)) return interaction.editReply({ embeds: [error('L\'URL de l\'image est invalide.')] });
      embed.setImage(image);
    }

    await channel.send({ embeds: [embed] });
    return interaction.editReply({ embeds: [success(`Embed envoyé dans ${channel}.`)] });
  },
};
