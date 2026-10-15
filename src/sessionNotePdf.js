// Labels and formatting for EI session notes (the "ei" feature, PedsDesk;
// src/SessionNotes.jsx). The PDFs themselves are laid out like NYC's official
// forms in src/eiFormsPdf.js.

export const LOCATION_LABEL = { home: 'Home', community: 'Community (e.g. child care)', facility: 'Facility' };
export const DELIVERY_LABEL = { in_person: 'In-person', telehealth: 'Telehealth' };
export const PARTICIPANT_LABEL = { child: 'Child', parent: 'Parent/caregiver', other: 'Other' };
export const METHOD_LABEL = {
  observed: 'Observed parent/caregiver and child during routines',
  tried_feedback: 'Parent/caregiver tried activity, feedback exchanged',
  demonstrated: 'Demonstrated activity to parent/caregiver',
  communication_tool: 'Reviewed communication tool with parent/caregiver',
  other: 'Other',
};
export const SERVICE_LABEL = { ST: 'Speech Therapy', OT: 'Occupational Therapy', PT: 'Physical Therapy', SI: 'Special Instruction' };

export const fmtDate = (s) => (s ? `${s.slice(5, 7)}/${s.slice(8, 10)}/${s.slice(0, 4)}` : '');
export function fmtTime(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
// Opens a Blob in a new tab (the browser's viewer prints and saves it).
export function openBlob(blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
