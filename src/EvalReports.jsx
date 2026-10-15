import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from './api';
import { useAuth } from './AuthContext';
import { useIsMobile } from './useIsMobile';
import { canManage } from './roles';
import { Card, PageHeader, Tag } from './dashboardUi';
import { INK, MUTED, HAIRLINE, PAGE_BG, FONT, NUMERIC, TONES, buttonStyle, choiceStyle } from './uiTokens';
import { eiInput, eiLabel } from './eiHubUi';
import { SignaturePad } from './PowerFormFields';
import { openBlob, fmtDate, fmtTime } from './sessionNotePdf';
import { EVAL_TYPE_LABEL, ELIGIBILITY_LABEL, TELEHEALTH_REASON_LABEL, DOMAIN_ORDER } from './evalReportPdf';
import { buildEiPdf, evalReportSection } from './eiFormsPdf';

// EI evaluation reports (the "ei" feature, PedsDesk only, Oct 2026; API
// routes/evalReports.js, rules in lib/evalReports.js). One report per
// evaluation appointment, with the parts NYS requires of an EI evaluation
// report. The evaluator writes and signs it (locked after; corrections are
// addenda), their supervisor co-signs when they have one, and the office
// sees and prints every report.

const STATUS = {
  none: { text: 'Not written', tone: 'warning' },
  late: { text: 'Late', tone: 'danger' },
  draft: { text: 'Draft', tone: 'warning' },
  needs_supervisor: { text: 'Needs co-signature', tone: 'warning' },
  complete: { text: 'Signed', tone: 'success' },
};
const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const shiftMonth = (m, n) => { const [y, mo] = m.split('-').map(Number); return monthKey(new Date(y, mo - 1 + n, 1)); };
const monthLabel = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const dayLabel = (s) => new Date(`${s}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const evalHref = (key) => `/eval-reports/report?key=${encodeURIComponent(key)}`;

// /eval-reports: a provider's evaluations by month; the office sees everyone's.
export function EvalReportsPage() {
  const { user } = useAuth();
  const manager = canManage(user);
  const isMobile = useIsMobile(900);
  const navigate = useNavigate();
  const [month, setMonth] = useState(monthKey());
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let alive = true;
    api.getEvalReports(month)
      .then(d => { if (alive) { setData(d); setError(null); } })
      .catch(err => { if (alive) { setData(null); setError(err.message); } });
    return () => { alive = false; };
  }, [month]);
  const rows = [...(data?.evals || [])].reverse();
  return (
    <div style={{ background: PAGE_BG, fontFamily: FONT, minHeight: '100%' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '18px 14px 40px' : '28px 28px 56px' }}>
        <Link to="/progress-reports" style={{ fontSize: 13, color: 'var(--brand-primary)' }}>← Progress reports</Link>
        <PageHeader title="Evaluation reports" isMobile={isMobile} actions={(
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" aria-label="Previous month" onClick={() => setMonth(m => shiftMonth(m, -1))} style={buttonStyle('secondary', { padding: '6px 10px' })}>‹</button>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: INK, minWidth: 130, textAlign: 'center' }}>{monthLabel(month)}</span>
            <button type="button" aria-label="Next month" onClick={() => setMonth(m => shiftMonth(m, 1))} style={buttonStyle('secondary', { padding: '6px 10px' })}>›</button>
          </div>
        )} />
        <Card pad={isMobile ? 14 : 20}>
          {error && <p role="alert" style={{ margin: 0, fontSize: 13.5, color: TONES.danger.fg }}>{error}</p>}
          {!data && !error && <p style={{ margin: 0, fontSize: 13.5, color: MUTED }}>Loading...</p>}
          {data && !rows.length && <p style={{ margin: 0, fontSize: 13.5, color: MUTED }}>No evaluations this month.</p>}
          {rows.map((r, i) => {
            const st = STATUS[r.status] || STATUS.none;
            return (
              <button key={r.key} type="button" onClick={() => navigate(evalHref(r.key))}
                style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr) auto' : `130px 80px minmax(0, 1fr) ${manager ? 'minmax(0, 1fr) ' : ''}150px 150px`, gap: isMobile ? 4 : 12, alignItems: 'center', width: '100%', textAlign: 'left',
                  padding: '10px 0', border: 'none', borderTop: i ? `1px solid ${HAIRLINE}` : 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, color: INK, ...NUMERIC }}>
                {isMobile ? (
                  <>
                    <span><span style={{ fontWeight: 600 }}>{r.patient_name}</span><span style={{ display: 'block', fontSize: 12.5, color: MUTED }}>{[dayLabel(r.date), manager ? r.provider : null, `due ${fmtDate(r.due_date)}`].filter(Boolean).join(' · ')}</span></span>
                    <Tag tone={st.tone}>{st.text}</Tag>
                  </>
                ) : (
                  <>
                    <span>{dayLabel(r.date)}</span>
                    <span style={{ color: MUTED }}>{fmtTime(r.start_time)}</span>
                    <span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{r.patient_name}</span>
                    {manager && <span style={{ color: MUTED, overflowWrap: 'anywhere' }}>{r.provider}</span>}
                    <span style={{ color: MUTED }}>Due {fmtDate(r.due_date)}</span>
                    <span><Tag tone={st.tone}>{st.text}</Tag></span>
                  </>
                )}
              </button>
            );
          })}
        </Card>
      </div>
    </div>
  );
}

const blankDomains = () => Object.fromEntries(DOMAIN_ORDER.map(k => [k, { status: '', strengths: '', needs: '' }]));
const draftOf = (report, header) => ({
  details: {
    eval_type: '', eval_type_other: '', location: '', language: 'English', present: '', referral_reason: '', history: '', process: '', child_response: '',
    typical: null, typical_note: '', clinical_opinion: '', eligibility: '', eligibility_detail: '', icd10: '', recommendations: '', summary: '',
    health_assessment: '', records_reviewed: '', parent_interview: '', family_assessment: '', delivery: 'in_person', telehealth_reason: '',
    conditions: '', cultural_linguistic: '', transportation: '',
    evaluators: [{ name: header.evaluator || '', title: header.credentials || '', qualifications: '' }],
    ...Object.fromEntries(Object.entries(report?.details || {}).map(([k, v]) => [k, v ?? (k === 'typical' ? null : '')])),
  },
  instruments: report?.instruments?.length ? report.instruments : [{ name: '', area: '', score: '', notes: '' }],
  domains: { ...blankDomains(), ...(report?.domains || {}) },
});

// /eval-reports/report?key=...: write, sign and print one evaluation's report.
export function EvalReportPage() {
  const [params] = useSearchParams();
  const key = params.get('key') || '';
  const isMobile = useIsMobile(900);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [sig, setSig] = useState(null);
  const [license, setLicense] = useState('');
  const [addendum, setAddendum] = useState('');

  const load = useCallback(() => api.getEvalReport(key).then(d => {
    setData(d); setError(null); setDirty(false);
    setDraft(draftOf(d.report, d.header));
    setLicense(d.report?.provider_license || d.license_hint || '');
  }).catch(err => setError(err.message)), [key]);
  useEffect(() => { load(); }, [load]);

  if (error) return <div style={{ padding: 28, fontFamily: FONT }}><p role="alert" style={{ color: TONES.danger.fg }}>{error}</p><Link to="/eval-reports">Back to evaluation reports</Link></div>;
  if (!data || !draft) return <p style={{ padding: 28, fontFamily: FONT, color: MUTED, fontSize: 13.5 }}>Loading...</p>;

  const { header, report, addenda } = data;
  const locked = !!report?.provider_signed_at;
  const editable = data.can_write && !locked;
  const d = draft.details;
  const setD = (patch) => { setDraft(x => ({ ...x, details: { ...x.details, ...patch } })); setDirty(true); };
  const setDomain = (k, patch) => { setDraft(x => ({ ...x, domains: { ...x.domains, [k]: { ...x.domains[k], ...patch } } })); setDirty(true); };
  const setList = (name, list) => { setDraft(x => ({ ...x, [name]: list })); setDirty(true); };
  const setEvaluator = (i, patch) => setD({ evaluators: d.evaluators.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  const setInstrument = (i, patch) => setList('instruments', draft.instruments.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const save = async () => {
    setBusy(true); setMsg(null);
    try { const r = await api.saveEvalReport({ key, ...draft }); setData(x => ({ ...x, report: r.report, status: r.status, missing: r.missing })); setDirty(false); return r; } catch (err) { setMsg(err.message); return null; } finally { setBusy(false); }
  };
  const step = async (name, body, after) => {
    setBusy(true); setMsg(null);
    try { await api.evalReportStep(name, { key, ...body }); after?.(); await load(); } catch (err) { setMsg(err.message); }
    setBusy(false);
  };
  const sign = async () => {
    if (dirty && !(await save())) return;
    step('provider-sign', { signature: sig, license }, () => setSig(null));
  };
  const pdf = async () => { try { openBlob(await buildEiPdf([evalReportSection(data)], { title: 'Evaluation report' })); } catch (err) { setMsg(err.message); } };
  const missing = dirty ? null : data.missing;
  const st = STATUS[data.status] || STATUS.none;
  const area = (value, onChange, rows = 3, placeholder) => (
    <textarea value={value || ''} disabled={!editable} rows={rows} placeholder={placeholder} onChange={e => onChange(e.target.value)}
      style={{ ...eiInput, resize: 'vertical', lineHeight: 1.45, background: editable ? 'white' : '#FAFAFA' }} />
  );
  const input = (id, labelText, value, onChange, placeholder) => (
    <div>
      <label htmlFor={id} style={eiLabel}>{labelText}</label>
      <input id={id} value={value || ''} disabled={!editable} placeholder={placeholder} onChange={e => onChange(e.target.value)} style={eiInput} />
    </div>
  );
  const Section = ({ title, children }) => <Card pad={isMobile ? 14 : 20} style={{ marginTop: 16 }} title={title}>{children}</Card>;
  const choices = (value, options, onChange) => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map(([v, l]) => <button key={String(v)} type="button" disabled={!editable} aria-pressed={value === v} onClick={() => onChange(v)} style={choiceStyle(value === v)}>{l}</button>)}
    </div>
  );
  const grid = { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 10 };

  return (
    <div style={{ background: PAGE_BG, fontFamily: FONT, minHeight: '100%' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: isMobile ? '18px 14px 60px' : '28px 28px 72px' }}>
        <Link to="/eval-reports" style={{ fontSize: 13, color: 'var(--brand-primary)' }}>← Evaluation reports</Link>
        <PageHeader title={`${header.child_name} · Evaluation report`} isMobile={isMobile} actions={(
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Tag tone={st.tone}>{st.text}</Tag>
            {locked && <button type="button" onClick={pdf} style={buttonStyle('secondary')}>PDF</button>}
          </div>
        )} />
        <p style={{ fontSize: 13, color: MUTED, margin: '-6px 0 0' }}>
          {fmtDate(data.eval.date)} · {header.evaluator}{header.credentials ? `, ${header.credentials}` : ''} · {header.age_months !== null ? `${header.age_months} months old` : ''} · EI # {header.ei_number || '—'} · Due {fmtDate(data.eval.due_date)}
        </p>

        <Section title="The evaluation">
          <span style={eiLabel}>Type</span>
          {choices(d.eval_type, Object.entries(EVAL_TYPE_LABEL), v => setD({ eval_type: v }))}
          {d.eval_type === 'other' && <div style={{ marginTop: 8 }}>{input('ev-type-other', 'Which kind', d.eval_type_other, v => setD({ eval_type_other: v }))}</div>}
          <div style={{ ...grid, marginTop: 12 }}>
            {input('ev-location', 'Where', d.location, v => setD({ location: v }), 'e.g. Home, Center')}
            {input('ev-language', 'Language(s) used', d.language, v => setD({ language: v }))}
            {input('ev-present', 'Who was present', d.present, v => setD({ present: v }), 'e.g. Mother, grandmother')}
          </div>
          <span style={{ ...eiLabel, marginTop: 12 }}>Evaluator(s): name, title and qualifications</span>
          {d.evaluators.map((e, i) => (
            <div key={i} style={{ ...grid, marginBottom: 6 }}>
              <input aria-label={`Evaluator ${i + 1} name`} value={e.name || ''} disabled={!editable} placeholder="Name" onChange={x => setEvaluator(i, { name: x.target.value })} style={eiInput} />
              <input aria-label={`Evaluator ${i + 1} title`} value={e.title || ''} disabled={!editable} placeholder="Title, e.g. Speech-Language Pathologist" onChange={x => setEvaluator(i, { title: x.target.value })} style={eiInput} />
              <input aria-label={`Evaluator ${i + 1} qualifications`} value={e.qualifications || ''} disabled={!editable} placeholder="Qualifications, e.g. MS, CCC-SLP, NYS license" onChange={x => setEvaluator(i, { qualifications: x.target.value })} style={eiInput} />
            </div>
          ))}
          {editable && <button type="button" onClick={() => setD({ evaluators: [...d.evaluators, { name: '', title: '', qualifications: '' }] })} style={buttonStyle('text', { padding: 0, fontSize: 13 })}>+ Add an evaluator</button>}
          <span style={{ ...eiLabel, marginTop: 12 }}>How the evaluation was done</span>
          {choices(d.delivery, [['in_person', 'In person'], ['telehealth', 'Telehealth'], ['hybrid', 'Hybrid']], val => setD({ delivery: val }))}
          {(d.delivery === 'telehealth' || d.delivery === 'hybrid') && (
            <div style={{ marginTop: 8 }}>
              <label htmlFor="ev-th-reason" style={eiLabel}>Why telehealth (NYS allows only these; a family's willingness alone isn't enough)</label>
              <select id="ev-th-reason" value={d.telehealth_reason || ''} disabled={!editable} onChange={e => setD({ telehealth_reason: e.target.value })} style={eiInput}>
                <option value="">Choose</option>
                {Object.entries(TELEHEALTH_REASON_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
          )}
          <span style={{ ...eiLabel, marginTop: 12 }}>Reason for referral</span>
          {area(d.referral_reason, v => setD({ referral_reason: v }), 2)}
          <span style={{ ...eiLabel, marginTop: 10 }}>Relevant history (birth, medical, developmental)</span>
          {area(d.history, v => setD({ history: v }), 3)}
        </Section>

        <Section title="Health and family">
          <span style={eiLabel}>II. The child's health assessment (recent physical exam, vision and hearing; for a diagnosed condition, the medical documentation)</span>
          {area(d.health_assessment, val => setD({ health_assessment: val }), 3)}
          <span style={{ ...eiLabel, marginTop: 10 }}>Records reviewed (medical, educational, other)</span>
          {area(d.records_reviewed, val => setD({ records_reviewed: val }), 2)}
          <span style={{ ...eiLabel, marginTop: 10 }}>III. Parent interview: the family's concerns, priorities and resources, and their view of the child's abilities</span>
          {area(d.parent_interview, val => setD({ parent_interview: val }), 4)}
          <span style={{ ...eiLabel, marginTop: 10 }}>Family-directed assessment (optional, if the family chose one)</span>
          {area(d.family_assessment, val => setD({ family_assessment: val }), 2)}
        </Section>

        <Section title="Assessment">
          <span style={eiLabel}>IV. The assessment process (observation, parent report, instruments, routines, how the team worked together)</span>
          {area(d.process, v => setD({ process: v }), 4)}
          <span style={{ ...eiLabel, marginTop: 10 }}>Conditions: style (arena, individual), setting and any effect on performance, the child's state (tired, alert...)</span>
          {area(d.conditions, v => setD({ conditions: v }), 2)}
          <span style={{ ...eiLabel, marginTop: 10 }}>How the evaluation was responsive to the family's culture and language (languages the child hears, interpreter, bilingual evaluation)</span>
          {area(d.cultural_linguistic, v => setD({ cultural_linguistic: v }), 2)}
          <span style={{ ...eiLabel, marginTop: 10 }}>The child's responses to the evaluation</span>
          {area(d.child_response, v => setD({ child_response: v }), 3)}
          <span style={{ ...eiLabel, marginTop: 10 }}>Did the family feel these responses were optimal and representative of the child's functioning during daily routines?</span>
          {choices(d.typical, [[true, 'Yes'], [false, 'No']], v => setD({ typical: v }))}
          {d.typical === false && <div style={{ marginTop: 6 }}>{area(d.typical_note, v => setD({ typical_note: v }), 2, 'How they were not optimal or representative')}</div>}
          <span style={{ ...eiLabel, marginTop: 12 }}>Instruments and scores</span>
          {draft.instruments.map((x, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.3fr 1fr 1fr 1.3fr', gap: 6, marginBottom: 6 }}>
              <input aria-label={`Instrument ${i + 1}`} value={x.name || ''} disabled={!editable} placeholder="Instrument, e.g. PLS-5" onChange={e => setInstrument(i, { name: e.target.value })} style={eiInput} />
              <input aria-label={`Instrument ${i + 1} area`} value={x.area || ''} disabled={!editable} placeholder="Area" onChange={e => setInstrument(i, { area: e.target.value })} style={eiInput} />
              <input aria-label={`Instrument ${i + 1} score`} value={x.score || ''} disabled={!editable} placeholder="Score(s)" onChange={e => setInstrument(i, { score: e.target.value })} style={eiInput} />
              <input aria-label={`Instrument ${i + 1} notes`} value={x.notes || ''} disabled={!editable} placeholder="Notes" onChange={e => setInstrument(i, { notes: e.target.value })} style={eiInput} />
            </div>
          ))}
          {editable && <button type="button" onClick={() => setList('instruments', [...draft.instruments, { name: '', area: '', score: '', notes: '' }])} style={buttonStyle('text', { padding: 0, fontSize: 13 })}>+ Add an instrument</button>}
        </Section>

        <Section title="The child's status in each developmental area">
          {DOMAIN_ORDER.map((k, i) => (
            <div key={k} style={{ paddingTop: i ? 12 : 0, marginTop: i ? 12 : 0, borderTop: i ? `1px solid ${HAIRLINE}` : 'none' }}>
              <p style={{ fontSize: 13.5, fontWeight: 600, color: INK, margin: '0 0 6px' }}>{data.domain_labels[k]}</p>
              {area(draft.domains[k].status, v => setDomain(k, { status: v }), 3, 'Current functioning')}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8, marginTop: 6 }}>
                {area(draft.domains[k].strengths, v => setDomain(k, { strengths: v }), 2, 'Strengths')}
                {area(draft.domains[k].needs, v => setDomain(k, { needs: v }), 2, 'Needs')}
              </div>
            </div>
          ))}
        </Section>

        <Section title="Findings">
          <span style={eiLabel}>How informed clinical opinion was used</span>
          {area(d.clinical_opinion, v => setD({ clinical_opinion: v }), 3)}
          <span style={{ ...eiLabel, marginTop: 12 }}>Eligibility</span>
          {choices(d.eligibility, Object.entries(ELIGIBILITY_LABEL), v => setD({ eligibility: v }))}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '160px 1fr', gap: 10, marginTop: 10 }}>
            {input('ev-icd', 'ICD-10', d.icd10, v => setD({ icd10: v.toUpperCase() }), 'e.g. F80.1')}
            <div><span style={eiLabel}>Basis for the finding</span>{area(d.eligibility_detail, v => setD({ eligibility_detail: v }), 2, 'e.g. 2.0 SD below the mean in communication')}</div>
          </div>
          <span style={{ ...eiLabel, marginTop: 12 }}>X. The child's and family's transportation needs</span>
          {area(d.transportation, v => setD({ transportation: v }), 2, 'e.g. Family has no car; services at home are preferred')}
          <span style={{ ...eiLabel, marginTop: 12 }}>Recommendations: the types of services (not frequency, length or a provider: those are set at the IFSP meeting)</span>
          {area(d.recommendations, v => setD({ recommendations: v }), 3)}
          {(data.warnings || []).map(w => <p key={w} style={{ fontSize: 12.5, color: TONES.warning.fg, margin: '4px 0 0' }}>{w}</p>)}
          <span style={{ ...eiLabel, marginTop: 10 }}>Summary</span>
          {area(d.summary, v => setD({ summary: v }), 4)}
          {editable && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14 }}>
              <button type="button" disabled={busy || !dirty} onClick={save} style={buttonStyle('secondary')}>{busy ? 'Saving...' : dirty ? 'Save draft' : 'Saved'}</button>
            </div>
          )}
        </Section>

        <Section title="Signatures">
          {missing && missing.length > 0 && editable && (
            <div style={{ fontSize: 13, color: TONES.warning.fg, marginBottom: 12 }}>
              Before signing, fill in ({missing.length}):
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{missing.slice(0, 12).map(m => <li key={m}>{m}</li>)}{missing.length > 12 && <li>…and {missing.length - 12} more</li>}</ul>
            </div>
          )}
          <p style={{ fontSize: 13.5, fontWeight: 600, color: INK, margin: '0 0 6px' }}>Evaluator</p>
          {locked ? (
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <img src={report.provider_signature} alt="Evaluator's signature" style={{ height: 46, border: `1px solid ${HAIRLINE}`, borderRadius: 6, background: 'white' }} />
              <span style={{ fontSize: 13, color: INK }}>{header.evaluator} · License # {report.provider_license}<br /><span style={{ color: MUTED }}>Signed {new Date(report.provider_signed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></span>
            </div>
          ) : data.can_write ? (
            <div style={{ maxWidth: 500 }}>
              <label htmlFor="ev-license" style={eiLabel}>License number</label>
              <input id="ev-license" value={license} onChange={e => setLicense(e.target.value)} style={{ ...eiInput, marginBottom: 10 }} />
              <SignaturePad value={sig} onChange={setSig} />
              <p style={{ fontSize: 12.5, color: MUTED, margin: '6px 0 10px' }}>Signing locks the report. Corrections after that are added as addenda.</p>
              <button type="button" disabled={busy || !sig || (!dirty && missing?.length > 0)} onClick={sign} style={buttonStyle('primary')}>Sign report</button>
            </div>
          ) : <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Not signed yet.</p>}
          {(report?.supervisor_name || (!locked && header.supervisor)) && (
            <div style={{ paddingTop: 12, marginTop: 12, borderTop: `1px solid ${HAIRLINE}` }}>
              <p style={{ fontSize: 13.5, fontWeight: 600, color: INK, margin: '0 0 6px' }}>Supervisor</p>
              {report?.supervisor_signed_at ? (
                <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                  <img src={report.supervisor_signature} alt="Supervisor's signature" style={{ height: 46, border: `1px solid ${HAIRLINE}`, borderRadius: 6, background: 'white' }} />
                  <span style={{ fontSize: 13, color: INK }}>{report.supervisor_name} · License # {report.supervisor_license}</span>
                </div>
              ) : data.can_cosign ? (
                <SupervisorSign busy={busy} onSign={(signature, lic) => step('supervisor-sign', { signature, license: lic })} />
              ) : <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>{locked ? `Waiting for ${report.supervisor_name} to co-sign.` : `${header.supervisor} co-signs after the evaluator signs.`}</p>}
            </div>
          )}
          {locked && (
            <div style={{ paddingTop: 12, marginTop: 12, borderTop: `1px solid ${HAIRLINE}`, display: 'flex', gap: 10, alignItems: 'center', fontSize: 13 }}>
              <span style={{ fontWeight: 600, color: INK }}>Family's copy</span>
              {report.family_copy_on ? <span style={{ color: MUTED }}>Given {fmtDate(String(report.family_copy_on).slice(0, 10))}</span>
                : <button type="button" onClick={() => api.evalReportFamilyCopy(key).then(load).catch(err => setMsg(err.message))} style={buttonStyle('secondary', { padding: '4px 10px' })}>Copy given to family today</button>}
            </div>
          )}
          {msg && <p role="alert" style={{ fontSize: 13, color: TONES.danger.fg, margin: '10px 0 0' }}>{msg}</p>}
        </Section>

        {locked && (
          <Section title="Addenda">
            {!addenda.length && <p style={{ fontSize: 13, color: MUTED, margin: '0 0 8px' }}>None.</p>}
            {addenda.map(a => (
              <div key={a.id} style={{ fontSize: 13.5, color: INK, padding: '8px 0', borderBottom: `1px solid ${HAIRLINE}` }}>
                <div style={{ fontSize: 12, color: MUTED, marginBottom: 2 }}>{a.signed_name || a.signed_by} · {new Date(a.signed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{a.body}</div>
              </div>
            ))}
            {data.can_write && (
              <div style={{ marginTop: 10 }}>
                <textarea aria-label="New addendum" value={addendum} onChange={e => setAddendum(e.target.value)} rows={3} style={{ ...eiInput, resize: 'vertical' }} placeholder="Correction or addition" />
                <button type="button" disabled={busy || !addendum.trim()} onClick={() => step('addenda', { body: addendum }, () => setAddendum(''))} style={buttonStyle('secondary', { marginTop: 8 })}>Add signed addendum</button>
              </div>
            )}
          </Section>
        )}
      </div>
    </div>
  );
}

function SupervisorSign({ busy, onSign }) {
  const [sig, setSig] = useState(null);
  const [license, setLicense] = useState('');
  return (
    <div style={{ maxWidth: 460 }}>
      <label htmlFor="ev-sup-license" style={eiLabel}>Your license #</label>
      <input id="ev-sup-license" value={license} onChange={e => setLicense(e.target.value)} placeholder="Filled in from your credentials if left blank" style={{ ...eiInput, marginBottom: 10 }} />
      <SignaturePad value={sig} onChange={setSig} />
      <button type="button" disabled={busy || !sig} onClick={() => onSign(sig, license)} style={buttonStyle('primary', { marginTop: 10 })}>Co-sign report</button>
    </div>
  );
}
