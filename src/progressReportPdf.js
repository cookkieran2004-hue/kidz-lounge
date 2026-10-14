import { loadPdfMake } from './manualPdf';
import { CLINIC } from './brand';
import { fmtDate, SERVICE_LABEL } from './sessionNotePdf';

// EI progress reports (the "ei" feature, PedsDesk; src/ProgressReports.jsx)
// as a PDF laid out like the NYC Provider Progress Note (9/2024), for the
// office to send to the service coordinator and give the family.

export const RATING_LABEL = { none: 'No progress', emerging: 'Emerging skills', achieved: 'Achieved' };
export const COMM_LABEL = {
  communication_book: 'Communication book', family_activity_sheet: 'Family activity sheet', emails: 'Emails (with written consent)',
  phone_calls: 'Phone calls', session_notes: 'Session notes shared', other: 'Other',
};
export const DELIVERY_LABEL = { in_person: 'In-person', telehealth: 'Telehealth', hybrid: 'Hybrid' };
export const TYPE_LABEL = { 6: '6-month', 12: '12-month', amendment: 'Amendment' };
export const QUESTIONS = {
  q2: '2. List the IFSP outcomes that you did not address in this service authorization period and explain why.',
  q3: '3. Describe the learning activities (techniques/strategies/methods/routine activities) that were successful for the child/family and specify the IFSP outcomes and developmental steps (by number/letter) related to these activities.',
  q4: '4. What changes were made to the learning activities when they were ineffective for the family/caregiver? Were these modifications successful? If not, why not? Address each IFSP outcome as applicable.',
  q5: '5. Describe all collaborative efforts made to address the IFSP outcomes (other providers, EI team, child care staff, community resources, medical providers with written parent consent). Include the family members/caregivers you have been working with.',
  q6: "6. Based on your ongoing assessment, what is the overall progress in this child's functional abilities since the last IFSP meeting or progress report? How was progress determined?",
  q7: '7. What skills will you be working on in the next 6 months?',
};
const CERTIFY = "I certify that I have received and reviewed a copy of the child's IFSP and evaluation/progress notes prior to starting services, have provided services in accordance with the IFSP service's specified frequency and authorized session length, and have worked towards addressing the relevant IFSP outcomes. I further certify that my responses in this report are an accurate representation of the child's current level of functioning.";

const label = (text) => ({ text, fontSize: 8, color: '#52525B', margin: [0, 0, 0, 1] });
const cell = (l, v) => ({ stack: [label(l), { text: v || '—', fontSize: 10 }], margin: [3, 3, 3, 3] });
const dayOf = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA') : null);
const yes = (v) => (v === true ? 'Yes' : v === false ? 'No' : '—');

