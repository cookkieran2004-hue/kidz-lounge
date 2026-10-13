import { INK } from './uiTokens';
import { loadPdfMake } from './manualPdf';

// Helpers for Power Forms (PowerFormFields.jsx, PowerFormPage.jsx,
// PowerFormsChartTab.jsx): the fields' input look, an answer as text, and
// the PDF copy of a completed form that's saved to the patient's Documents.

export const pfInputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 6, border: '1px solid #D4D4D8',
  fontSize: 15, fontFamily: 'inherit', color: INK, background: 'white',
};

// The letterhead on the parent's page and the PDF copies, as on the paper
// forms (Kieran, Oct 2026: "full letterhead").
export const LETTERHEAD = {
  name: 'The Kidz Lounge Related Services, LLC',
  lines: [
    '82-12 151st Ave, Howard Beach, NY 11414 · (718) 848-0875',
    'kidzlounge.net · thekidzloungeny@gmail.com',
    'www.confidentkidzny.com · www.languageloungeny.com',
  ],
  tagline: 'Providing Occupational, Physical and Speech Therapy. We also offer classes for kidz.',
};

// A date of birth as on a chart label: 02/11/2023.
export const labelDate = (iso) => (iso ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}` : '');

// The answers a form starts with: what the office filled in before sending.
export function startingAnswers(fields) {
  const out = {};
  for (const f of fields || []) if (f.default !== undefined && f.default !== null) out[f.id] = Array.isArray(f.default) ? [...f.default] : f.default;
  return out;
}

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
// The app's logo as a data URL, for the PDF (top left). null if it can't load.
let logoPromise = null;
function logoDataUrl() {
  if (!logoPromise) {
    logoPromise = fetch('/logo.png')
      .then(r => (r.ok ? r.blob() : null))
      .then(blob => blob && new Promise(resolve => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = () => resolve(null); fr.readAsDataURL(blob); }))
      .catch(() => null);
  }
  return logoPromise;
}

// patient: { Name, Date_of_Birth, mrn } (the chart's patient).
export async function buildPowerFormPdf(form, patient) {
  const dob = patient.Date_of_Birth ? String(patient.Date_of_Birth).slice(0, 10) : '';
  const [pdfMake, logo] = await Promise.all([loadPdfMake(), logoDataUrl()]);
  const content = [
    {
      columns: [
        ...(logo ? [{ image: logo, fit: [150, 75], width: 160 }] : []),
        {
          width: '*', fontSize: 9.5, color: '#52525B', margin: [0, 4, 0, 0],
          stack: [{ text: LETTERHEAD.name, bold: true, color: '#18181B', fontSize: 12 }, ...LETTERHEAD.lines, { text: LETTERHEAD.tagline, italics: true, margin: [0, 2, 0, 0] }],
        },
      ],
      columnGap: 12, margin: [0, 0, 0, 8],
    },
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 499, y2: 0, lineWidth: 0.75, lineColor: '#D4D4D8' }], margin: [0, 0, 0, 14] },
    {
      // The form's title, and the patient label beside it (like a chart label).
      columns: [
        { width: '*', text: form.form_name, fontSize: 17, bold: true, margin: [0, 4, 12, 0] },
        {
          width: 190,
          table: { widths: ['*'], body: [[{
            stack: [
              { text: patient.Name || '', fontSize: 13, bold: true, margin: [0, 1, 0, 2] },
              { text: [dob && `DOB ${labelDate(dob)}`, patient.mrn && `MRN ${patient.mrn}`].filter(Boolean).join('   '), fontSize: 9.5 },
            ],
            margin: [6, 5, 6, 5],
          }]] },
          layout: { hLineWidth: () => 1.5, vLineWidth: () => 1.5, hLineColor: () => '#18181B', vLineColor: () => '#18181B' },
        },
      ],
      margin: [0, 0, 0, 8],
    },
    { text: `Sent ${when(form.created_at)}${form.recipient ? ` to ${form.recipient}` : ''} · Completed ${when(form.completed_at)}`, fontSize: 10, color: '#52525B', margin: [0, 0, 0, 14] },
  ];
  if (form.intro) content.push({ text: form.intro, fontSize: 10, margin: [0, 0, 0, 12] });
  for (const f of form.fields) {
    if (f.type === 'heading') {
      content.push({ text: f.label, bold: true, fontSize: 12, margin: [0, 10, 0, 4] });
      if (f.help) content.push({ text: f.help, fontSize: 9.5, margin: [0, 0, 0, 4] });
      continue;
    }
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
