const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { success, error } = require('../../utils/embeds');
const { unlink } = require('../../utils/links');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('delier')
    .setDescription('Délie ton compte Minecraft'),

  async execute(interaction) {
    const old = unlink(interaction.guild.id, interaction.user.id);
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      embeds: [old ? success(`Ton compte n'est plus lié à **${old.name}**.`) : error('Ton compte n\'est lié à aucun compte Minecraft.')],
    });
  },
};
