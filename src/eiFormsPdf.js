import { loadPdfMake } from './manualPdf';
import { CLINIC } from './brand';
import { NYC_HEALTH_LOGO } from './nycHealthLogo';

// PedsDesk's EI documents laid out like NYC's official forms (the "ei"
// feature; Kieran, Oct 2026: "the documents need to be formatted exactly as
// required"), checked against the PDFs on NYC Health's provider forms page:
//   Individual Session Note (Home/Facility) 6/13/2025, Version 1 (two notes
//     per page, landscape: batches) and Version 2 (one per page: a single note)
//   Group Session Note 7/29/2024, Version 2 (one per page)
//   Service Log 11/2024 (landscape, 9 rows a page)
//   Provider Progress Note 9/2024 (header repeated on every page)
//   Multidisciplinary Evaluation (MDE) Summary Form 8/2024 (evaluations)
// Same wording, order, checkboxes (every option printed, the chosen ones
// crossed), Times (Helvetica for the progress note, as NYC's), the NYC
// Health logo and the versioned footers. The filled-in values are underlined.
//
// buildEiPdf(sections) composes any number of documents (the record pack),
// each with its own page orientation, header and footer: pdfmake can't tell a
// header which document a page belongs to, so the PDF is laid out twice; the
// first pass records where each document starts.

export const FORM_VERSIONS = {
  noteV1: 'NYC Early Intervention Program Individual Session (Home/Facility) Note 6/13/2025 Version 1 – Two Notes Per Page',
  noteV2: 'NYC Early Intervention Program Individual Session Note (Home/Facility) 6/13/2025 Version 2 – One Note Per Page',
  groupV2: 'NYC Early Intervention Program Group Session Note 7/29/2024 Version 2 – One Note Per Page',
  log: 'NYC Early Intervention Program Service Log 11/2024',
  progress: 'NYC Early Intervention Program Progress Note 9/2024',
  mde: 'NYC EIP Multidisciplinary Evaluation (MDE) Summary Form 8/2024',
};
export const SERVICE_TYPE = { ST: 'Speech Therapy', OT: 'Occupational Therapy', PT: 'Physical Therapy', SI: 'Special Instruction' };
const LOCATION = { home: 'Home', community: 'Community (child care)', facility: 'Facility' };
const METHODS = [
  ['observed', 'Observed parent/caregiver and child during routines'],
  ['tried_feedback', 'Parent/caregiver tried activity; feedback exchanged'],
  ['demonstrated', 'Demonstrated activity to parent/caregiver'],
  ['communication_tool', 'Reviewed communication tool with parent/caregiver'],
];
const GROUP_METHODS = [
  ['observed', 'Observed parent/caregiver & child'],
  ['tried_feedback', 'Parent/caregiver tried activity & feedback exchanged'],
  ['demonstrated', 'Demonstrated activity to parent/caregiver'],
  ['communication_tool', 'Reviewed communication tool'],
];

// ---------- small pieces ----------
let fontsReady = null;
// pdfmake with the standard Times and Helvetica fonts NYC's forms use.
export async function loadEiPdfMake() {
  const pdfMake = await loadPdfMake();
  if (!fontsReady) {
    fontsReady = Promise.all([import('pdfmake/build/standard-fonts/Times'), import('pdfmake/build/standard-fonts/Helvetica')]).then(mods => {
      for (const m of mods) pdfMake.addFontContainer(m.default || m);
    });
  }
  await fontsReady;
  return pdfMake;
}
// Times and Helvetica only cover Latin-1 (+ smart quotes): a name in another
// script prints in Roboto instead of turning into gaps.
const LATIN = /^[\x20-\xFF–—‘’“”•…\n\r\t]*$/;
const v = (s) => {
  const t = s === null || s === undefined || s === '' ? ' ' : String(s);
  return LATIN.test(t) ? { text: t } : { text: t, font: 'Roboto' };
};
export const mdy = (s) => (s ? `${String(s).slice(5, 7)}/${String(s).slice(8, 10)}/${String(s).slice(0, 4)}` : '');
const dayOf = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) : null);
// '15:30' -> { t: '3:30', pm: true }
function clock(t) {
  if (!t) return { t: '', pm: null };
  const [h, m] = String(t).split(':').map(Number);
  return { t: `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}`, pm: h >= 12 };
}
const box = (on, size = 8) => ({
  svg: `<svg width="${size}" height="${size}" viewBox="0 0 8 8"><rect x="0.4" y="0.4" width="7.2" height="7.2" fill="#fff" stroke="#000" stroke-width="0.7"/>${on ? '<path d="M1.6 1.6 L6.4 6.4 M6.4 1.6 L1.6 6.4" stroke="#000" stroke-width="1"/>' : ''}</svg>`,
  width: size,
});
// A checkbox and its label, inline with other pieces of a line.
const chk = (on, label, opts = {}) => ({ columns: [{ ...box(on), margin: [0, 1.5, 0, 0] }, { text: label, width: 'auto', ...opts }], columnGap: 2, width: 'auto' });
// One line of pieces: strings / { label, value } / checkbox columns.
function line(parts, opts = {}) {
  return {
    columns: parts.filter(Boolean).map(p => {
      if (p.columns || p.svg || p.image) return { width: 'auto', ...p };
      if (p.label !== undefined) {
        return { width: p.width || 'auto', text: [{ text: `${p.label} `, bold: p.bold !== false }, { ...v(p.value), decoration: p.value ? 'underline' : undefined }, ...(p.after ? [{ text: p.after }] : [])] };
      }
      return { width: 'auto', text: p };
    }),
    columnGap: opts.gap ?? 10,
    margin: opts.margin || [0, 1, 0, 1],
  };
}
const label = (l, value) => ({ label: l, value });
const timeField = (lbl, t) => {
  const c = clock(t);
  return { columns: [{ text: [{ text: `${lbl} `, bold: false }, { ...v(c.t), decoration: c.t ? 'underline' : undefined }], width: 'auto' }, chk(c.pm === false, 'AM'), chk(c.pm === true, 'PM')], columnGap: 3, width: 'auto' };
};
// Unsigned: a drawn line (typed underscores wrapped in narrow cells).
const sigImage = (img, w = 120, h = 30) => (img ? { image: img, width: w, height: h } : { canvas: [{ type: 'line', x1: 0, y1: h - 4, x2: w, y2: h - 4, lineWidth: 0.6 }] });
// `compact` (Version 1, two notes a landscape page) draws smaller signatures
// so a pair of long notes still fits on one page.
const signatureLine = (title, img, date, extra, compact = false) => ({
  stack: [
    { columns: [{ text: title, bold: true, width: 'auto', margin: [0, compact ? 6 : 10, 4, 0] }, { ...sigImage(img, 120, compact ? 20 : 30), width: compact ? 100 : 130 }, { text: [{ text: 'Date: ', bold: true }, { ...v(mdy(date)), decoration: date ? 'underline' : undefined }], width: 'auto', margin: [10, compact ? 6 : 10, 0, 0] }], columnGap: 4 },
    ...(extra ? [extra] : []),
  ],
});
const logoHeader = (title, opts = {}) => ({
  columns: [
    { image: NYC_HEALTH_LOGO, width: opts.logoWidth || 52 },
    { text: title, bold: true, fontSize: opts.fontSize || 11, alignment: 'center', margin: [0, opts.titleTop ?? 14, 52, 0] },
  ],
  margin: [0, 0, 0, 4],
});
const cellBox = (stack, extra = {}) => ({ stack, margin: [3, 2, 3, 2], ...extra });
const answer = (t, fontSize = 10) => ({ ...v(t), margin: [0, 3, 0, 0], fontSize });
const tableLayout = { hLineWidth: () => 0.75, vLineWidth: () => 0.75, paddingLeft: () => 2, paddingRight: () => 2, paddingTop: () => 1, paddingBottom: () => 1 };

