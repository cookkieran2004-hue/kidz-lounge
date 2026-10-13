import { INK } from './uiTokens';
import { loadPdfMake } from './manualPdf';

// Helpers for Power Forms (PowerFormFields.jsx, PowerFormPage.jsx,
// PowerFormsChartTab.jsx): the fields' input look, an answer as text, and
// the PDF copy of a completed form that's saved to the patient's Documents.

export const pfInputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 6, border: '1px solid #D4D4D8',
  fontSize: 15, fontFamily: 'inherit', color: INK, background: 'white',
};

// An answer as text, for staff and the PDF.
export function answerText(field, value) {
  if (value === undefined || value === null || value === '') return null;
  if (field.type === 'yesno') return value === 'yes' ? 'Yes' : 'No';
  if (field.type === 'checkboxes') return value.join(', ');
  if (field.type === 'date') return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (field.type === 'signature') return value.name ? `Signed by ${value.name}` : 'Signed';
  return String(value);
}

const when = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');

// A completed form as a PDF Blob: the questions and answers, signatures as
// drawn, and when / by whom it was sent and completed.
export async function buildPowerFormPdf(form, patientName) {
  const pdfMake = await loadPdfMake();
  const content = [
    { text: form.form_name, fontSize: 16, bold: true, margin: [0, 0, 0, 4] },
    { text: `Patient: ${patientName}`, fontSize: 10, color: '#52525B' },
    { text: `Sent ${when(form.created_at)}${form.recipient ? ` to ${form.recipient}` : ''} · Completed ${when(form.completed_at)}`, fontSize: 10, color: '#52525B', margin: [0, 0, 0, 14] },
  ];
  if (form.intro) content.push({ text: form.intro, fontSize: 10, margin: [0, 0, 0, 12] });
  for (const f of form.fields) {
    if (f.type === 'heading') { content.push({ text: f.label, bold: true, fontSize: 12, margin: [0, 10, 0, 4] }); continue; }
    const v = form.answers[f.id];
    content.push({ text: f.label, fontSize: 9, color: '#71717A', margin: [0, 6, 0, 1] });
    if (f.type === 'signature' && v && v.image) {
      content.push({ image: v.image, width: 200, margin: [0, 2, 0, 2] });
      content.push({ text: `${v.name}${v.signed_at ? ` · ${when(v.signed_at)}` : ''}`, fontSize: 9, color: '#52525B' });
    } else {
      content.push({ text: answerText(f, v) || '—', fontSize: 11 });
    }
  }
  // pdfmake 0.3: getBlob() returns a promise (as in manualPdf.js).
  return pdfMake.createPdf({ content, pageMargins: [48, 48, 48, 48] }).getBlob();
}
