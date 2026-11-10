const db = require('../utils/db');
const { getRole, replyEphemeral } = require('../utils/helpers');
const { error, success } = require('../utils/embeds');
const launch = require('../utils/launch');

module.exports = {
  prefixes: ['launch_join'],
  async handle(interaction) {
    const data = db.guild(interaction.guild.id).state.launch;
    if (!data || data.status !== 'scheduled') return replyEphemeral(interaction, { embeds: [error('Les inscriptions sont fermées.')] });
    const role = getRole(interaction.guild, 'pioneer');
    const id = interaction.user.id;
    const joined = !data.pioneers.includes(id);
    data.pioneers = joined ? [...data.pioneers, id] : data.pioneers.filter((p) => p !== id);
    db.save();
    if (role) {
      if (joined) await interaction.member.roles.add(role, 'Pionnier du lancement').catch(() => null);
      else await interaction.member.roles.remove(role, 'Désinscription du lancement').catch(() => null);
    }
    await interaction.update(launch.panelPayload(data, interaction.guild));
    return replyEphemeral(interaction, {
      embeds: [success(joined
        ? `Tu es inscrit comme 🚀 Pionnier ! Pense à relier ton compte avec \`/lier\` pour recevoir **${data.rewardCoins} pièces** à l'ouverture.`
        : 'Tu n\'es plus inscrit.')],
    });
  },
};
