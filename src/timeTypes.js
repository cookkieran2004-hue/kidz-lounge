import { oooBlockColors, statusColor } from './pages/SchedulePage';

// Colors for My time, taken straight from the schedule so a block looks the
// same in both places: time off / out-of-office blocks use the schedule's
// oooBlockColors (PTO solid dark green, UPTO light green, the rest pale
// tints), and sessions use the appointment card's status color.
export function timeTypeStyle(type) {
  const c = oooBlockColors(type);
  // `accent`: the type's color for text on a white background (PTO's block
  // text is white, so its accent is the block's dark green instead).
  const accent = /^#fff(fff)?$/i.test(c.text) ? c.background : c.text;
  return { bg: c.background, border: c.border, text: c.text, accent, label: type };
}

// A session, drawn like the schedule's appointment card: a pale tint of its
// status color with a solid bar on the left (a stronger tint when canceled
// or a no-show).
export function sessionStyle(status) {
  const c = statusColor(status || 'Scheduled');
  const faded = status === 'Canceled' || status === 'No Show';
  return { bg: `color-mix(in srgb, ${c} ${faded ? 30 : 10}%, white)`, border: c, text: '#1f2937', accent: c, label: 'Session', bar: true };
}

// Mirrors ANNUAL_HOURS in the API's lib/timeOffAccrual.js: credited on the
// 1st of each month, rounded to the nearest quarter hour.
export const ANNUAL_HOURS = { PTO: 80, UPTO: 40 };
export const monthlyAccrual = (type) => Math.round(((ANNUAL_HOURS[type] || 0) / 12) * 4) / 4;