function codesOf(h) {
  const cpt = [...(h.cpt_codes || [])];
  // The HCPCS box is one field: list each code once (billing repeats it per unit).
  return { cpt: [0, 1, 2, 3].map(i => cpt[i] || ''), hcpcs: [...new Set(h.hcpcs_codes || [])].join(', ') };
}
function participantsOf(note) {
  const p = note.participants || [];
  return { child: p.includes('child'), parent: p.includes('parent'), other: p.includes('other'), otherText: note.participants_other || '' };
}

// ---------- the individual session note ----------
// The cells of one note (rows 3+ of the form), shared by Versions 1 and 2.
function noteCells({ note, h, session }, { compact = false } = {}) {
  const n = note || {};
  const hh = h || {};
  const codes = codesOf(hh);
  const part = participantsOf(n);
  const outcomes = (hh.outcomes || session?.outcomes || []).filter(o => !hh.outcomes ? (n.outcome_ids || []).includes(o.id) : true);
  const q1 = [...outcomes.map(o => `Outcome ${o.number}: ${o.outcome}`), n.outcomes_text].filter(Boolean).join('\n');
  const methods = n.parent_methods || [];
  const fs = compact ? 8.5 : 9.5;
  return [
    cellBox([
      line([label('Session Date:', mdy(n.session_date)), label('IFSP Service Location:', LOCATION[n.location] || '')], { gap: 8 }),
      { columns: [timeField('Time: From', n.start_time), timeField('To', n.end_time)], columnGap: 10 },
      { columns: [{ text: [{ text: 'Intensity: ' }, { ...v(n.location ? (n.location === 'facility' ? 'Individual - Facility' : 'Home/Community') : ''), decoration: n.location ? 'underline' : undefined }], width: 'auto' }, { text: 'Session delivered:', width: 'auto' }, chk(n.delivery === 'in_person', 'In-person'), chk(n.delivery === 'telehealth', 'Telehealth')], columnGap: 6 },
    ], { fontSize: fs }),
    cellBox([
      line([label('Date Note Written:', mdy(dayOf(n.provider_signed_at) || '')), label('ICD-10 code:', hh.icd10 || '')], { gap: 8 }),
      line([label('HCPCS Code (if applicable):', codes.hcpcs), label('1st CPT Code:', codes.cpt[0])], { gap: 8 }),
      line([label('2nd CPT Code:', codes.cpt[1]), label('3rd CPT Code:', codes.cpt[2]), label('4th CPT Code:', codes.cpt[3])], { gap: 8 }),
    ], { fontSize: fs }),
    cellBox([
      { columns: [chk(!!n.cancelled, 'Session cancelled - reason listed in #1. Session must be made up by:'), { ...v(mdy(n.makeup_by)), decoration: n.makeup_by ? 'underline' : undefined, width: 'auto' }], columnGap: 4 },
      { columns: [chk(!!n.makeup_for_date, 'This is a make-up for a missed session on'), { ...v(mdy(n.makeup_for_date)), decoration: n.makeup_for_date ? 'underline' : undefined, width: 'auto' }, { text: '. (must be within 2 weeks)', width: 'auto' }], columnGap: 3 },
      { columns: [{ text: 'Session Participants:', width: 'auto' }, chk(part.child, 'child'), chk(part.parent, 'parent/caregiver'), chk(part.other, 'Other:'), { ...v(part.otherText), decoration: part.otherText ? 'underline' : undefined, width: 'auto' }], columnGap: 4 },
    ], { fontSize: fs }),
    cellBox([{ text: [{ text: '1. ', bold: true }, 'IFSP Outcome(s) and developmental step(s) addressed during this session:'] }, answer(q1, compact ? 9 : 10)], { fontSize: fs }),
    cellBox([
      { text: [{ text: '2. ', bold: true }, 'Describe what happened during today’s session and the progress made toward the IFSP outcome(s). Include the ', { text: 'routine activity', decoration: 'underline' }, ' and the ', { text: 'strategies', decoration: 'underline' }, ' used in the session. When available, include parent/caregiver feedback on how they incorporated the strategies between sessions.'] },
      answer(n.cancelled ? '' : n.narrative, compact ? 9 : 10),
    ], { fontSize: fs }),
    cellBox([
      { columns: [{ text: [{ text: '3. ', bold: true }, 'How did you work with the parent/caregiver?'], width: 'auto' }, chk(methods.includes(METHODS[0][0]), METHODS[0][1])], columnGap: 4 },
      { columns: [chk(methods.includes(METHODS[1][0]), METHODS[1][1]), chk(methods.includes(METHODS[2][0]), METHODS[2][1])], columnGap: 8 },
      { columns: [chk(methods.includes(METHODS[3][0]), METHODS[3][1])], columnGap: 8 },
      { columns: [chk(methods.includes('other'), 'Other:'), { ...v(n.parent_methods_other || ''), width: '*' }], columnGap: 4 },
    ], { fontSize: fs }),
    cellBox([{ text: [{ text: '4. ', bold: true }, 'What strategies/activities did you and the parent/caregiver collaboratively agree to do to support their child’s learning and development between visits?'] }, answer(n.cancelled ? '' : n.strategies, compact ? 9 : 10)], { fontSize: fs }),
  ];
}
function signatureCells(n, hh, { titles = false, fs = 9.5, compact = false } = {}) {
  return [
    cellBox([signatureLine('Parent/Caregiver Signature:', n.parent_note_signature, dayOf(n.parent_signed_at), null, compact), line([label('Relationship to child:', n.parent_relationship || '')])], { fontSize: fs }),
    cellBox([signatureLine('Interventionist Signature:', n.provider_signature, dayOf(n.provider_signed_at), null, compact), line([label('License/Certification #:', n.provider_license || ''), titles && label('Title:', hh.title || hh.credentials || '')], { gap: 30 })], { fontSize: fs }),
    cellBox([signatureLine(titles ? 'Supervising Clinician Signature (if applicable):' : 'Supervising Clinician (if applicable):', n.supervisor_signature, dayOf(n.supervisor_signed_at), null, compact), line([label('License/Certification #:', n.supervisor_license || ''), titles && label('Title:', n.supervisor_title || (n.supervisor_name ? n.supervisor_name : ''))], { gap: 30 })], { fontSize: fs }),
  ];
}
const sexBoxes = (sex) => [{ text: 'Sex at birth:', bold: true, width: 'auto' }, chk(sex === 'M', 'Male'), chk(sex === 'F', 'Female')];
const addendaBlock = (addenda) => (addenda?.length ? [
  { text: 'Addenda (signed and dated corrections and additions)', bold: true, fontSize: 9.5, margin: [0, 8, 0, 2] },
  ...addenda.map(a => ({ text: [{ text: `${new Date(a.signed_at).toLocaleString('en-US', { timeZone: 'America/New_York' })} · ${a.signed_name || a.signed_by}: `, bold: true }, v(a.body)], fontSize: 9, margin: [0, 1, 0, 0] })),
] : []);

