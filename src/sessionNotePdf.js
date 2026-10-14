import { loadPdfMake } from './manualPdf';
import { CLINIC } from './brand';

// PDFs for EI session notes (the "ei" feature, PedsDesk; src/SessionNotes.jsx):
// one signed note laid out like the NYC EI Individual Session Note, and a
// child's service log for a month (NYC's form: one row per session with the
// parent's drawn signature). Staff print or share them; the app sends no email.

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
const stamp = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const dayOf = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA') : null);

const label = (text) => ({ text, fontSize: 8, color: '#52525B', margin: [0, 0, 0, 1] });
const value = (text) => ({ text: text || '—', fontSize: 10 });
const cell = (l, v) => ({ stack: [label(l), value(v)], margin: [3, 3, 3, 3] });
const block = (title, body) => ({
  table: { widths: ['*'], body: [[{ stack: [{ text: title, bold: true, fontSize: 9.5, margin: [0, 0, 0, 3] }, ...(Array.isArray(body) ? body : [body])], margin: [4, 4, 4, 6] }]] },
  layout: 'lightHorizontalLines', margin: [0, 4, 0, 0],
});

// One note as a PDF Blob. `data` is GET /session-notes/note's answer.
export async function buildSessionNotePdf(data) {
  const pdfMake = await loadPdfMake();
  const { session, note, addenda } = data;
  const h = note.header || session.header;
  const outcomes = session.outcomes.filter(o => (note.outcome_ids || []).includes(o.id));
  const codes = [...(h.cpt_codes || []).map((c, i) => `CPT ${i + 1}: ${c}`), ...(h.hcpcs_codes || []).map(c => `HCPCS: ${c}`)].join('   ');
  const content = [
    { columns: [
      { text: 'Early Intervention Program\nIndividual Session Note (Home/Facility)', bold: true, fontSize: 13 },
      { text: CLINIC.name, alignment: 'right', fontSize: 10, color: '#52525B' },
    ], margin: [0, 0, 0, 8] },
    { table: { widths: ['*', '*', '*', '*'], body: [
      [cell("Child's name", h.child_name), cell('DOB', fmtDate(h.date_of_birth)), cell('Sex', h.sex === 'F' ? 'Female' : h.sex === 'M' ? 'Male' : ''), cell('EI #', h.ei_number)],
      [cell("Interventionist's name", h.interventionist), cell('Credentials', h.credentials), cell('NPI #', h.npi), cell('Service type', SERVICE_LABEL[h.service] || h.service)],
      [cell('Session date', fmtDate(note.session_date)), cell('Time', `${fmtTime(note.start_time)} to ${fmtTime(note.end_time)}`), cell('IFSP service location', LOCATION_LABEL[note.location]), cell('Session delivered', DELIVERY_LABEL[note.delivery])],
      [cell('Intensity', note.location === 'facility' ? 'Individual - facility' : note.location ? 'Home/community' : ''), cell('Date note written', fmtDate(dayOf(note.provider_signed_at))), cell('ICD-10', h.icd10), cell('Codes', codes)],
    ] }, layout: 'lightHorizontalLines' },
  ];
  if (note.cancelled) content.push({ text: `Session cancelled - reason in #1. Session must be made up by: ${fmtDate(note.makeup_by)}`, bold: true, fontSize: 10, margin: [0, 6, 0, 0] });
  if (note.makeup_for_date) content.push({ text: `This is a make-up for a missed session on ${fmtDate(note.makeup_for_date)}.`, fontSize: 10, margin: [0, 6, 0, 0] });
  if (!note.cancelled) {
    content.push({ text: `Session participants: ${(note.participants || []).map(p => PARTICIPANT_LABEL[p]).join(', ')}${note.participants_other ? ` (${note.participants_other})` : ''}`, fontSize: 10, margin: [0, 6, 0, 0] });
  }
  content.push(block(note.cancelled ? '1. Reason the session was cancelled' : '1. IFSP outcome(s) and developmental step(s) addressed during this session', [
    ...outcomes.map(o => ({ text: `Outcome ${o.number}: ${o.outcome}`, fontSize: 10 })),
    ...(note.outcomes_text ? [{ text: note.outcomes_text, fontSize: 10, margin: [0, outcomes.length ? 3 : 0, 0, 0] }] : []),
  ]));
  if (!note.cancelled) {
    content.push(block("2. What happened during today's session and the progress made toward the IFSP outcome(s)", { text: note.narrative || '', fontSize: 10 }));
    content.push(block('3. How did you work with the parent/caregiver?', { text: [...(note.parent_methods || []).filter(m => m !== 'other').map(m => METHOD_LABEL[m]), ...(note.parent_methods || []).includes('other') ? [`Other: ${note.parent_methods_other || ''}`] : []].join('; '), fontSize: 10 }));
    content.push(block("4. Strategies/activities agreed to support the child's learning and development between visits", { text: note.strategies || '', fontSize: 10 }));
  }
  const sigRow = (title, image, lines) => ({ columns: [
    { width: 150, stack: [label(title), image ? { image, width: 140, height: 46 } : { text: '—', fontSize: 10 }] },
    { stack: lines.map(l => ({ text: l, fontSize: 9.5 })), margin: [8, 10, 0, 0] },
  ], margin: [0, 8, 0, 0] });
  if (!note.cancelled) {
    content.push(sigRow('Parent/caregiver signature', note.parent_note_signature, [
      note.parent_name ? `${note.parent_name} · ${note.parent_relationship || ''}` : 'Not signed yet',
      note.parent_signed_at ? `Date: ${fmtDate(dayOf(note.parent_signed_at))}` : '',
    ]));
  }
  content.push(sigRow('Interventionist signature', note.provider_signature, [
    `${h.interventionist}${h.credentials ? `, ${h.credentials}` : ''}`,
    note.provider_license ? `License/certification #: ${note.provider_license}` : '',
    note.provider_signed_at ? `Date: ${fmtDate(dayOf(note.provider_signed_at))}` : 'Not signed yet',
  ]));
  if (addenda.length) {
    content.push({ text: 'Addenda', bold: true, fontSize: 10.5, margin: [0, 12, 0, 2] });
    for (const a of addenda) content.push({ text: [{ text: `${stamp(a.signed_at)} · ${a.signed_name || a.signed_by}: `, bold: true }, a.body], fontSize: 9.5, margin: [0, 2, 0, 0] });
  }
  return pdfMake.createPdf({ content, pageMargins: [36, 36, 36, 36], defaultStyle: { fontSize: 10 } }).getBlob();
}

