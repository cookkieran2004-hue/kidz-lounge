// A canceled appointment that something active is booked over (the slot was
// re-filled) gets the right quarter of the column, and what's over it the
// left three quarters, so both stay readable instead of the canceled card
// hiding behind with a sliver showing. Only Canceled -- a No Show or two
// active bookings over each other are still a real conflict and keep the
// usual offset stacking. Returns 'left', 'right' or null.
// `columnAppointments`: every appointment in the same column (provider or
// room on a day), across all rows.
const mins = (t) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + (m || 0); };
const span = (a) => { const s = mins(a.appointment_time); return [s, s + (Number(a.duration) || 30)]; };
const overlaps = (a, b) => { const [s1, e1] = span(a); const [s2, e2] = span(b); return s1 < e2 && s2 < e1; };
export const isCanceledAppt = (a) => a.appointment_status === 'Canceled';

export function canceledLane(apt, columnAppointments) {
  const canceled = isCanceledAppt(apt);
  const other = columnAppointments.some(o => o !== apt && o.id !== apt.id && isCanceledAppt(o) !== canceled && overlaps(apt, o));
  if (!other) return null;
  return canceled ? 'right' : 'left';
}