// Version 2: one note per page (portrait). `data` = GET /session-notes/note.
// Its rows 3-5 group the fields a little differently from Version 1.
export function sessionNoteV2Section(data) {
  const { note, session, addenda } = data;
  if (note?.group_type) return groupNoteV2Section(data);
  const hh = note?.header || session.header;
  const n = note || {};
  const codes = codesOf(hh);
  const part = participantsOf(n);
  const [, , , q1, q2, q3, q4] = noteCells({ note, h: hh, session });
  const bl = (l, value) => ({ text: [{ text: `${l} `, bold: true }, { ...v(value), decoration: value ? 'underline' : undefined }], width: 'auto' });
  const body = [
    [cellBox([{ columns: [bl('Child’s Name:', hh.child_name), bl('DOB:', mdy(hh.date_of_birth)), { columns: sexBoxes(hh.sex), columnGap: 4, width: 'auto' }], columnGap: 14 }, line([label('EI #:', hh.ei_number)])])],
    [cellBox([line([label('Interventionist’s Name:', hh.interventionist), label('Credentials:', hh.credentials)], { gap: 12 }), line([label('National Provider ID #:', hh.npi), label('Service Type:', SERVICE_TYPE[hh.service] || hh.service)], { gap: 12 })])],
    [cellBox([
      line([label('Session Date:', mdy(n.session_date)), label('IFSP Service Location:', LOCATION[n.location] || '')], { gap: 10 }),
      { columns: [bl('Date Note Written:', mdy(dayOf(n.provider_signed_at))), { text: 'Session Time:', bold: true, width: 'auto' }, timeField('From', n.start_time), timeField('To', n.end_time)], columnGap: 8 },
      { columns: [bl('Intensity:', n.location ? (n.location === 'facility' ? 'Individual - Facility' : 'Home/Community') : ''), { text: 'Session delivered:', bold: true, width: 'auto' }, chk(n.delivery === 'in_person', 'In-person', { bold: true }), chk(n.delivery === 'telehealth', 'Telehealth', { bold: true })], columnGap: 8 },
    ])],
    [cellBox([line([label('ICD-10 code:', hh.icd10 || ''), label('HCPCS Code (if applicable):', codes.hcpcs)], { gap: 10 }), line([label('1st CPT Code:', codes.cpt[0]), label('2nd CPT Code:', codes.cpt[1]), label('3rd CPT Code:', codes.cpt[2]), label('4th CPT Code:', codes.cpt[3])], { gap: 10 })])],
    [cellBox([
      { columns: [chk(!!n.cancelled, 'Session cancelled – List reason in #1. Session must be made up by:'), { ...v(mdy(n.makeup_by)), decoration: n.makeup_by ? 'underline' : undefined, width: 'auto' }], columnGap: 4 },
      { columns: [chk(!!n.makeup_for_date, 'This is a make-up for a missed session on'), { ...v(mdy(n.makeup_for_date)), decoration: n.makeup_for_date ? 'underline' : undefined, width: 'auto' }, { text: '. (must be within 2 weeks)', width: 'auto' }], columnGap: 3 },
      { columns: [{ text: 'Session participants (Check all that apply):', bold: true, width: 'auto' }, chk(part.child, 'Child'), chk(part.parent, 'Parent/caregiver'), chk(part.other, 'Other(s)specify:'), { ...v(part.otherText), decoration: part.otherText ? 'underline' : undefined, width: 'auto' }], columnGap: 4 },
    ])],
    [q1], [q2], [q3], [q4],
    ...signatureCells(n, hh, { titles: true }).map(c => [c]),
  ];
  const heights = (i) => ({ 5: 60, 6: 140, 8: 70 }[i] || 'auto');
  return {
    footer: FORM_VERSIONS.noteV2,
    content: [
      logoHeader('NYC Early Intervention Program Individual Session Note (Home/Facility) - Version 2'),
      { table: { widths: ['*'], heights, body }, layout: tableLayout, fontSize: 9.5 },
      { text: 'Parent/caregiver must sign both the Session Note and the Service Log after each service session. All session notes and service logs must be maintained for billing and audit purposes.', bold: true, fontSize: 9.5, margin: [0, 3, 0, 0] },
      ...addendaBlock(addenda),
    ],
  };
}

