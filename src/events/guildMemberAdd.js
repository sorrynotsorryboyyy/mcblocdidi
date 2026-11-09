const { Events } = require('discord.js');
const { getChannel, getRole } = require('../utils/helpers');
const { welcomeEmbed } = require('../utils/embeds');
const invites = require('../utils/invites');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    if (member.user.bot) return;

    const unverified = getRole(member.guild, 'unverified');
    if (unverified) await member.roles.add(unverified, 'Arrivée sur le serveur').catch(() => null);

    const channel = getChannel(member.guild, 'welcome');
    if (channel) await channel.send({ content: `${member}`, embeds: [welcomeEmbed(member)] }).catch(() => null);

    await invites.onJoin(member);
  },
};
