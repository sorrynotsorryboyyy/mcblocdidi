// Boutons et formulaires de l'espace staff :
//   staff_abs:new | staff_abs:end | staff_abs:modal       (#absences)
//   staff_meet:<yes|maybe|no|cancel>:<id>                  (#réunions)
//   staff_task:<take|done|delete>:<id>                     (#tâches)
const {
  ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits,
} = require('discord.js');
const { success, error } = require('../utils/embeds');
const { isStaff, replyEphemeral } = require('../utils/helpers');
const db = require('../utils/db');
const staff = require('../utils/staff');

const isAdmin = (member) => member.permissions.has(PermissionFlagsBits.Administrator);

function absenceModal() {
  const input = (id, label, style, required, placeholder, max) => new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setPlaceholder(placeholder).setMaxLength(max),
  );
  return new ModalBuilder().setCustomId('staff_abs:modal').setTitle('🗓️ Déclarer une absence').addComponents(
    input('from', 'Du (JJ/MM)', TextInputStyle.Short, true, 'ex. 24/12', 10),
    input('to', 'Au (JJ/MM) — vide = un seul jour', TextInputStyle.Short, false, 'ex. 02/01', 10),
    input('reason', 'Motif (facultatif, visible du staff)', TextInputStyle.Paragraph, false, 'ex. vacances, examens…', 150),
  );
}

async function absences(interaction, action) {
  const { guild, user } = interaction;
  if (action === 'new') return interaction.showModal(absenceModal());
  if (action === 'end') {
    const n = staff.endAbsences(guild.id, user.id);
    await staff.refreshAbsences(guild).catch(() => null);
    return replyEphemeral(interaction, { embeds: [n ? success('Bon retour ! Tes absences ont été retirées.') : error('Tu n\'as aucune absence déclarée.')] });
  }
  if (action === 'modal') {
    const range = staff.absenceRange(interaction.fields.getTextInputValue('from'), interaction.fields.getTextInputValue('to'));
    if (range.error) return replyEphemeral(interaction, { embeds: [error(range.error)] });
    staff.addAbsence(guild.id, { userId: user.id, ...range, reason: interaction.fields.getTextInputValue('reason') });
    await staff.refreshAbsences(guild).catch(() => null);
    return replyEphemeral(interaction, { embeds: [success(`Absence enregistrée du <t:${Math.floor(range.from / 1000)}:D> au <t:${Math.floor(range.to / 1000)}:D>. Bon repos !`)] });
  }
  return null;
}

async function meetings(interaction, action, id) {
  const m = staff.state(interaction.guild.id).meetings[id];
  if (!m || m.cancelled || m.ended) return replyEphemeral(interaction, { embeds: [error('Cette réunion n\'est plus d\'actualité.')] });
  if (action === 'cancel') {
    if (m.authorId !== interaction.user.id && !isAdmin(interaction.member)) {
      return replyEphemeral(interaction, { embeds: [error('Seul l\'organisateur ou un admin peut annuler la réunion.')] });
    }
    m.cancelled = true;
    db.save();
    await interaction.update(staff.meetingMessage(interaction.guild, m));
    return interaction.followUp({ ...staff.staffPing(interaction.guild), embeds: [error(`La réunion **${m.subject}** est annulée.`)] });
  }
  if (!['yes', 'maybe', 'no'].includes(action)) return null;
  m.rsvp[interaction.user.id] = action;
  db.save();
  return interaction.update(staff.meetingMessage(interaction.guild, m));
}

async function tasks(interaction, action, id) {
  const { guild, user } = interaction;
  const t = staff.state(guild.id).tasks[id];
  if (!t) return replyEphemeral(interaction, { embeds: [error('Cette tâche n\'existe plus.')] });

  if (action === 'delete') {
    if (t.authorId !== user.id && !isAdmin(interaction.member)) {
      return replyEphemeral(interaction, { embeds: [error('Seul l\'auteur de la tâche ou un admin peut la supprimer.')] });
    }
    delete staff.state(guild.id).tasks[id];
    db.save();
    await interaction.message.delete().catch(() => null);
    await staff.refreshTasks(guild).catch(() => null);
    return replyEphemeral(interaction, { embeds: [success(`Tâche #${t.number} supprimée.`)] });
  }
  if (action === 'take') {
    t.assigneeId = t.assigneeId === user.id ? null : user.id; // re-cliquer = se retirer
    t.status = t.assigneeId ? 'doing' : 'todo';
  } else if (action === 'done') {
    t.status = 'done';
    t.doneBy = user.id;
    t.doneAt = Date.now();
  } else {
    return null;
  }
  db.save();
  await interaction.update(staff.taskCard(t));
  await staff.refreshTasks(guild).catch(() => null);
  return null;
}

module.exports = {
  prefixes: ['staff_abs', 'staff_meet', 'staff_task'],
  async handle(interaction, arg, prefix) {
    if (!isStaff(interaction.member)) return replyEphemeral(interaction, { embeds: [error('Réservé au staff.')] });
    const [action, id] = arg.split(':');
    if (prefix === 'staff_abs') return absences(interaction, action);
    if (prefix === 'staff_meet') return meetings(interaction, action, id);
    return tasks(interaction, action, id);
  },
};