// Version 1: two notes per page (landscape), for printing many. Notes are
// paired by child and interventionist (the top two rows are shared).
export function sessionNotesV1Sections(list) {
  const groups = new Map();
  for (const d of list) {
    const hh = d.note?.header || d.session.header;
    const k = `${hh.child_name}|${hh.interventionist}|${hh.service}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(d);
  }
  const sections = [];
  for (const items of groups.values()) {
    for (let i = 0; i < items.length; i += 2) {
      const [a, b] = [items[i], items[i + 1] || null];
      const hh = a.note?.header || a.session.header;
      const left = [...noteCells({ note: a.note, h: hh, session: a.session }, { compact: true }), ...signatureCells(a.note, hh, { fs: 8.5, compact: true })];
      const right = b ? [...noteCells({ note: b.note, h: b.note?.header || b.session.header, session: b.session }, { compact: true }), ...signatureCells(b.note, b.note?.header || b.session.header, { fs: 8.5, compact: true })]
        : [...noteCells({ note: {}, h: {}, session: null }, { compact: true }), ...signatureCells({}, {}, { fs: 8.5, compact: true })];
      const body = [
        [{ ...cellBox([{ columns: [{ text: [{ text: 'Child’s Name: ', bold: true }, { ...v(hh.child_name), decoration: 'underline' }], width: 'auto' }, { text: [{ text: 'DOB: ', bold: true }, { ...v(mdy(hh.date_of_birth)), decoration: 'underline' }], width: 'auto' }, { columns: [{ text: 'Sex:', bold: true, width: 'auto' }, chk(hh.sex === 'M', 'Male', { bold: true }), chk(hh.sex === 'F', 'Female', { bold: true })], columnGap: 4, width: 'auto' }, { text: [{ text: 'EI #: ', bold: true }, { ...v(hh.ei_number), decoration: 'underline' }], width: 'auto' }], columnGap: 16 }]), colSpan: 2, fontSize: 9.5 }, {}],
        [{ ...cellBox([line([label('Interventionist’s Name:', hh.interventionist), label('Credentials:', hh.credentials), label('National Provider ID #:', hh.npi), label('Service Type:', SERVICE_TYPE[hh.service] || hh.service)], { gap: 14 })]), colSpan: 2, fontSize: 9.5 }, {}],
        ...left.map((c, j) => [c, right[j]]),
      ];
      sections.push({
        orientation: 'landscape',
        footer: FORM_VERSIONS.noteV1,
        content: [
          { columns: [{ image: NYC_HEALTH_LOGO, width: 40 }, { text: 'NYC Early Intervention Program Individual Session Note (Home/Facility) - Version 1', bold: true, fontSize: 10.5, alignment: 'center', margin: [0, 8, 40, 0] }], margin: [0, 0, 0, 2] },
          { table: { widths: ['*', '*'], heights: (i) => ({ 5: 40, 6: 84, 8: 42 }[i] || 'auto'), body }, layout: { ...tableLayout, vLineWidth: (i) => (i === 1 ? 1.5 : 0.75) } },
          ...addendaBlock([...(a.addenda || []), ...(b?.addenda || [])]),
        ],
      });
    }
  }
  return sections;
}

// ---------- the group session note (Version 2) ----------
export function groupNoteV2Section(data) {
  const { note: n = {}, session, addenda } = data;
  const hh = n.header || session.header;
  const codes = codesOf(hh);
  const part = participantsOf(n);
  const methods = n.parent_methods || [];
  const parentGroup = n.group_type === 'parent_child' || n.group_type === 'family_support';
  const outcomes = hh.outcomes || (session?.outcomes || []).filter(o => (n.outcome_ids || []).includes(o.id));
  const q1 = [...outcomes.map(o => `Outcome ${o.number}: ${o.outcome}`), n.outcomes_text].filter(Boolean).join('\n');
  const c = (stack, extra) => [cellBox(stack, extra)];
  const body = [
    c([line([label('Child’s Name:', hh.child_name), label('DOB:', mdy(hh.date_of_birth))], { gap: 12 }), { columns: sexBoxes(hh.sex), columnGap: 4 }, line([label('EI #:', hh.ei_number)])]),
    c([
      line([label('Interventionist’s Name:', hh.interventionist), label('Credentials:', hh.credentials)], { gap: 12 }),
      line([label('National Provider ID#:', hh.npi)]),
      { columns: [{ text: 'Service Type:', bold: true, width: 'auto' }, chk(n.group_type === 'group', 'Group EI Service'), chk(n.group_type === 'parent_child', 'Parent-Child Group'), chk(n.group_type === 'family_support', 'Family Support Group')], columnGap: 6 },
    ]),
    c([
      { columns: [{ text: [{ text: 'Session Date: ', bold: true }, { ...v(mdy(n.session_date)), decoration: 'underline' }], width: 'auto' }, { text: 'IFSP Service Location:', bold: true, width: 'auto' }, chk(n.group_location === 'center', 'Center-based Program'), chk(n.group_location === 'other', 'Other EI approved site'), { ...v(n.group_location_other || ''), decoration: n.group_location_other ? 'underline' : undefined, width: 'auto' }], columnGap: 6 },
      line([label('Address of Service Location:', n.group_address || n.group_site || '')]),
      { columns: [{ text: [{ text: 'Date Note Written: ', bold: true }, { ...v(mdy(dayOf(n.provider_signed_at))), decoration: 'underline' }], width: 'auto' }, { text: 'Session Time:', bold: true, width: 'auto' }, timeField('From', n.start_time), timeField('To', n.end_time)], columnGap: 8 },
      { columns: [{ text: [{ text: 'Intensity: ', bold: true }, 'Group'], width: 'auto' }, { text: 'Duration (Check one)', bold: true, width: 'auto' }, { ...chk(n.group_duration === 60, '60 min'), width: 50 }, { ...chk(n.group_duration === 90, '90 min'), width: 50 }, { ...chk(n.group_duration === 120, '120 min'), width: 50 }, { text: [{ text: 'Number of children present during session: ', bold: true }, { ...v(n.group_children ? String(n.group_children) : ''), decoration: 'underline' }], width: '*' }], columnGap: 6 },
    ]),
    c([line([label('ICD-10 code:', hh.icd10 || '', { bold: false }), label('HCPCS Code (if applicable):', codes.hcpcs)], { gap: 10 }), line([label('1st CPT Code:', codes.cpt[0]), label('2nd CPT Code:', codes.cpt[1]), label('3rd CPT Code:', codes.cpt[2]), label('4th CPT Code:', codes.cpt[3])], { gap: 10 })]),
    c([
      { columns: [chk(!!n.cancelled, 'Session cancelled – List reason in #1. Session must be made up by:'), { ...v(mdy(n.makeup_by)), decoration: n.makeup_by ? 'underline' : undefined, width: 'auto' }], columnGap: 4 },
      { columns: [chk(!!n.makeup_for_date, 'This is a make-up for a missed session on'), { ...v(mdy(n.makeup_for_date)), width: 'auto' }, { text: '. (must be within 2 weeks)', width: 'auto' }], columnGap: 3 },
      { columns: [{ text: 'Session participants (Check all that apply):', bold: true, width: 'auto' }, chk(part.child, 'Child'), chk(part.parent, 'Parent/caregiver'), chk(part.other, 'Other(s):'), { ...v(part.otherText), width: 'auto' }], columnGap: 4 },
      { columns: [chk(!!n.aide_name, '1-to-1 Aide (print name):'), { ...v(n.aide_name || ''), decoration: n.aide_name ? 'underline' : undefined, width: 'auto' }], columnGap: 4 },
    ]),
    c([{ text: [{ text: '1. ', bold: true }, 'IFSP Outcome(s) and developmental step(s) addressed during this session:'] }, answer(q1)]),
    c([{ text: [{ text: '2. ', bold: true }, 'Describe what happened during today’s session and the progress made toward the IFSP outcome(s). Include the routine activity covered in this session and the strategies used. When available include the parent/caregiver feedback based on your regular communication about the child’s progress between sessions.'] }, answer(n.narrative)]),
    c([
      { text: [{ text: '3. ' }, { text: 'Parent-Child Groups and Family Support Groups', bold: true }, ': How did you work with the parent/caregiver? Check all that apply:'] },
      ...(parentGroup ? [
        { columns: [chk(methods.includes('observed'), GROUP_METHODS[0][1]), chk(methods.includes('tried_feedback'), GROUP_METHODS[1][1]), chk(methods.includes('demonstrated'), GROUP_METHODS[2][1])], columnGap: 6 },
        { columns: [chk(methods.includes('communication_tool'), GROUP_METHODS[3][1]), chk(methods.includes('other'), 'Other:'), { ...v(n.parent_methods_other || ''), width: '*' }], columnGap: 6 },
      ] : [answer('N/A')]),
    ]),
    c([{ text: [{ text: '4. ', bold: true }, 'If a 1-to-1 aide is authorized, describe how the aide worked with the child to support progress toward the IFSP outcome(s). Include how the aide promoted the child’s positive behaviors, attention, responsiveness, socialization and/or generalization.'] }, answer(n.aide_name ? n.aide_notes : 'N/A')]),
    ...signatureCells(n, hh, { titles: true }).map(x => [x]),
  ];
  const heights = (i) => ({ 5: 60, 6: 110, 7: 40, 8: 60 }[i] || 'auto');
  return {
    footer: FORM_VERSIONS.groupV2,
    content: [
      logoHeader('NYC Early Intervention Program Group Session Note - Version 2'),
      { table: { widths: ['*'], heights, body }, layout: tableLayout, fontSize: 9.5 },
      { text: 'Parent/caregiver must sign both the Session Note and the Service Log after each service session. All session notes and service logs must be maintained for billing and audit purposes.', bold: true, fontSize: 9.5, margin: [0, 3, 0, 0] },
      ...addendaBlock(addenda),
    ],
  };
}

// ---------- the service log (landscape, 9 rows a page) ----------
// `log` = GET /session-notes/service-log (rows are signed notes).
export function serviceLogSections(log, child) {
  const rows = log.rows || [];
  const h = child || rows[0]?.header || {};
  const pages = [];
  for (let i = 0; i < Math.max(rows.length, 1); i += 9) pages.push(rows.slice(i, i + 9));
  const disc = h.credentials || '';
  return pages.map(page => {
    const body = [
      ['Date of Service', 'Start Time', 'End Time', { text: ['In-person (I)\n', { text: 'OR', fontSize: 7 }, '\nTelehealth (T)'] }, 'CPT Code', 'Signature of Parent/Caregiver Verifying that the Service was Delivered on the Date and Time Indicated', 'Date Signed by Parent/Caregiver']
        .map(t => ({ ...(typeof t === 'string' ? { text: t } : t), bold: true, alignment: 'center', fontSize: 9.5 })),
    ];
    for (let j = 0; j < 9; j++) {
      const r = page[j];
      const st = clock(r?.start_time);
      const en = clock(r?.end_time);
      const codes = r ? [...new Set([...(r.header?.cpt_codes || []), ...(r.header?.hcpcs_codes || [])])].join(', ') : '';
      const tcell = (c) => ({ columns: [{ text: c.t, width: '*', alignment: 'right', fontSize: 9, margin: [0, 4, 2, 0] }, { stack: [chk(c.pm === false, 'AM', { fontSize: 6.5, bold: true }), chk(c.pm === true, 'PM', { fontSize: 6.5, bold: true })], width: 'auto' }], columnGap: 2 });
      body.push([
        { text: r ? mdy(String(r.session_date).slice(0, 10)) : '', fontSize: 9, margin: [0, 5, 0, 0] },
        tcell(st), tcell(en),
        { text: r ? (r.delivery === 'telehealth' ? 'T' : 'I') : '', alignment: 'center', fontSize: 9, margin: [0, 5, 0, 0] },
        { text: codes, fontSize: 8.5, margin: [0, 5, 0, 0] },
        r?.parent_log_signature ? { stack: [{ image: r.parent_log_signature, width: 140, height: 18 }, { ...v(`${r.parent_name || ''}${r.parent_relationship ? ` (${r.parent_relationship})` : ''}`), fontSize: 6.5 }] } : { text: '' },
        { text: r ? mdy(dayOf(r.parent_signed_at)) : '', fontSize: 9, margin: [0, 5, 0, 0], alignment: 'center' },
      ]);
    }
    return {
      orientation: 'landscape',
      footer: FORM_VERSIONS.log,
      content: [
        { columns: [{ image: NYC_HEALTH_LOGO, width: 46 }, { text: 'NEW YORK CITY EARLY INTERVENTION PROGRAM SERVICE LOG', bold: true, fontSize: 12, alignment: 'center', margin: [0, 16, 46, 0] }] },
        { text: [{ text: 'Instructions: ', bold: true }, 'A ', { text: 'service log', decoration: 'underline' }, ' signed by the parent or caregiver which documents that the service was received by the child on the date and time recorded must be completed after each session. (10 NYCRR 69-4.26(c)). All fields are required. Each field must be completed and must match the appropriate fields on accompanying session notes. Typed signatures are not acceptable. Session notes and service logs must be maintained by interventionists and collected by service provider agencies to support billing. Session notes and service logs must be furnished for program monitoring, fiscal audits, and due process proceedings. Refer to the ', { text: 'New York City Policy and Procedure Manual Policy 6-K', bold: true }], fontSize: 9.5, margin: [0, 4, 0, 6] },
        {
          table: { widths: ['40%', '25%', '35%'], body: [
            [{ text: [{ text: 'Child’s Name: ', bold: true }, v(h.child_name)] }, { text: [{ text: 'Date of Birth: ', bold: true }, v(mdy(h.date_of_birth))] }, { text: [{ text: 'Child’s EI#: ', bold: true }, v(h.ei_number)] }],
            [{ text: [{ text: 'Service Type: ', bold: true }, v(SERVICE_TYPE[h.service] || h.service)], colSpan: 3 }, {}, {}],
            [{ text: [{ text: 'Interventionist Name: ', bold: true }, v(h.interventionist)] }, { text: [{ text: 'Discipline: ', bold: true }, v(disc)] }, { text: [{ text: 'NPI #: ', bold: true }, v(h.npi)] }],
            [{ text: [{ text: 'Provider Agency Name: ', bold: true }, v(log.agency_name || CLINIC.name)], colSpan: 3 }, {}, {}],
          ] },
          layout: { ...tableLayout, paddingTop: () => 5, paddingBottom: () => 5 }, fontSize: 9.5, margin: [0, 0, 0, 8],
        },
        { table: { headerRows: 1, widths: [62, 66, 66, 62, 62, '*', 74], heights: (i) => (i === 0 ? 'auto' : 30), body }, layout: tableLayout },
      ],
    };
  });
}

// ---------- the provider progress note (9/2024) ----------
export function progressNoteSection({ report, header, addenda }) {
  const d = report.details || {};
  const h = report.header || header;
  const type = report.report_type;
  const typeBoxes = (bold = true) => ({ columns: [{ text: 'Provider Progress Note (', bold, width: 'auto' }, chk(type === '6', '6', { bold }), chk(type === '12', '12', { bold }), chk(type === 'amendment', 'Amendment)', { bold })], columnGap: 3, width: 'auto' });
  const yesNo = (val) => [chk(val === true, 'Yes'), chk(val === false, 'No')];
  const comm = d.comm_methods || [];
  const F = { fontSize: 9 };
  const ul = (t) => ({ ...v(t), decoration: t ? 'underline' : undefined });
  const demo = [
    { columns: [{ text: [{ text: 'Child\'s Name: ', bold: true }, ul(h.child_name)], width: '*' }, { text: [{ text: 'EI #: ', bold: true }, ul(h.ei_number)], width: 'auto' }, { text: [{ text: 'DOB: ', bold: true }, ul(mdy(h.date_of_birth))], width: 'auto' }], columnGap: 12 },
    { columns: [{ text: [{ text: 'IFSP Period: From: ', bold: true }, ul(mdy(report.ifsp_start)), { text: ' To: ', bold: true }, ul(mdy(report.ifsp_end))], width: 'auto' }, { text: [{ text: 'Provider Agency Name: ', bold: true }, ul(d.agency_name || CLINIC.name)], width: '*' }], columnGap: 12 },
    { columns: [{ text: [{ text: 'Provider Agency ID #: ', bold: true }, ul(d.agency_id)], width: 'auto' }, { text: [{ text: 'Print Name of Interventionist: ', bold: true }, ul(h.interventionist)], width: '*' }], columnGap: 12 },
    { columns: [{ text: [{ text: 'Discipline: ', bold: true }, ul(h.credentials)], width: 'auto' }, { text: [{ text: 'Service Type: ', bold: true }, ul(SERVICE_TYPE[report.service] || report.service)], width: 'auto' }, { text: [{ text: 'Interventionist’s Phone Number: ', bold: true }, ul(d.interventionist_phone)], width: '*' }], columnGap: 12 },
    { columns: [{ text: [{ text: 'Service Coordinator Name: ', bold: true }, ul(d.sc_name)], width: '*' }, { text: [{ text: 'EIOD Name: ', bold: true }, ul(d.eiod_name)], width: '*' }], columnGap: 12 },
    { text: [{ text: 'Indicate the language(s) used during the sessions: ', bold: true }, ul(d.languages)] },
    { columns: [{ text: [{ text: 'Date reviewed note with parent: ', bold: true }, ul(mdy(report.parent_reviewed_on))], width: 'auto', margin: [0, 8, 0, 0] }, { text: 'Parent’s Signature:', bold: true, width: 'auto', margin: [0, 8, 0, 0] }, sigImage(report.parent_signature, 110, 26)], columnGap: 8 },
  ];
  const services = [
    { columns: [{ text: [{ text: 'Authorized Frequency? ', bold: true }, ul(d.authorized_frequency)], width: '*' }, { text: [{ text: 'Date you started working with this child: ', bold: true }, ul(mdy(d.start_date))], width: 'auto' }], columnGap: 12 },
    { columns: [{ text: 'How were services delivered?', bold: true, width: 'auto' }, chk(d.delivery === 'in_person', 'In-person', { bold: true }), chk(d.delivery === 'telehealth', 'Telehealth', { bold: true }), chk(d.delivery === 'hybrid', 'Hybrid: Number of sessions delivered:', { bold: true }), { text: [{ text: 'In-person ', bold: true }, ul(String(d.sessions_in_person ?? '')), { text: ' Telehealth ', bold: true }, ul(String(d.sessions_telehealth ?? ''))], width: 'auto' }], columnGap: 4 },
    { text: [{ text: 'Where have services been delivered? ', bold: true }, ul(d.locations)] },
    { columns: [{ text: 'Has a parent/caregiver participated during the sessions?', bold: true, width: 'auto' }, ...yesNo(d.parent_participated)], columnGap: 6 },
    { text: 'What communication method(s) was selected by the parent to exchange information with the interventionist about the sessions?', bold: true },
    { columns: [chk(comm.includes('communication_book'), 'Communication Book', { bold: true }), chk(comm.includes('family_activity_sheet'), 'Family Activity Sheet', { bold: true }), chk(comm.includes('emails'), 'Emails', { bold: true }), chk(comm.includes('phone_calls'), 'Phone calls', { bold: true }), chk(comm.includes('session_notes'), 'Session Notes shared', { bold: true })], columnGap: 8 },
    { text: [{ text: 'Other: ', bold: true }, ul(comm.includes('other') ? d.comm_other : '')] },
    { text: [{ text: 'How frequently is communication shared: ', bold: true }, ul(d.comm_frequency)] },
    { text: 'If there have been any gaps in service delivery of more than three consecutive scheduled visits, describe the length and the reason(s).', bold: true },
    answer(d.gaps || 'None.'),
    { text: [{ text: 'List the child’s medical diagnosis(es) (if any): ', bold: true }, v(d.diagnoses || 'None.')], margin: [0, 4, 0, 0] },
    { columns: [{ text: 'Is the child using assistive technologies?', bold: true, width: 'auto' }, ...yesNo(!!d.at_using), { text: 'Is a new AT Device being requested?', bold: true, width: 'auto', margin: [20, 0, 0, 0] }, ...yesNo(!!d.at_requested)], columnGap: 6 },
    { text: 'If yes, identify the type of device, and the IFSP Outcome and specify how the device is helping (or will help) to achieve the Outcome:', bold: true },
    answer(d.at_details || ''),
  ];
  const content = [
    { text: [
      'Complete progress reports and review with the parent. Submit the completed report to the service coordinator ', { text: 'no less than 2 weeks prior to the 6-month or Annual review. The 6-month and 12-month progress notes are mandatory. Submission of the amendment progress note is required as part of the justification whenever an amendment to a current IFSP is being requested.', bold: true },
      ' All questions must be answered. Illegible handwritten reports will be returned. Use additional pages if needed. Typed reports are preferred. Parents should receive copies of session and progress notes. Progress notes must be maintained for routine NYC audit purposes.',
    ], fontSize: 8.5, margin: [0, 0, 0, 4] },
    { table: { widths: ['*'], body: [[{ stack: demo, ...F, margin: [3, 2, 3, 2] }], [{ stack: services, ...F, margin: [3, 2, 3, 2] }]] }, layout: tableLayout },
    { text: 'I. List all the IFSP outcomes and developmental steps that you worked on. Indicate the progress for each and if each outcome and step should be kept or removed for the next IFSP period:', bold: true, fontSize: 9.5, margin: [0, 8, 0, 4] },
  ];
  for (const o of report.outcomes || []) {
    const rate = (r, labels) => labels.map(([key, l]) => ({ stack: [{ text: l, fontSize: 7.5, alignment: 'center' }, { ...box(r === key, 10), alignment: 'center', margin: [0, 1, 0, 0] }], width: 46 }));
    content.push({
      columns: [
        { text: [{ text: `Outcome ${o.number}: `, bold: true }, v(o.text)], width: '*', fontSize: 9 },
        { stack: [{ text: 'Rate Progress in This Time Period', bold: true, fontSize: 8, alignment: 'center' }, { columns: rate(o.rating, [['none', 'No Progress'], ['emerging', 'Emerging Skills'], ['achieved', 'Outcome Achieved']]), columnGap: 2 }], width: 144 },
        { stack: [{ text: 'Keep or Remove?', bold: true, fontSize: 8, alignment: 'center' }, { columns: rate(o.keep, [['keep', 'Keep Outcome'], ['remove', 'Remove Outcome']]), columnGap: 2 }], width: 96 },
      ],
      columnGap: 8, margin: [0, 6, 0, 3], unbreakable: true,
    });
    const steps = o.steps?.length ? o.steps : [];
    const sb = [[{ text: '' }, { text: 'Rate each developmental step', bold: true, colSpan: 3, alignment: 'center', fontSize: 8 }, {}, {}, { text: 'Keep Y/N', bold: true, alignment: 'center', fontSize: 8 }]];
    for (const s of steps) {
      const cell = (key, l) => ({ stack: [{ text: l, fontSize: 7.5, alignment: 'center' }, { ...box(s.rating === key, 10), alignment: 'center' }] });
      sb.push([
        { text: [{ text: `${s.label}. ` }, { text: 'Developmental Step', bold: true }, ': ', v(s.text)], fontSize: 8.5 },
        cell('none', 'No\nProgress'), cell('emerging', 'Emerging\nSkills'), cell('achieved', 'Step\nAchieved'),
        { columns: [{ text: 'Y', width: 'auto', fontSize: 8 }, { ...box(s.keep === 'yes', 9) }, { text: 'N', width: 'auto', fontSize: 8 }, { ...box(s.keep === 'no', 9) }], columnGap: 2, margin: [4, 6, 0, 0] },
      ]);
    }
    if (steps.length) content.push({ table: { widths: ['*', 46, 46, 46, 50], body: sb }, layout: tableLayout });
    content.push({ columns: [{ text: 'Was this outcome and related developmental steps identified at the IFSP meeting? Yes', bold: true, width: 'auto' }, box(o.at_ifsp !== false), { text: 'No', bold: true, width: 'auto' }, box(o.at_ifsp === false)], columnGap: 4, fontSize: 8.5, margin: [0, 3, 0, 0] });
    content.push({ text: [{ text: 'If not, the date it was changed and the reason. ', bold: true }, { text: '(e.g., scope of practice or expertise).', fontSize: 7.5 }, ' ', v(o.at_ifsp === false ? o.change_note : '')], fontSize: 8.5, margin: [0, 1, 0, 4] });
  }
  const QS = [
    ['q2', '2. List the IFSP outcomes that you did not address in this service authorization period and explain why.'],
    ['q3', '3. Describe the learning activities (technique/strategies/methods/routine activities) that were successful for the child/family and specify the IFSP outcomes and developmental steps (by number/letter) related to these activities.'],
    ['q4', '4. What changes were made to the learning activities (coaching techniques/strategies/methods/routine activities) when they were ineffective for the family/caregiver? Were these modifications successful? If not, why not? Please address each IFSP outcome as applicable.'],
    ['q5', '5. Describe all collaborative efforts made to address the IFSP outcomes (e.g., interaction with other service provider(s), members of the EI team, child care staff, community resources, and/or medical providers (with written parent consent)). Please include the family members/caregivers you have been working with.'],
    ['q6', '6. Based on your on-going assessment of the child, what is the overall progress in this child’s functional abilities since the last IFSP meeting or Progress Report? How was progress determined (e.g. standardized instrument, checklist, non-standardized assessments, observation & informed clinical opinion)?'],
    ['q7', '7. What skills will you be working on in the next 6 months?'],
  ];
  for (const [k, q] of QS) content.push({ text: q, bold: true, fontSize: 9.5, margin: [0, 8, 0, 2] }, answer((report.answers || {})[k]));
  content.push({ text: '8. Are new or modified IFSP outcomes or developmental steps recommended for the next 6-month IFSP period? The IFSP outcomes must include all components and be written in parent-friendly language. Outcomes must reflect the parents’ current concerns, priorities, routine activities, and resources. All proposed new/modified outcomes and/or developmental steps must be discussed with and agreed to by the parent(s) before submission to NYCEIP. See the Appendix for Outcomes and Developmental Steps.', bold: true, fontSize: 9.5, margin: [0, 10, 0, 4] });
  const proposed = report.proposed?.length ? report.proposed : [null];
  for (const p of proposed) {
    const mn = (kind) => ({ columns: [box(kind === 'modified'), { text: 'Modified', bold: true, width: 'auto' }, box(kind === 'new'), { text: 'New', bold: true, width: 'auto' }], columnGap: 3, fontSize: 9 });
    const pb = [[{ text: 'IFSP Outcome and Developmental Steps', bold: true, alignment: 'center' }, { text: 'Check if\nNew or Modified', bold: true, alignment: 'center' }]];
    pb.push([{ text: [{ text: `IFSP Outcome ${p?.number || '____'}: `, bold: true }, v(p ? p.text : 'None proposed.')], margin: [0, 2, 0, 8] }, mn(p?.kind)]);
    const steps = p?.steps?.length ? p.steps : [null, null, null, null];
    for (const s of steps) pb.push([{ text: [{ text: `Developmental Step ${s?.label || '___'}: `, bold: true }, v(s?.text || '')], margin: [0, 2, 0, 8] }, mn(s?.kind)]);
    content.push({ table: { widths: ['*', 110], body: pb }, layout: tableLayout, fontSize: 9, margin: [0, 0, 0, 6] });
  }
  content.push({
    table: { widths: ['*'], body: [[{ stack: [
      { text: 'I certify that I have received and reviewed a copy of the child\'s IFSP and evaluation/progress notes prior to starting services, have provided services in accordance with the IFSP service’s specified frequency and authorized session length, and have worked towards addressing the relevant IFSP outcomes. I further certify that my responses in this report are an accurate representation of the child\'s current level of functioning.', fontSize: 9 },
      { columns: [{ text: 'Signature/credentials of therapist completing report:', bold: true, width: 'auto', margin: [0, 10, 0, 0] }, sigImage(report.provider_signature, 110, 26), { text: v(h.credentials).text, width: 'auto', margin: [0, 10, 0, 0] }], columnGap: 6 },
      { columns: [{ text: [{ text: 'Print Name: ', bold: true }, ul(h.interventionist)], width: '*' }, { text: [{ text: 'License number: ', bold: true }, ul(report.provider_license)], width: 'auto' }], columnGap: 12, margin: [0, 4, 0, 0] },
      { text: [{ text: 'Date Report Was Completed: ', bold: true }, ul(mdy(dayOf(report.provider_signed_at)))], margin: [0, 4, 0, 0] },
      ...(report.supervisor_name ? [
        { columns: [{ text: 'Supervisor signature/credentials:', bold: true, width: 'auto', margin: [0, 10, 0, 0] }, sigImage(report.supervisor_signature, 110, 26)], columnGap: 6 },
        { columns: [{ text: [{ text: 'Print Name: ', bold: true }, ul(report.supervisor_name)], width: '*' }, { text: [{ text: 'License number: ', bold: true }, ul(report.supervisor_license)], width: 'auto' }, { text: [{ text: 'Date: ', bold: true }, ul(mdy(dayOf(report.supervisor_signed_at)))], width: 'auto' }], columnGap: 12, margin: [0, 4, 0, 0] },
      ] : []),
    ], margin: [4, 3, 4, 4], fontSize: 9.5 }]] },
    layout: tableLayout, unbreakable: true, margin: [0, 6, 0, 0],
  });
  content.push(...addendaBlock(addenda));
  return {
    font: 'Helvetica',
    footer: FORM_VERSIONS.progress,
    // NYC repeats the child, EI# and note type on every page.
    header: (pageInSection) => (pageInSection === 1
      ? { columns: [{ image: NYC_HEALTH_LOGO, width: 40 }, { text: 'EARLY INTERVENTION PROGRAM', bold: true, fontSize: 10.5, margin: [6, 10, 0, 0], width: '*' }, { columns: [typeBoxes(), { text: 'Page 1', bold: true, width: 'auto' }], columnGap: 4, width: 'auto', margin: [0, 10, 0, 0] }], fontSize: 10 }
      : { columns: [{ text: [{ text: 'Child’s Name: ', bold: true }, ul(h.child_name)], width: 'auto' }, { text: [{ text: 'EI#: ', bold: true }, ul(h.ei_number)], width: '*' }, { columns: [typeBoxes(), { text: `Page ${pageInSection}`, bold: true, width: 'auto' }], columnGap: 4, width: 265 }], columnGap: 14, fontSize: 9.5, margin: [0, 8, 0, 0] }),
    content,
  };
}

// ---------- evaluation report (MDE Summary Form, 8/2024) ----------
export const EVAL_TYPE_LABEL = { initial_mde: 'Initial multidisciplinary evaluation (MDE)', supplemental: 'Supplemental evaluation', other: 'Other evaluation' };
export const ELIGIBILITY_LABEL = {
  delay: 'Eligible for the EIP: developmental delay',
  condition: 'Eligible for the EIP: diagnosed condition with a high probability of resulting in developmental delay',
  not_eligible: 'Not eligible for the EIP',
  na: 'Not applicable (supplemental evaluation)',
};
export const TELEHEALTH_REASON_LABEL = {
  family_request: 'Parent/family request for telehealth evaluation',
  medical_condition: 'Child has a complex medical condition, and the family does not want evaluators in their home',
  language: 'Family speaks a language for which an in-person bilingual evaluator or interpreter is not readily available',
  no_evaluators: 'Appropriate evaluators are not available in the region where the evaluation is to be conducted',
};
const DOMAINS = ['physical', 'cognitive', 'communication', 'social_emotional', 'adaptive'];
export function evalReportSection({ eval: e, header, report, addenda, domain_labels: domainLabels }) {
  const h = report.header || header;
  const d = report.details || {};
  const mde = d.eval_type === 'initial_mde';
  const sec = (num, title, body) => [{ text: `${num}. ${title}`, bold: true, fontSize: 10, margin: [0, 8, 0, 2] }, ...(Array.isArray(body) ? body : [body])];
  const p = (t) => ({ ...v(t || '—'), fontSize: 10 });
  const delivery = { in_person: 'In person', telehealth: 'Telehealth', hybrid: 'Hybrid (in person and telehealth)' }[d.delivery] || '';
  const content = [
    { columns: [{ image: NYC_HEALTH_LOGO, width: 56 }, { text: mde ? 'New York City Early Intervention Program\nMultidisciplinary Evaluation (MDE) Summary Form' : `New York City Early Intervention Program\n${d.eval_type === 'other' ? `${d.eval_type_other || 'Evaluation'} Report` : 'Supplemental Evaluation Report'}`, bold: true, fontSize: 12, alignment: 'center', margin: [0, 12, 56, 0] }] },
    { columns: [{ text: [{ text: 'Child’s Name: ' }, { ...v(h.child_name), decoration: 'underline' }], width: '*' }, { text: [{ text: 'EI#: ' }, { ...v(h.ei_number), decoration: 'underline' }], width: 'auto' }, { text: [{ text: 'Date of Birth: ' }, { ...v(mdy(h.date_of_birth)), decoration: 'underline' }], width: 'auto' }], columnGap: 12, margin: [0, 10, 0, 2], fontSize: 10.5 },
    { columns: [{ text: [{ text: 'Date of evaluation: ' }, { ...v(mdy(report.eval_date || e?.date)), decoration: 'underline' }], width: 'auto' }, { text: [{ text: 'Age at evaluation: ' }, { ...v(h.age_months !== undefined && h.age_months !== null ? `${h.age_months} months` : ''), decoration: 'underline' }], width: 'auto' }, { text: [{ text: 'Discipline: ' }, { ...v(SERVICE_TYPE[report.service] || report.service), decoration: 'underline' }], width: 'auto' }], columnGap: 16, fontSize: 10.5 },
  ];
  if (mde) {
    content.push(
      { text: 'SIGNATURE OF PERSON COMPLETING SUMMARY:', fontSize: 10.5, margin: [0, 10, 0, 4] },
      { text: 'I certify that the determination of eligibility and summary of the Multidisciplinary Evaluation are based upon an interview with the above-named child’s parent/surrogate parent (or other guardian if there is no available parent), a general assessment of the child’s level of functioning in each of the five developmental domains, and an in-depth assessment of the specific domain(s) in which there is a suspected delay. To the best of my knowledge, age-appropriate instruments and procedures and informed clinical opinion were employed in such assessments.', fontSize: 10 },
      { text: 'I further certify that the findings of the MDE team were fully reviewed, integrated and reconciled in the MDE summary written by a member of this MDE team.', fontSize: 10, margin: [0, 4, 0, 0] },
    );
  }
  content.push(
    { columns: [{ text: 'Signature', width: 'auto', margin: [0, 12, 4, 0] }, sigImage(report.provider_signature, 130, 30), { text: [{ text: 'Date ' }, { ...v(mdy(dayOf(report.provider_signed_at))), decoration: 'underline' }], width: 'auto', margin: [10, 12, 0, 0] }], columnGap: 4, margin: [0, 6, 0, 0] },
    { text: [{ text: 'Print name, title and license number: ', italics: true }, v(`${h.evaluator || ''}${h.credentials ? `, ${h.credentials}` : ''}${report.provider_license ? ` · ${report.provider_license}` : ''}`)], fontSize: 10, margin: [0, 2, 0, 0] },
  );
  const instruments = report.instruments?.length
    ? { table: { headerRows: 1, widths: ['*', '*', '*', '*'], body: [['Instrument', 'Area', 'Score(s)', 'Explanation'].map(t => ({ text: t, bold: true, fontSize: 9 })), ...report.instruments.map(x => [x.name, x.area, x.score, x.notes].map(t => ({ ...v(t || ''), fontSize: 9 })))] }, layout: tableLayout }
    : p('None used.');
  const summary = [
    { text: 'Summary of Evaluation', bold: true, decoration: 'underline', alignment: 'center', fontSize: 11, margin: [0, 12, 0, 2] },
    ...sec('I', 'Name, title and disciplines of the persons performing the evaluation', (d.evaluators || []).map(x => p(`${x.name}, ${x.title}${x.qualifications ? ` (${x.qualifications})` : ''}`))),
    ...sec('II', 'The child’s health assessment', [p(d.health_assessment), ...(d.records_reviewed ? [{ text: [{ text: 'Records reviewed: ', bold: true }, v(d.records_reviewed)], fontSize: 10, margin: [0, 2, 0, 0] }] : [])]),
    ...sec('III', 'Summary of Parent Interview and optional Family-directed Assessment', [p(d.parent_interview), ...(d.referral_reason ? [{ text: [{ text: 'Reason for referral: ', bold: true }, v(d.referral_reason)], fontSize: 10, margin: [0, 2, 0, 0] }] : []), ...(d.history ? [{ text: [{ text: 'History: ', bold: true }, v(d.history)], fontSize: 10, margin: [0, 2, 0, 0] }] : []), ...(d.family_assessment ? [{ text: [{ text: 'Family-directed assessment: ', bold: true }, v(d.family_assessment)], fontSize: 10, margin: [0, 2, 0, 0] }] : [])]),
    ...sec('IV', 'Description of the assessment process and conditions', [
      { text: [{ text: 'Location: ', bold: true }, v(`${delivery}${d.location ? `, ${d.location}` : ''}${d.present ? `. Present: ${d.present}` : ''}${d.language ? `. Language(s): ${d.language}` : ''}`)], fontSize: 10 },
      ...(d.delivery === 'telehealth' || d.delivery === 'hybrid' ? [{ text: [{ text: 'Telehealth justification: ', bold: true }, v(TELEHEALTH_REASON_LABEL[d.telehealth_reason] || '')], fontSize: 10 }] : []),
      p(d.process), ...(d.conditions ? [p(d.conditions)] : []),
      ...(d.cultural_linguistic ? [{ text: [{ text: 'Cultural and linguistic responsiveness: ', bold: true }, v(d.cultural_linguistic)], fontSize: 10 }] : []),
    ]),
    ...sec('V', 'Measures and/or scores that were used, if any, and an explanation of these', instruments),
    ...sec('VI', 'The child’s responses and the family’s belief about whether the responses were optimal and representative of the child’s functioning during daily routines', [p(d.child_response), p(`The family ${d.typical === false ? 'did not feel' : 'felt'} the responses were optimal and representative.${d.typical_note ? ` ${d.typical_note}` : ''}`)]),
    ...sec('VII', 'How informed clinical opinion was used by the evaluation team in assessing the child’s developmental status and potential eligibility for the EIP', p(d.clinical_opinion)),
    ...sec('VIII', 'The child’s developmental status in the five developmental domains, including the unique strengths and needs in each area', DOMAINS.flatMap(k => {
      const x = (report.domains || {})[k] || {};
      return [{ text: (domainLabels || {})[k] || k, bold: true, fontSize: 9.5, margin: [0, 3, 0, 0] }, p(x.status), ...(x.strengths ? [{ text: [{ text: 'Strengths: ', bold: true }, v(x.strengths)], fontSize: 9.5 }] : []), ...(x.needs ? [{ text: [{ text: 'Needs: ', bold: true }, v(x.needs)], fontSize: 9.5 }] : [])];
    })),
    ...sec('IX', 'A clear statement of whether the child is eligible on delay, eligible on diagnosed condition, or not eligible, with the appropriate ICD-10 code', [p(`${ELIGIBILITY_LABEL[d.eligibility] || ''}${d.icd10 ? ` (ICD-10 ${d.icd10})` : ''}`), ...(d.eligibility_detail ? [p(d.eligibility_detail)] : [])]),
    ...sec('X', 'Nature of child and family’s transportation needs', p(d.transportation || (mde ? '' : 'Not applicable.'))),
    { text: 'Recommendations (types of services)', bold: true, fontSize: 10, margin: [0, 8, 0, 2] }, p(d.recommendations),
    { text: 'Summary', bold: true, fontSize: 10, margin: [0, 8, 0, 2] }, p(d.summary),
  ];
  content.push({ table: { widths: ['*'], body: [[{ stack: summary, margin: [6, 2, 6, 8] }]] }, layout: tableLayout, margin: [0, 10, 0, 0] });
  if (mde) content.push({ text: 'If a bilingual evaluation is conducted, this summary should also be provided in the parent’s dominant or preferred language or other mode of communication of the parent, if feasible.', fontSize: 9, margin: [0, 4, 0, 0] });
  if (report.supervisor_name) {
    content.push({ columns: [{ text: 'Supervisor signature', width: 'auto', margin: [0, 12, 4, 0] }, sigImage(report.supervisor_signature, 130, 30), { text: [{ text: 'Date ' }, v(mdy(dayOf(report.supervisor_signed_at)))], width: 'auto', margin: [10, 12, 0, 0] }], columnGap: 4, margin: [0, 8, 0, 0] });
    content.push({ text: v(`${report.supervisor_name}${report.supervisor_title ? `, ${report.supervisor_title}` : ''}${report.supervisor_license ? ` · ${report.supervisor_license}` : ''}`).text, fontSize: 10 });
  }
  content.push(...addendaBlock(addenda));
  return { footer: mde ? FORM_VERSIONS.mde : `${CLINIC.name} · Evaluation report`, content };
}

// ---------- composing ----------
// A deep copy that keeps functions (table layouts and heights) as they are.
const copy = (x) => (Array.isArray(x) ? x.map(copy) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, val]) => [k, copy(val)])) : x);
// sections: [{ content, orientation?, footer?, header?(pageInSection), font? }]
export async function buildEiPdf(sections, { title } = {}) {
  const pdfMake = await loadEiPdfMake();
  const make = (starts) => {
    const content = [];
    sections.forEach((s, i) => {
      content.push({
        // A fresh copy each pass: pdfmake rewrites image nodes in place.
        stack: [{ text: ' ', id: `ei-section-${i}`, fontSize: 1, lineHeight: 0.1 }, ...copy(s.content)],
        ...(i ? { pageBreak: 'before' } : {}),
        pageOrientation: s.orientation || 'portrait',
        font: s.font || 'Times',
      });
    });
    const sectionOf = (page) => {
      let idx = 0;
      sections.forEach((_, i) => { if ((starts[i] || Infinity) <= page) idx = i; });
      return idx;
    };
    const found = {};
    return {
      found,
      dd: {
        pageSize: 'LETTER',
        pageOrientation: sections[0]?.orientation || 'portrait',
        pageMargins: [32, 46, 32, 34],
        info: { title: title || 'Early Intervention record', author: CLINIC.name },
        defaultStyle: { font: 'Times', fontSize: 10, lineHeight: 1.1 },
        content,
        pageBreakBefore: (node) => { if (node.id && node.id.startsWith('ei-section-')) found[Number(node.id.slice(11))] = node.startPosition.pageNumber; return false; },
        header: (page) => {
          const i = sectionOf(page);
          const s = sections[i];
          if (!s?.header) return null;
          return { ...s.header(page - (starts[i] || 1) + 1), margin: [32, 12, 32, 0], font: s.font || 'Times' };
        },
        footer: (page) => {
          const s = sections[sectionOf(page)];
          return s?.footer ? { text: s.footer, fontSize: 8, margin: [32, 12, 32, 0], font: s.font || 'Times' } : null;
        },
      },
    };
  };
  // Pass 1 finds the page each document starts on; pass 2 prints with the
  // right header and footer on each page.
  const first = make({ 0: 1 });
  await pdfMake.createPdf(first.dd).getBuffer();
  const second = make(first.found);
  return pdfMake.createPdf(second.dd).getBlob();
}
