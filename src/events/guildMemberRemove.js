const { Events } = require('discord.js');
const { getChannel } = require('../utils/helpers');
const { leaveEmbed } = require('../utils/embeds');

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    if (member.user?.bot) return;
    const channel = getChannel(member.guild, 'welcome');
    if (channel) await channel.send({ embeds: [leaveEmbed(member)] }).catch(() => null);
  },
};