export async function buildProgressReportPdf({ report, header, addenda }) {
  const pdfMake = await loadPdfMake();
  const d = report.details || {};
  const h = report.header || header;
  const content = [
    { columns: [
      { text: `Early Intervention Program\nProvider Progress Note (${TYPE_LABEL[report.report_type]})`, bold: true, fontSize: 13 },
      { text: d.agency_name || CLINIC.name, alignment: 'right', fontSize: 10, color: '#52525B' },
    ], margin: [0, 0, 0, 8] },
    { table: { widths: ['*', '*', '*', '*'], body: [
      [cell("Child's name", h.child_name), cell('EI #', h.ei_number), cell('DOB', fmtDate(h.date_of_birth)), cell('IFSP period', `${fmtDate(report.ifsp_start)} to ${fmtDate(report.ifsp_end)}`)],
      [cell('Provider agency', d.agency_name), cell('Agency ID #', d.agency_id), cell('Interventionist', h.interventionist), cell('Discipline', h.credentials)],
      [cell('Service type', SERVICE_LABEL[report.service] || report.service), cell("Interventionist's phone", d.interventionist_phone), cell('Service coordinator', d.sc_name), cell('EIOD', d.eiod_name)],
      [cell('Language(s) used', d.languages), cell('Authorized frequency', d.authorized_frequency), cell('Started working with child', fmtDate(d.start_date)), cell('Date reviewed with parent', fmtDate(report.parent_reviewed_on))],
      [cell('Services delivered', `${DELIVERY_LABEL[d.delivery] || ''} (in-person ${d.sessions_in_person || 0}, telehealth ${d.sessions_telehealth || 0})`), cell('Where', d.locations), cell('Parent took part', yes(d.parent_participated)), cell('Diagnoses', d.diagnoses)],
    ] }, layout: 'lightHorizontalLines' },
    { text: [{ text: 'Communication with the family: ', bold: true }, [...(d.comm_methods || []).filter(x => x !== 'other').map(x => COMM_LABEL[x]), ...((d.comm_methods || []).includes('other') ? [`Other: ${d.comm_other}`] : [])].join(', '), `. How often: ${d.comm_frequency || '—'}`], fontSize: 9.5, margin: [0, 6, 0, 0] },
    { text: [{ text: 'Gaps of more than three consecutive scheduled visits: ', bold: true }, d.gaps || 'None'], fontSize: 9.5, margin: [0, 3, 0, 0] },
    { text: [{ text: 'Assistive technology: ', bold: true }, `using: ${d.at_using ? 'Yes' : 'No'}; new device requested: ${d.at_requested ? 'Yes' : 'No'}${d.at_details ? `. ${d.at_details}` : ''}`], fontSize: 9.5, margin: [0, 3, 0, 0] },
    { text: '1. IFSP outcomes and developmental steps worked on', bold: true, fontSize: 10.5, margin: [0, 10, 0, 4] },
  ];
  for (const o of report.outcomes || []) {
    const body = [[
      { text: `Outcome ${o.number}: ${o.text}`, bold: true, fontSize: 9.5 },
      { text: RATING_LABEL[o.rating] || '', fontSize: 9 },
      { text: o.keep === 'keep' ? 'Keep outcome' : o.keep === 'remove' ? 'Remove outcome' : '', fontSize: 9 },
    ]];
    for (const s of o.steps || []) body.push([{ text: `${s.label}. ${s.text}`, fontSize: 9 }, { text: RATING_LABEL[s.rating] || '', fontSize: 9 }, { text: s.keep === 'yes' ? 'Keep: Y' : s.keep === 'no' ? 'Keep: N' : '', fontSize: 9 }]);
    content.push({ table: { widths: ['*', 80, 80], body }, layout: 'lightHorizontalLines', margin: [0, 0, 0, 2] });
    content.push({ text: o.at_ifsp === false ? `Not identified at the IFSP meeting: ${o.change_note}` : 'Identified at the IFSP meeting: Yes', fontSize: 8.5, color: '#52525B', margin: [0, 0, 0, 6] });
  }
  for (const [k, q] of Object.entries(QUESTIONS)) {
    content.push({ text: q, bold: true, fontSize: 9.5, margin: [0, 8, 0, 2] });
    content.push({ text: (report.answers || {})[k] || '', fontSize: 10 });
  }
  content.push({ text: '8. New or modified IFSP outcomes or developmental steps recommended for the next IFSP period', bold: true, fontSize: 9.5, margin: [0, 8, 0, 2] });
  if (!(report.proposed || []).length) content.push({ text: 'None proposed.', fontSize: 10 });
  for (const p of report.proposed || []) {
    content.push({ text: `IFSP outcome ${p.number || ''} (${p.kind === 'modified' ? 'Modified' : 'New'}): ${p.text}`, fontSize: 10, margin: [0, 2, 0, 0] });
    for (const s of p.steps || []) content.push({ text: `Developmental step ${s.label || ''} (${s.kind === 'modified' ? 'Modified' : 'New'}): ${s.text}`, fontSize: 9.5, margin: [10, 1, 0, 0] });
  }
  content.push({ text: CERTIFY, fontSize: 8.5, margin: [0, 12, 0, 6] });
  const sig = (title, image, lines) => ({ columns: [
    { width: 150, stack: [label(title), image ? { image, width: 140, height: 46 } : { text: '—', fontSize: 10 }] },
    { stack: lines.filter(Boolean).map(l => ({ text: l, fontSize: 9.5 })), margin: [8, 10, 0, 0] },
  ], margin: [0, 4, 0, 0] });
  content.push(sig('Signature/credentials of therapist', report.provider_signature, [`${h.interventionist}${h.credentials ? `, ${h.credentials}` : ''}`, `License number: ${report.provider_license || ''}`, `Date report was completed: ${fmtDate(dayOf(report.provider_signed_at))}`]));
  content.push(sig("Parent's signature", report.parent_signature, [report.parent_name ? `${report.parent_name} · ${report.parent_relationship}` : 'Not signed', report.parent_reviewed_on ? `Reviewed with the parent on ${fmtDate(report.parent_reviewed_on)}` : '']));
  if (addenda.length) {
    content.push({ text: 'Addenda', bold: true, fontSize: 10.5, margin: [0, 12, 0, 2] });
    for (const a of addenda) content.push({ text: [{ text: `${new Date(a.signed_at).toLocaleString('en-US')} · ${a.signed_name || a.signed_by}: `, bold: true }, a.body], fontSize: 9.5, margin: [0, 2, 0, 0] });
  }
  return pdfMake.createPdf({ content, pageMargins: [36, 36, 36, 36], defaultStyle: { fontSize: 10 } }).getBlob();
}