// A month's service log for one child and provider. `log` is GET
// /session-notes/service-log's answer; `child` the note header to use.
export async function buildServiceLogPdf(log, child) {
  const pdfMake = await loadPdfMake();
  const h = child || log.rows[0]?.header || {};
  const body = [[
    'Date of service', 'Start time', 'End time', 'In-person (I) or telehealth (T)', 'CPT code', 'Signature of parent/caregiver verifying that the service was delivered on the date and time indicated', 'Date signed',
  ].map(t => ({ text: t, bold: true, fontSize: 8 }))];
  for (const r of log.rows) {
    const codes = [...(r.header?.cpt_codes || []), ...(r.header?.hcpcs_codes || [])];
    body.push([
      fmtDate(r.session_date), fmtTime(r.start_time), fmtTime(r.end_time), r.delivery === 'telehealth' ? 'T' : 'I',
      [...new Set(codes)].join(', '),
      r.parent_log_signature ? { stack: [{ image: r.parent_log_signature, width: 130, height: 36 }, { text: `${r.parent_name} (${r.parent_relationship})`, fontSize: 7.5 }] } : '',
      fmtDate(dayOf(r.parent_signed_at)),
    ].map(x => (typeof x === 'string' ? { text: x, fontSize: 9 } : x)));
  }
  const content = [
    { text: 'Early Intervention Program Service Log', bold: true, fontSize: 13, margin: [0, 0, 0, 8] },
    { table: { widths: ['*', '*', '*'], body: [
      [cell("Child's name", h.child_name), cell('Date of birth', fmtDate(h.date_of_birth)), cell("Child's EI #", h.ei_number)],
      [cell('Service type', SERVICE_LABEL[h.service] || h.service), cell('Interventionist name', h.interventionist), cell('NPI #', h.npi)],
      [cell('Discipline', h.credentials), cell('Provider agency name', log.agency_name || CLINIC.name), cell('Month', log.month)],
    ] }, layout: 'lightHorizontalLines', margin: [0, 0, 0, 8] },
    log.rows.length
      ? { table: { headerRows: 1, widths: [52, 46, 46, 50, 52, '*', 52], body }, layout: 'lightHorizontalLines' }
      : { text: 'No signed sessions this month.', fontSize: 10 },
  ];
  return pdfMake.createPdf({ content, pageOrientation: 'landscape', pageMargins: [30, 30, 30, 30] }).getBlob();
}

// Opens a Blob in a new tab (the browser's viewer prints and saves it).
export function openBlob(blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
