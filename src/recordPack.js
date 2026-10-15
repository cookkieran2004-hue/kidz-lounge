import { api } from './api';
import { CLINIC } from './brand';
import { fmtDate } from './sessionNotePdf';
import { buildEiPdf, sessionNotesV1Sections, groupNoteV2Section, serviceLogSections, progressNoteSection, evalReportSection } from './eiFormsPdf';

// The chart's record pack (the "ei" feature, PedsDesk; Reception, Admins and
// Developers): one PDF of a child's EI record, for an audit, a records
// request or a transfer. A contents page, then the IFSPs (as entered), every
// signed session note, the monthly service logs, progress reports and
// evaluation reports, each laid out like NYC's official form (src/eiFormsPdf.js):
// individual notes two to a page (Version 1), group notes one to a page.
// Uploaded documents (the IFSP PDFs, Power Forms copies...) are listed, not
// merged in: they're files of any kind, opened from Documents.


function ifspContent(ifsps) {
  if (!ifsps.length) return [{ text: 'No IFSPs entered.', fontSize: 10 }];
  const out = [];
  for (const i of [...ifsps].sort((a, b) => a.start_date.localeCompare(b.start_date))) {
    out.push({ text: `${i.ifsp_type || 'IFSP'}: ${fmtDate(i.start_date)} to ${fmtDate(i.end_date) || 'no end date'}`, bold: true, fontSize: 11, margin: [0, 10, 0, 3] });
    const facts = [
      i.meeting_date ? `Meeting: ${fmtDate(i.meeting_date)}` : null,
      i.sc_name ? `Service coordinator: ${[i.sc_name, i.sc_company, i.sc_phone, i.sc_email].filter(Boolean).join(' · ')}` : null,
    ].filter(Boolean);
    for (const f of facts) out.push({ text: f, fontSize: 9.5 });
    (i.outcomes || []).forEach((o, n) => {
      out.push({ text: `Outcome ${n + 1}: ${o.outcome}${o.services?.length ? ` (${o.services.join(', ')})` : ''}`, fontSize: 10, margin: [0, 4, 0, 0] });
      (o.steps || []).forEach((st, j) => out.push({ text: `${n + 1}${String.fromCharCode(97 + j)}. ${st}`, fontSize: 9.5, margin: [12, 1, 0, 0] }));
    });
    if (i.notes) out.push({ text: i.notes, fontSize: 9.5, margin: [0, 4, 0, 0], italics: true });
  }
  return out;
}

export async function buildRecordPack(patient) {
  const [ifsp, record] = await Promise.all([api.getIfsp(patient.id), api.getPatientRecord(patient.id)]);
  const reports = await Promise.all(record.progress_report_ids.map(id => api.getProgressReport(id)));
  const evals = await Promise.all(record.eval_keys.map(k => api.getEvalReport(k)));

  // Service logs: one per provider and month, from the parent-signed notes.
  const logs = new Map();
  for (const { note } of record.notes) {
    if (note.cancelled || !note.parent_signed_at) continue;
    const k = `${note.provider}|${String(note.session_date).slice(0, 7)}`;
    if (!logs.has(k)) logs.set(k, { month: String(note.session_date).slice(0, 7), provider: note.provider, agency_name: record.agency_name, rows: [] });
    logs.get(k).rows.push(note);
  }

  const name = ifsp.patient?.name || patient.Name;
  const contents = [
    ['IFSPs', ifsp.ifsps.length],
    ['Session notes', record.notes.length],
    ['Service logs', logs.size],
    ['Progress reports', reports.length],
    ['Evaluation reports', evals.length],
    ['Documents on file (listed)', record.documents.length],
  ];
  const sections = [{
    footer: `${CLINIC.name} · EI record of ${name}`,
    content: [
      { text: CLINIC.name, fontSize: 11, color: '#52525B' },
      { text: 'Early Intervention record', bold: true, fontSize: 20, margin: [0, 6, 0, 4] },
      { text: name, fontSize: 15 },
      { text: `Date of birth: ${fmtDate(ifsp.patient?.date_of_birth ? String(ifsp.patient.date_of_birth).slice(0, 10) : '')}`, fontSize: 10.5, margin: [0, 4, 0, 0] },
      { text: `Made ${new Date().toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}`, fontSize: 10, color: '#52525B', margin: [0, 2, 0, 16] },
      { table: { widths: ['*', 60], body: contents.map(([l, n]) => [{ text: l, fontSize: 11 }, { text: String(n), fontSize: 11, alignment: 'right' }]) }, layout: 'lightHorizontalLines' },
      { text: 'Confidential: contains protected health information.', fontSize: 9, color: '#52525B', margin: [0, 16, 0, 0] },
      { text: 'IFSPs', bold: true, fontSize: 14, margin: [0, 24, 0, 8], pageBreak: 'before' },
      ...ifspContent(ifsp.ifsps),
    ],
  }];
  const asData = (n) => ({ session: { header: n.note.header || {}, outcomes: [] }, note: n.note, addenda: n.addenda });
  const individual = record.notes.filter(n => !n.note.group_type).map(asData);
  const groups = record.notes.filter(n => n.note.group_type).map(asData);
  sections.push(...sessionNotesV1Sections(individual));
  sections.push(...groups.map(groupNoteV2Section));
  for (const log of [...logs.values()].sort((a, b) => a.month.localeCompare(b.month) || a.provider.localeCompare(b.provider))) sections.push(...serviceLogSections(log));
  sections.push(...reports.map(progressNoteSection));
  sections.push(...evals.map(evalReportSection));
  sections.push({
    footer: `${CLINIC.name} · EI record of ${name}`,
    content: [
      { text: 'Documents on file', bold: true, fontSize: 14, margin: [0, 0, 0, 8] },
      record.documents.length
        ? { table: { widths: ['*', 110, 80], headerRows: 1, body: [
          ['File', 'Type', 'Uploaded'].map(t => ({ text: t, bold: true, fontSize: 9 })),
          ...record.documents.map(d => [d.filename, d.document_type || '', fmtDate(String(d.uploaded_at).slice(0, 10))].map(t => ({ text: t, fontSize: 9.5 }))),
        ] }, layout: 'lightHorizontalLines' }
        : { text: 'None.', fontSize: 10 },
    ],
  });
  return buildEiPdf(sections, { title: `EI record: ${name}` });
}
