const { Events } = require('discord.js');
const boosts = require('../utils/boosts');

module.exports = {
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember) {
    await boosts.onMemberUpdate(oldMember, newMember);
  },
};
