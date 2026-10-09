import { api } from './api';

// Drag-and-drop on the schedule grids (daily Provider / Room views and the
// Weekly view). The pointer handling is in useAppointmentDrag.js and the
// floating card / drop outline / Undo bar in AppointmentDragLayer.jsx; this
// file decides what can be dragged and what a drop saves.
//
// Kieran's rules (Oct 2026):
// - A drop saves straight away; the Undo bar puts it back.
// - A weekly-series date moves on its own (the series is left as it is).
// - Conflicts don't block a drop: the usual warnings show afterwards.
// - A Canceled / No Show appointment never moves. Dragging it books a
//   make-up where it's dropped, linked to it like "Schedule make up", and the
//   original stays put. Not when it already has a make-up, or for the HOLD
//   placeholder (it isn't a real session; the API refuses that too).

const MISSED_STATUSES = ['Canceled', 'No Show'];
// Same check as isHoldPatient (SchedulePage.jsx) by name; kept here so this
// module doesn't import the page.
const HOLD_NAME = 'hold - see comments';

export const isMissedAppt = (apt) => MISSED_STATUSES.includes(apt.appointment_status);

export function canDragAppointment(apt) {
  if (!isMissedAppt(apt)) return true;
  return !apt.makeup && String(apt.patient_name || '').trim().toLowerCase() !== HOLD_NAME;
}

// Times are only ever 8:00 AM - 6:00 PM, so the last start is 5:45.
export const FIRST_START = 8 * 60;
export const LAST_START = 17 * 60 + 45;

const toHHMM = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
export const minutesToTime = toHHMM;

function timeLabel(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function dateLabel(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// What the drop changes. `target`: { date, time, provider?, room? } -- a
// provider or room only when the drop column is one (daily Provider / Room
// views); otherwise the appointment keeps its own.
function changesFor(apt, target) {
  const changes = {};
  if (target.date !== apt.appointment_date) changes.appointment_date = target.date;
  if (target.time !== String(apt.appointment_time).slice(0, 5)) changes.appointment_time = target.time;
  if (target.provider && target.provider !== apt.provider) changes.provider = target.provider;
  if (target.room && target.room !== apt.treatment_area) changes.treatment_area = target.room;
  return changes;
}

// Where a move puts the card, to show it there before the save finishes.
export function movedFields(apt, target) {
  return {
    appointment_date: target.date,
    appointment_time: target.time,
    provider: target.provider || apt.provider,
    treatment_area: target.room || apt.treatment_area,
  };
}

export function isSameSpot(apt, target) {
  return Object.keys(changesFor(apt, target)).length === 0;
}

// "Thu, Oct 9 at 2:15 PM with Jordan Reyes in Gym B" -- only the parts that
// differ from where it was (the day and time always).
export function describeDrop(apt, target) {
  let text = `${dateLabel(target.date)} at ${timeLabel(target.time)}`;
  if (target.provider && target.provider !== apt.provider) text += ` with ${target.provider}`;
  if (target.room && target.room !== apt.treatment_area) text += ` in ${target.room}`;
  return text;
}

// Saves a drop. Returns { message, undo } for the Undo bar.
export async function saveDrop(apt, target) {
  const name = apt.patient_name || 'Appointment';
  const where = describeDrop(apt, target);

  if (isMissedAppt(apt)) {
    const created = await api.createAppointment({
      patient_name: apt.patient_name,
      provider: target.provider || apt.provider,
      appointment_date: target.date,
      appointment_time: target.time,
      duration: Number(apt.duration) || 30,
      // The canceled session's room was cleared when it was canceled; a
      // drop on a Room view column picks one.
      treatment_area: target.room || null,
      appointment_status: 'Scheduled',
      makeup_for: apt.id,
    });
    return {
      message: `Make up booked for ${name}: ${where}`,
      undo: () => api.deleteAppointment(created.id),
    };
  }

  const changes = changesFor(apt, target);
  const original = {
    appointment_date: apt.appointment_date,
    appointment_time: String(apt.appointment_time).slice(0, 5),
    provider: apt.provider,
    treatment_area: apt.treatment_area || null,
  };
  if (apt.is_virtual) {
    // Still part of the weekly pattern: this date becomes its own row (the
    // same "this one only" exception the appointment window makes), and
    // the rest of the series doesn't change.
    const row = await api.createRecurringException(apt.series_id, {
      occurrence_date: apt.appointment_date,
      patient_name: apt.patient_name,
      provider: apt.provider,
      appointment_date: apt.appointment_date,
      appointment_time: original.appointment_time,
      duration: apt.duration,
      treatment_area: apt.treatment_area || null,
      appointment_status: apt.appointment_status,
      ...changes,
    });
    return {
      message: `Moved ${name} to ${where}`,
      undo: () => api.updateAppointment(row.id, original),
    };
  }
  // Only the changed fields: the API keeps everything not sent.
  await api.updateAppointment(apt.id, changes);
  return {
    message: `Moved ${name} to ${where}`,
    undo: () => api.updateAppointment(apt.id, original),
  };
}
