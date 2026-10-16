// Where an appointment is (Kieran, Oct 2026), read from its treatment_area.
// Kept out of SchedulePage.jsx so it can share plain functions (fast refresh).
//
// Stored values:
//   "Room 1", "Gym" ...                 Center, in that room
//   "Center"                            Center, room not set yet (Oct 15 2026)
//   "Offsite (School): Sunnyside"       School (name optional in older rows)
//   "Offsite (Home)" / "Offsite (Home): place"   Home
//   "Offsite", "Offsite: place", "Offsite (Center): place"   older offsite
//       rows with no (or the retired "other center") setting; still read
//       until someone picks Center, School or Home.
// Billing reads the same values (kidz-lounge-api routes/billing.js settingOf).
import { api } from './api';

const OFFSITE_RE = /^Offsite(?: \((Center|School|Home)\))?(?::\s*(.*))?$/;
export function isOffsite(area) {
  return typeof area === 'string' && OFFSITE_RE.test(area);
}
export function offsiteLocation(area) {
  if (!isOffsite(area)) return '';
  return (area.match(OFFSITE_RE)[2] || '').trim();
}
export function offsiteSetting(area) {
  if (!isOffsite(area)) return '';
  return area.match(OFFSITE_RE)[1] || '';
}

// Every appointment starts by picking where it is (Oct 15 2026): Center (a
// room, or not set yet), School or Home.
export const CENTER = 'Center';
export const SETTINGS = ['Center', 'School', 'Home'];
// The setting a stored value stands for ('' = none / an older offsite one).
export function settingOfArea(area) {
  if (!area) return '';
  if (isOffsite(area)) { const s = offsiteSetting(area); return s === 'Center' ? '' : s; }
  return 'Center';
}
// The in-office room, or '' (none set, or not at the center).
export const roomOfArea = (area) => (area && !isOffsite(area) && area !== CENTER ? area : '');
// Virtual (Oct 16 2026): picked like a room under Center, but not a real
// one -- no Room view column, any number at once, and canceling keeps it.
export const VIRTUAL = 'Virtual';
// A real in-office room someone could be double-booked into.
export const holdsRoom = (area) => !!roomOfArea(area) && area !== VIRTUAL;
// A session needs a room picked: none at all, or at the center with no room yet.
export const needsRoom = (area) => !area || area === CENTER;
// The area a status change keeps (Oct 16 2026): Canceled or No Show at the
// center keeps "Center" but frees the room; School / Home / Virtual stay,
// so billing's Setting column (C / S / H) still knows where it was. Mirrors
// kidz-lounge-api routes/appointments.js areaAfterStatus.
export function areaAfterStatus(status, area) {
  if (['Canceled', 'No Show'].includes(status) && area && !isOffsite(area) && area !== VIRTUAL) return CENTER;
  return area || null;
}
// Off the 8 AM - 6 PM grid (Oct 15 2026: any time is allowed; these show in
// the strip under the schedule instead of the old Outside hours tickbox).
export const isOffGrid = (apt) => {
  const [h, m] = String(apt.appointment_time || '00:00').slice(0, 5).split(':').map(Number);
  const start = h * 60 + (m || 0);
  return start < 8 * 60 || start + (Number(apt.duration) || 30) > 18 * 60;
};


// A session that repeats: part of a weekly series (rule-based), or of a
// fixed set of weeks booked together (`fin`).
export const seriesIdOf = (apt) => (apt?.is_virtual ? apt.series_id : apt?.exception_of_series_id) || null;
export const isRepeating = (apt) => !!(seriesIdOf(apt) || apt?.fin);

// Saves a new treatment_area for a session (Kieran, Oct 15 2026: Center /
// School / Home "this and all future"). allFuture on a weekly series splits
// it from this occurrence on (API /recurring-series/:id/split, which also
// moves its later one-off rows across); on a fixed set of weeks it updates
// this one and the later ones. Otherwise just this session (a virtual
// occurrence becomes a real row).
export async function saveSettingChange(apt, area, allFuture) {
  const value = area || null;
  const seriesId = seriesIdOf(apt);
  if (allFuture && seriesId) {
    const from = String(apt.is_virtual ? apt.appointment_date : (apt.exception_occurrence_date || apt.appointment_date)).slice(0, 10);
    return api.splitRecurringSeries(seriesId, { from_date: from, treatment_area: value, occurrence_date: from });
  }
  const fieldsOf = (a) => ({
    patient_name: a.patient_name, provider: a.provider, appointment_time: a.appointment_time, duration: a.duration,
    appointment_status: a.appointment_status, appointment_date: String(a.appointment_date).slice(0, 10), comments: a.comments,
  });
  if (apt.is_virtual) {
    await api.createRecurringException(apt.series_id, { occurrence_date: apt.appointment_date, ...fieldsOf(apt), treatment_area: value });
  } else {
    await api.updateAppointment(apt.id, { ...fieldsOf(apt), treatment_area: value });
  }
  if (allFuture && apt.fin) {
    const later = await api.getFinMatches(apt.fin, String(apt.appointment_date).slice(0, 10));
    // A missed session keeps what it had (canceling already cleared its room).
    for (const m of (later || []).filter(x => !x.deleted && !['Canceled', 'No Show'].includes(x.appointment_status))) {
      await api.updateAppointment(m.id, { ...fieldsOf(m), treatment_area: value });
    }
  }
  return null;
}
