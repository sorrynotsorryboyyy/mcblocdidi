// Formulaire de /embed : crée un embed personnalisé dans le salon choisi.
const { MessageFlags } = require('discord.js');
const config = require('../../config');
const { base, success, error } = require('../utils/embeds');

module.exports = {
  prefixes: ['embed_modal'],
  // arg = "<salonId>" ou "<salonId>:<rôleId à mentionner>"
  async handle(interaction, arg) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const [channelId, roleId] = arg.split(':');
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

    // Mention optionnelle (@everyone si le rôle choisi est @everyone)
    const everyone = roleId === interaction.guild.id;
    const role = roleId && !everyone ? interaction.guild.roles.cache.get(roleId) : null;
    const msg = await channel.send({
      content: everyone ? '@everyone' : role ? `${role}` : undefined,
      embeds: [embed],
      allowedMentions: everyone ? { parse: ['everyone'] } : { roles: role ? [role.id] : [] },
    });
    // Salon d'annonces : publication auto vers les serveurs abonnés
    if (msg.crosspostable) await msg.crosspost().catch(() => null);
    return interaction.editReply({ embeds: [success(`Embed envoyé dans ${channel}.`)] });
  },
};
