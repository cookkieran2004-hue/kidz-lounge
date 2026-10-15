import { loadPdfMake } from './manualPdf';
import { CLINIC } from './brand';
import { fmtDate, SERVICE_LABEL, addendaContent } from './sessionNotePdf';

// EI evaluation reports (the "ei" feature, PedsDesk; src/EvalReports.jsx) as
// a PDF with the parts NYS DOH requires of an EI evaluation report, for the
// office to send to the EIOD / service coordinator and give the family.

export const EVAL_TYPE_LABEL = { initial_mde: 'Initial multidisciplinary evaluation (MDE)', supplemental: 'Supplemental evaluation', other: 'Other' };
export const ELIGIBILITY_LABEL = {
  delay: 'Eligible: developmental delay',
  condition: 'Eligible: diagnosed condition with a high probability of delay',
  not_eligible: 'Not eligible',
  na: 'Not applicable (supplemental evaluation)',
};
export const DOMAIN_ORDER = ['physical', 'cognitive', 'communication', 'social_emotional', 'adaptive'];

const label = (text) => ({ text, fontSize: 8, color: '#52525B', margin: [0, 0, 0, 1] });
const cell = (l, v) => ({ stack: [label(l), { text: v || '—', fontSize: 10 }], margin: [3, 3, 3, 3] });
const dayOf = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA') : null);
const heading = (t) => ({ text: t, bold: true, fontSize: 10.5, margin: [0, 10, 0, 3] });
const para = (t) => ({ text: t || '—', fontSize: 10 });

export function evalReportContent({ eval: e, header, report, addenda, domain_labels: domainLabels }) {
  const h = report.header || header;
  const d = report.details || {};
  const content = [
    { columns: [
      { text: 'Early Intervention Program\nEvaluation Report', bold: true, fontSize: 13 },
      { text: CLINIC.name, alignment: 'right', fontSize: 10, color: '#52525B' },
    ], margin: [0, 0, 0, 8] },
    { table: { widths: ['*', '*', '*', '*'], body: [
      [cell("Child's name", h.child_name), cell('DOB', fmtDate(h.date_of_birth)), cell('Age at evaluation', h.age_months !== null && h.age_months !== undefined ? `${h.age_months} months` : ''), cell('EI #', h.ei_number)],
      [cell('Evaluation date', fmtDate(report.eval_date || e.date)), cell('Type', d.eval_type === 'other' ? `Other: ${d.eval_type_other || ''}` : EVAL_TYPE_LABEL[d.eval_type]), cell('Discipline', SERVICE_LABEL[report.service] || report.service), cell('Location', d.location)],
      [cell('Language(s) used', d.language), cell('Present', d.present), cell('NPI', h.npi), cell('Parent', h.parent_name)],
    ] }, layout: 'lightHorizontalLines' },
    heading('Evaluator(s)'),
    ...((d.evaluators || []).map(x => para(`${x.name}, ${x.title}. ${x.qualifications || ''}`))),
  ];
  if (d.referral_reason) content.push(heading('Reason for referral'), para(d.referral_reason));
  if (d.history) content.push(heading('Relevant history'), para(d.history));
  content.push(heading('Assessment process'), para(d.process));
  content.push(heading("The child's responses"), para(d.child_response));
  content.push(para(`The family ${d.typical === false ? 'did not feel' : 'felt'} these responses were typical of the child.${d.typical_note ? ` ${d.typical_note}` : ''}`));
  content.push(heading('Instruments and scores'));
  content.push((report.instruments || []).length
    ? { table: { widths: ['*', '*', '*', '*'], headerRows: 1, body: [
      ['Instrument', 'Area', 'Score(s)', 'Notes'].map(t => ({ text: t, bold: true, fontSize: 8.5 })),
      ...report.instruments.map(x => [x.name, x.area, x.score, x.notes].map(t => ({ text: t || '', fontSize: 9.5 }))),
    ] }, layout: 'lightHorizontalLines' }
    : para('None listed.'));
  content.push(heading("The child's status in each developmental area"));
  for (const k of DOMAIN_ORDER) {
    const v = (report.domains || {})[k] || {};
    content.push({ text: (domainLabels || {})[k] || k, bold: true, fontSize: 9.5, margin: [0, 5, 0, 1] });
    content.push(para(v.status));
    if (v.strengths) content.push({ text: [{ text: 'Strengths: ', bold: true }, v.strengths], fontSize: 9.5 });
    if (v.needs) content.push({ text: [{ text: 'Needs: ', bold: true }, v.needs], fontSize: 9.5 });
  }
  content.push(heading('Informed clinical opinion'), para(d.clinical_opinion));
  content.push(heading('Eligibility'), para(`${ELIGIBILITY_LABEL[d.eligibility] || '—'}${d.icd10 ? ` (ICD-10 ${d.icd10})` : ''}`));
  if (d.eligibility_detail) content.push(para(d.eligibility_detail));
  content.push(heading('Recommendations'), para(d.recommendations));
  content.push(heading('Summary'), para(d.summary));
  const sig = (title, image, lines) => ({ columns: [
    { width: 150, stack: [label(title), image ? { image, width: 140, height: 46 } : { text: '—', fontSize: 10 }] },
    { stack: lines.filter(Boolean).map(l => ({ text: l, fontSize: 9.5 })), margin: [8, 10, 0, 0] },
  ], margin: [0, 8, 0, 0] });
  content.push(sig('Evaluator signature', report.provider_signature, [`${h.evaluator}${h.credentials ? `, ${h.credentials}` : ''}`, report.provider_license ? `License #: ${report.provider_license}` : '', report.provider_signed_at ? `Date: ${fmtDate(dayOf(report.provider_signed_at))}` : 'Not signed yet']));
  if (report.supervisor_name) content.push(sig('Supervisor signature', report.supervisor_signature, [report.supervisor_name, report.supervisor_license ? `License #: ${report.supervisor_license}` : '', report.supervisor_signed_at ? `Date: ${fmtDate(dayOf(report.supervisor_signed_at))}` : 'Not co-signed yet']));
  content.push(...addendaContent(addenda));
  return content;
}

export async function buildEvalReportPdf(data) {
  const pdfMake = await loadPdfMake();
  return pdfMake.createPdf({ content: evalReportContent(data), pageMargins: [36, 36, 36, 36], defaultStyle: { fontSize: 10 } }).getBlob();
}
