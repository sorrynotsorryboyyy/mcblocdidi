const { Events } = require('discord.js');
const db = require('../utils/db');
const { getChannel, getRole } = require('../utils/helpers');
const { welcomeEmbed, welcomeDm } = require('../utils/embeds');
const invites = require('../utils/invites');
const antiraid = require('../utils/antiraid');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    if (member.user.bot) return;
    await antiraid.onJoin(member);

    const unverified = getRole(member.guild, 'unverified');
    if (unverified) await member.roles.add(unverified, 'Arrivée sur le serveur').catch(() => null);

    const channel = getChannel(member.guild, 'welcome');
    if (channel) await channel.send({ content: `${member}`, embeds: [welcomeEmbed(member)] }).catch(() => null);

    // Guide en MP : une seule fois par membre, à vie (pas à chaque retour)
    const st = db.guild(member.guild.id).state;
    st.welcomed ??= {};
    if (!st.welcomed[member.id]) {
      st.welcomed[member.id] = Date.now();
      db.save();
      await member.send({ embeds: [welcomeDm(member)] }).catch(() => null); // MP fermés : tant pis
    }

    await invites.onJoin(member);
  },
};
