import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from './api';
import { useAuth } from './AuthContext';
import { useIsMobile } from './useIsMobile';
import { canManage } from './roles';
import { Card, PageHeader, Tag, UnderlineTabs } from './dashboardUi';
import { INK, MUTED, HAIRLINE, PAGE_BG, FONT, NUMERIC, TONES, buttonStyle, choiceStyle } from './uiTokens';
import { eiInput, eiLabel, eiGrid } from './eiHubUi';
import { SignaturePad } from './PowerFormFields';
import { DateField } from './pages/SchedulePage';
import { formatPhone } from './phone';
import { openBlob, fmtDate, SERVICE_LABEL } from './sessionNotePdf';
import { buildEiPdf, progressNoteSection } from './eiFormsPdf';
import { RATING_LABEL, COMM_LABEL, DELIVERY_LABEL, TYPE_LABEL, QUESTIONS } from './progressReportPdf';

// EI progress reports (the "ei" feature, PedsDesk only, Oct 2026; API
// routes/progressReports.js, rules in lib/progressReports.js). The NYC
// Provider Progress Note (9/2024): written by each provider before every
// IFSP review, due 21 days before it in PedsDesk (NYC's deadline is 14). The
// parent reviews it and signs on the provider's device, the provider
// certifies and signs, then the office approves it (or returns it for an
// addendum) and marks it sent to the service coordinator.

const STATUS = {
  not_started: { text: 'Not started', tone: 'warning' },
  draft: { text: 'Draft', tone: 'warning' },
  needs_parent: { text: 'Needs parent signature', tone: 'warning' },
  needs_provider: { text: 'Needs provider signature', tone: 'warning' },
  needs_supervisor: { text: 'Needs co-signature', tone: 'warning' },
  to_approve: { text: 'Waiting for the office', tone: 'neutral' },
  returned: { text: 'Returned: add an addendum', tone: 'danger' },
  approved: { text: 'Approved, not sent', tone: 'accent' },
  sent: { text: 'Sent', tone: 'success' },
};
const TABS = [
  { key: 'todo', label: 'To write', statuses: ['not_started', 'draft', 'needs_parent', 'needs_provider', 'needs_supervisor', 'returned'] },
  { key: 'office', label: 'With the office', statuses: ['to_approve', 'approved'] },
  { key: 'sent', label: 'Sent', statuses: ['sent'] },
];
const dayLabel = (s) => (s ? new Date(`${s}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const daysLeft = (today, d) => Math.round((new Date(`${d}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000);

function DueText({ today, due, status }) {
  if (!due) return <span style={{ color: MUTED }}>—</span>;
  if (['to_approve', 'approved', 'sent'].includes(status)) return <span style={{ color: MUTED }}>{dayLabel(due)}</span>;
  const left = daysLeft(today, due);
  const color = left < 0 ? TONES.danger.fg : left <= 7 ? TONES.warning.fg : INK;
  return <span style={{ color }}>{dayLabel(due)}{left < 0 ? ` (${-left} days late)` : left <= 7 ? ` (in ${left} days)` : ''}</span>;
}

// A list of reports (the Reports page and the chart's IFSP tab). Starting a
// report creates it (prefilled) and opens it.
export function ProgressReportRows({ rows, today, showChild = true, showProvider, canStart, isMobile, onError }) {
  const navigate = useNavigate();
  const open = async (r) => {
    if (r.id) { navigate(`/progress-reports/${r.id}`); return; }
    if (!canStart) return;
    try {
      const { id } = await api.startProgressReport({ patient_id: r.patient_id, ifsp_id: r.ifsp_id, service: r.service });
      navigate(`/progress-reports/${id}`);
    } catch (err) { onError?.(err.message); }
  };
  if (!rows.length) return <p style={{ margin: 0, fontSize: 13.5, color: MUTED }}>Nothing here.</p>;
  return rows.map((r, i) => {
    const st = STATUS[r.status] || STATUS.draft;
    const clickable = r.id || canStart;
    return (
      <button key={`${r.id || 'new'}-${r.patient_id}-${r.ifsp_id}-${r.provider}-${r.service}-${r.report_type}`} type="button" disabled={!clickable} onClick={() => open(r)}
        style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr) auto' : `minmax(0, 1.2fr) ${showProvider ? 'minmax(0, 1fr) ' : ''}110px minmax(0, 1fr) 210px`, gap: isMobile ? 4 : 12, alignItems: 'center',
          width: '100%', textAlign: 'left', padding: '10px 0', border: 'none', borderTop: i ? `1px solid ${HAIRLINE}` : 'none', background: 'none', cursor: clickable ? 'pointer' : 'default', fontFamily: 'inherit', fontSize: 13.5, color: INK, ...NUMERIC }}>
        {isMobile ? (
          <>
            <span>
              <span style={{ fontWeight: 600 }}>{showChild ? r.patient_name : `${TYPE_LABEL[r.report_type]} · ${r.service}`}</span>
              <span style={{ display: 'block', fontSize: 12.5, color: MUTED }}>{[showChild ? `${TYPE_LABEL[r.report_type]} · ${r.service}` : null, showProvider ? r.provider : null, `due ${dayLabel(r.due_date)}`].filter(Boolean).join(' · ')}</span>
            </span>
            <Tag tone={st.tone}>{st.text}</Tag>
          </>
        ) : (
          <>
            <span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{showChild ? r.patient_name : `${TYPE_LABEL[r.report_type]} report`}</span>
            {showProvider && <span style={{ color: MUTED, overflowWrap: 'anywhere' }}>{r.provider}</span>}
            <span style={{ color: MUTED }}>{showChild ? `${TYPE_LABEL[r.report_type]} · ` : ''}{r.service}</span>
            <span>Due <DueText today={today} due={r.due_date} status={r.status} /></span>
            <span><Tag tone={st.tone}>{r.id || canStart ? st.text : 'Not started (provider writes)'}</Tag></span>
          </>
        )}
      </button>
    );
  });
}

// /progress-reports
export function ProgressReportsPage() {
  const { user } = useAuth();
  const manager = canManage(user);
  const isMobile = useIsMobile(900);
  const [tab, setTab] = useState(manager ? 'office' : 'todo');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let alive = true;
    api.getProgressReports()
      .then(d => { if (alive) { setData(d); setError(null); } })
      .catch(err => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, []);
  const rows = data?.rows || [];
  const counts = Object.fromEntries(TABS.map(t => [t.key, rows.filter(r => t.statuses.includes(r.status)).length]));
  return (
    <div style={{ background: PAGE_BG, fontFamily: FONT, minHeight: '100%' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '18px 14px 40px' : '28px 28px 56px' }}>
        <PageHeader title="Progress reports" isMobile={isMobile} actions={<Link to="/eval-reports" style={{ fontSize: 13.5, color: 'var(--brand-primary)' }}>Evaluation reports →</Link>} />
        <UnderlineTabs label="Progress report views" active={tab} onPick={setTab} style={{ marginBottom: 16 }}
          tabs={TABS.map(t => ({ key: t.key, label: t.label, count: data ? counts[t.key] : null, alert: (t.key === 'todo' && counts.todo) || (t.key === 'office' && manager && counts.office) ? 'warning' : null }))} />
        <Card pad={isMobile ? 14 : 20}>
          {error && <p role="alert" style={{ margin: '0 0 8px', fontSize: 13.5, color: TONES.danger.fg }}>{error}</p>}
          {!data && !error && <p style={{ margin: 0, fontSize: 13.5, color: MUTED }}>Loading...</p>}
          {data && <ProgressReportRows rows={rows.filter(r => TABS.find(t => t.key === tab).statuses.includes(r.status))} today={data.today}
            showProvider={manager} canStart={!!user?.providerName} isMobile={isMobile} onError={setError} />}
        </Card>
      </div>
    </div>
  );
}

const Choice = ({ value, options, onChange, disabled }) => (
  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
    {options.map(([v, l]) => (
      <button key={String(v)} type="button" disabled={disabled} aria-pressed={value === v} onClick={() => onChange(v)} style={{ ...choiceStyle(value === v), padding: '4px 9px', fontSize: 12.5 }}>{l}</button>
    ))}
  </div>
);
const Section = ({ title, children, isMobile }) => <Card pad={isMobile ? 14 : 20} style={{ marginTop: 16 }} title={title}>{children}</Card>;

// The parent reviews the report with the provider and signs on the device.
function ParentSign({ report, header, onDone, onCancel }) {
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [sig, setSig] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try { await api.progressReportStep(report.id, 'parent-sign', { parent_name: name, relationship, signature: sig }); onDone(); } catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <div role="dialog" aria-modal="true" aria-label="Parent signature" style={{ position: 'fixed', inset: 0, zIndex: 10050, background: 'white', overflowY: 'auto', fontFamily: FONT }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 18px 40px' }}>
        <h2 style={{ fontSize: 20, margin: '0 0 6px', color: INK }}>Progress report review</h2>
        <p style={{ fontSize: 15, color: INK, margin: '0 0 18px', lineHeight: 1.5 }}>
          {header.child_name} · {SERVICE_LABEL[report.service] || report.service} with {header.interventionist}<br />{TYPE_LABEL[report.report_type]} progress report, IFSP {fmtDate(report.ifsp_start)} to {fmtDate(report.ifsp_end)}
        </p>
        <label htmlFor="pr-name" style={eiLabel}>Your name</label>
        <input id="pr-name" value={name} onChange={e => setName(e.target.value)} style={{ ...eiInput, marginBottom: 12 }} />
        <label htmlFor="pr-rel" style={eiLabel}>Relationship to the child</label>
        <input id="pr-rel" value={relationship} onChange={e => setRelationship(e.target.value)} placeholder="e.g. Mother, Father, Guardian" style={{ ...eiInput, marginBottom: 18 }} />
        <p style={{ fontSize: 13.5, color: INK, margin: '0 0 6px' }}>I reviewed this progress report with {header.interventionist} today.</p>
        <SignaturePad value={sig} onChange={setSig} />
        {error && <p role="alert" style={{ fontSize: 13.5, color: TONES.danger.fg, margin: '12px 0 0' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button type="button" disabled={busy || !sig} onClick={submit} style={buttonStyle('primary', { padding: '10px 18px', fontSize: 15 })}>{busy ? 'Saving...' : 'Sign'}</button>
          <button type="button" disabled={busy} onClick={onCancel} style={buttonStyle('secondary', { padding: '10px 18px', fontSize: 15 })}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// /progress-reports/:id
export function ProgressReportPage() {
  const { id } = useParams();
  const isMobile = useIsMobile(900);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [parentSigning, setParentSigning] = useState(false);
  const [sig, setSig] = useState(null);
  const [license, setLicense] = useState('');
  const [addendum, setAddendum] = useState('');
  const [officeComment, setOfficeComment] = useState('');
  const [sentOn, setSentOn] = useState('');
  const [supSig, setSupSig] = useState(null);
  const [supLicense, setSupLicense] = useState('');

  const load = useCallback(() => api.getProgressReport(id).then(d => {
    setData(d); setError(null); setDirty(false);
    setDraft({ details: d.report.details, outcomes: d.report.outcomes, answers: d.report.answers || {}, proposed: d.report.proposed || [] });
    setLicense(d.report.provider_license || d.license_hint || '');
    setSentOn(d.today);
  }).catch(err => setError(err.message)), [id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <div style={{ padding: 28, fontFamily: FONT }}><p role="alert" style={{ color: TONES.danger.fg }}>{error}</p><Link to="/progress-reports">Back to progress reports</Link></div>;
  if (!data || !draft) return <p style={{ padding: 28, fontFamily: FONT, color: MUTED, fontSize: 13.5 }}>Loading...</p>;

  const { report, header, addenda } = data;
  const locked = !!(report.provider_signed_at || report.parent_signed_at);
  const editable = data.can_write && !locked;
  const d = draft.details;
  const setD = (patch) => { setDraft(x => ({ ...x, details: { ...x.details, ...patch } })); setDirty(true); };
  const setOutcome = (i, patch) => { setDraft(x => ({ ...x, outcomes: x.outcomes.map((o, j) => (j === i ? { ...o, ...patch } : o)) })); setDirty(true); };
  const setStep = (i, k, patch) => setOutcome(i, { steps: draft.outcomes[i].steps.map((s, j) => (j === k ? { ...s, ...patch } : s)) });
  const setAnswer = (k, v) => { setDraft(x => ({ ...x, answers: { ...x.answers, [k]: v } })); setDirty(true); };
  const setProposed = (list) => { setDraft(x => ({ ...x, proposed: list })); setDirty(true); };

  const save = async () => {
    setBusy(true); setMsg(null);
    try { const r = await api.saveProgressReport(id, draft); setData(x => ({ ...x, report: r.report, status: r.status, missing: r.missing })); setDirty(false); return r; } catch (err) { setMsg(err.message); return null; } finally { setBusy(false); }
  };
  const step = async (name, body, after) => {
    setBusy(true); setMsg(null);
    try { await api.progressReportStep(id, name, body); after?.(); await load(); } catch (err) { setMsg(err.message); }
    setBusy(false);
  };
  const startParent = async () => {
    const left = dirty ? (await save())?.missing : data.missing;
    if (left && !left.length) setParentSigning(true);
  };
  const providerSign = async () => {
    if (dirty && !(await save())) return;
    step('provider-sign', { signature: sig, license }, () => setSig(null));
  };
  const pdf = async () => { try { openBlob(await buildEiPdf([progressNoteSection(data)], { title: 'Provider progress note' })); } catch (err) { setMsg(err.message); } };
  const missing = dirty ? null : data.missing;
  const st = STATUS[data.status] || STATUS.draft;
  const text = (value, onChange, rows = 3, placeholder) => (
    <textarea value={value || ''} disabled={!editable} rows={rows} placeholder={placeholder} onChange={e => onChange(e.target.value)}
      style={{ ...eiInput, resize: 'vertical', lineHeight: 1.45, background: editable ? 'white' : '#FAFAFA' }} />
  );
  const field = (label, k, extra = {}) => (
    <div>
      <label htmlFor={`pr-${k}`} style={eiLabel}>{label}</label>
      <input id={`pr-${k}`} value={d[k] ?? ''} disabled={!editable} onChange={e => setD({ [k]: extra.phone ? formatPhone(e.target.value) : e.target.value })} style={eiInput} type={extra.type || 'text'} inputMode={extra.phone ? 'numeric' : undefined} />
    </div>
  );

  return (
    <div style={{ background: PAGE_BG, fontFamily: FONT, minHeight: '100%' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: isMobile ? '18px 14px 60px' : '28px 28px 72px' }}>
        <Link to="/progress-reports" style={{ fontSize: 13, color: 'var(--brand-primary)' }}>← Progress reports</Link>
        <PageHeader title={`${header.child_name} · ${TYPE_LABEL[report.report_type]} progress report`} isMobile={isMobile} actions={(
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Tag tone={st.tone}>{st.text}</Tag>
            {locked && <button type="button" onClick={pdf} style={buttonStyle('secondary')}>PDF</button>}
          </div>
        )} />
        <p style={{ fontSize: 13, color: MUTED, margin: '-6px 0 0' }}>
          {SERVICE_LABEL[report.service] || report.service} · {header.interventionist} · IFSP {fmtDate(report.ifsp_start)} to {fmtDate(report.ifsp_end)} · Due <DueText today={data.today} due={report.due_date} status={data.status} />
        </p>

        {report.office_status === 'returned' && (
          <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: TONES.danger.bg, color: TONES.danger.fg, fontSize: 13.5 }}>
            <strong>Returned by the office:</strong> {report.office_comment}{data.can_write ? ' Answer it with an addendum below.' : ''}
          </div>
        )}

        {data.can_office && report.provider_signed_at && report.parent_signed_at && !report.sent_on && (
          <Section title="Office review" isMobile={isMobile}>
            {report.supervisor_name && !report.supervisor_signed_at ? (
              <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Waiting for {report.supervisor_name} (the provider's supervisor) to co-sign before it can be approved.</p>
            ) : report.office_status === 'approved' ? (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div><span style={eiLabel}>Sent to the service coordinator on</span><DateField style={{ ...eiInput, width: 190 }} ariaLabel="Date sent" value={sentOn} onChange={setSentOn} /></div>
                <button type="button" disabled={busy} onClick={() => step('sent', { sent_on: sentOn })} style={buttonStyle('primary')}>Mark sent</button>
                <button type="button" onClick={pdf} style={buttonStyle('secondary')}>PDF to send</button>
              </div>
            ) : (
              <>
                <p style={{ fontSize: 13, color: MUTED, margin: '0 0 8px' }}>Check every question is answered and the outcomes are rated before it goes to the service coordinator (NYC returns incomplete reports).</p>
                <textarea aria-label="Comment for the provider" value={officeComment} onChange={e => setOfficeComment(e.target.value)} rows={2} placeholder="What needs fixing (only when returning it)" style={{ ...eiInput, resize: 'vertical' }} />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button type="button" disabled={busy} onClick={() => step('office', { action: 'approve' })} style={buttonStyle('primary')}>Approve</button>
                  <button type="button" disabled={busy || !officeComment.trim()} onClick={() => step('office', { action: 'return', comment: officeComment }, () => setOfficeComment(''))} style={buttonStyle('danger')}>Return to provider</button>
                </div>
              </>
            )}
          </Section>
        )}
        {report.sent_on && <p style={{ fontSize: 13.5, color: TONES.success.fg, margin: '14px 0 0', fontWeight: 600 }}>Sent to the service coordinator on {fmtDate(report.sent_on)}.</p>}
        {/* NYC: "The family should receive a copy of all completed progress notes." */}
        {report.provider_signed_at && (data.can_write || data.can_office) && (
          <p style={{ fontSize: 13, margin: '10px 0 0', display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontWeight: 600, color: INK }}>Family's copy</span>
            {report.family_copy_on ? <span style={{ color: MUTED }}>Given {fmtDate(String(report.family_copy_on).slice(0, 10))}</span>
              : <button type="button" disabled={busy} onClick={() => step('family-copy', {})} style={buttonStyle('secondary', { padding: '4px 10px' })}>Copy given to family today</button>}
          </p>
        )}

        <Section title="Services" isMobile={isMobile}>
          <div style={eiGrid}>
            {field("Your direct phone (not the agency's)", 'interventionist_phone', { phone: true })}
            {field('Language(s) used in sessions', 'languages')}
            {field('Service coordinator', 'sc_name')}
            {field('EIOD (if known)', 'eiod_name')}
            {field('Provider agency', 'agency_name')}
            {field('Agency ID #', 'agency_id')}
            {field('Authorized frequency (e.g. 2 x 30)', 'authorized_frequency')}
            <div><span style={eiLabel}>Date you started with this child</span><DateField disabled={!editable} style={eiInput} ariaLabel="Start date" value={d.start_date || ''} onChange={v => setD({ start_date: v })} /></div>
          </div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 12, alignItems: 'flex-end' }}>
            <div><span style={eiLabel}>Services delivered</span><Choice value={d.delivery} disabled={!editable} onChange={v => setD({ delivery: v })} options={Object.entries(DELIVERY_LABEL)} /></div>
            <div style={{ width: 120 }}><label htmlFor="pr-inp" style={eiLabel}>In-person sessions</label><input id="pr-inp" type="number" min="0" value={d.sessions_in_person ?? 0} disabled={!editable} onChange={e => setD({ sessions_in_person: e.target.value })} style={eiInput} /></div>
            <div style={{ width: 120 }}><label htmlFor="pr-tel" style={eiLabel}>Telehealth sessions</label><input id="pr-tel" type="number" min="0" value={d.sessions_telehealth ?? 0} disabled={!editable} onChange={e => setD({ sessions_telehealth: e.target.value })} style={eiInput} /></div>
            <div><span style={eiLabel}>Did a parent/caregiver take part?</span><Choice value={d.parent_participated} disabled={!editable} onChange={v => setD({ parent_participated: v })} options={[[true, 'Yes'], [false, 'No']]} /></div>
          </div>
          <div style={{ marginTop: 12 }}>{field('Where services were delivered', 'locations')}</div>
          <span style={{ ...eiLabel, marginTop: 12 }}>How information is shared with the family</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {Object.entries(COMM_LABEL).map(([v, l]) => {
              const on = (d.comm_methods || []).includes(v);
              return <button key={v} type="button" disabled={!editable} aria-pressed={on} onClick={() => setD({ comm_methods: on ? d.comm_methods.filter(x => x !== v) : [...(d.comm_methods || []), v] })} style={{ ...choiceStyle(on), padding: '4px 9px', fontSize: 12.5 }}>{l}</button>;
            })}
          </div>
          <div style={{ ...eiGrid, marginTop: 10 }}>
            {(d.comm_methods || []).includes('other') && field('Other way', 'comm_other')}
            {field('How often', 'comm_frequency')}
          </div>
          <span style={{ ...eiLabel, marginTop: 12 }}>Gaps of more than three scheduled visits in a row (length and reason; make-ups)</span>
          {text(d.gaps, v => setD({ gaps: v }), 2, 'None')}
          <div style={{ marginTop: 12 }}>{field("Child's medical diagnoses (note any new ones)", 'diagnoses')}</div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 12 }}>
            <div><span style={eiLabel}>Using assistive technology?</span><Choice value={!!d.at_using} disabled={!editable} onChange={v => setD({ at_using: v })} options={[[true, 'Yes'], [false, 'No']]} /></div>
            <div><span style={eiLabel}>New AT device requested?</span><Choice value={!!d.at_requested} disabled={!editable} onChange={v => setD({ at_requested: v })} options={[[true, 'Yes'], [false, 'No']]} /></div>
          </div>
          {(d.at_using || d.at_requested) && <div style={{ marginTop: 8 }}>{text(d.at_details, v => setD({ at_details: v }), 2, 'The device, the IFSP outcome, and how it helps')}</div>}
        </Section>

        <Section title="1. IFSP outcomes and developmental steps" isMobile={isMobile}>
          {!draft.outcomes.length && <p style={{ fontSize: 13, color: TONES.warning.fg, margin: 0 }}>This IFSP has no outcomes entered. Ask the office to add them on the chart's IFSP tab, then start the report again.</p>}
          {draft.outcomes.map((o, i) => (
            <div key={i} style={{ padding: '12px 0', borderTop: i ? `1px solid ${HAIRLINE}` : 'none' }}>
              <p style={{ fontSize: 13.5, fontWeight: 600, color: INK, margin: '0 0 8px' }}>Outcome {o.number}: <span style={{ fontWeight: 400 }}>{o.text}</span></p>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <Choice value={o.rating} disabled={!editable} onChange={v => setOutcome(i, { rating: v, keep: v === 'achieved' ? 'remove' : o.keep || 'keep' })} options={Object.entries(RATING_LABEL)} />
                <Choice value={o.keep} disabled={!editable} onChange={v => setOutcome(i, { keep: v })} options={[['keep', 'Keep outcome'], ['remove', 'Remove outcome']]} />
              </div>
              {o.steps.map((s, k) => (
                <div key={k} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '6px 0 0 14px' }}>
                  <span style={{ fontSize: 13, color: INK, flex: '1 1 220px' }}><span style={{ color: MUTED }}>{s.label}.</span> {s.text}</span>
                  <Choice value={s.rating} disabled={!editable} onChange={v => setStep(i, k, { rating: v, keep: v === 'achieved' ? 'no' : s.keep || 'yes' })} options={Object.entries(RATING_LABEL)} />
                  <Choice value={s.keep} disabled={!editable} onChange={v => setStep(i, k, { keep: v })} options={[['yes', 'Keep Y'], ['no', 'Keep N']]} />
                </div>
              ))}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                <span style={{ fontSize: 12.5, color: MUTED }}>Identified at the IFSP meeting?</span>
                <Choice value={o.at_ifsp !== false} disabled={!editable} onChange={v => setOutcome(i, { at_ifsp: v })} options={[[true, 'Yes'], [false, 'No']]} />
              </div>
              {o.at_ifsp === false && <div style={{ marginTop: 6 }}>{text(o.change_note, v => setOutcome(i, { change_note: v }), 2, 'The date it changed and why')}</div>}
            </div>
          ))}
        </Section>

        <Section title="Questions" isMobile={isMobile}>
          {Object.entries(QUESTIONS).map(([k, q]) => (
            <div key={k} style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 13.5, fontWeight: 600, color: INK, margin: '0 0 6px', lineHeight: 1.4 }}>{q}</p>
              {text(draft.answers[k], v => setAnswer(k, v), k === 'q2' ? 2 : 4, k === 'q2' ? 'None, if every outcome was addressed' : undefined)}
            </div>
          ))}
        </Section>

        <Section title="8. New or modified outcomes for the next IFSP period" isMobile={isMobile}>
          <p style={{ fontSize: 12.5, color: MUTED, margin: '0 0 8px' }}>Discussed with and agreed to by the parent. Parent-friendly language; include who, what, the routine, how you'll know, and the "so that".</p>
          {draft.proposed.map((p, i) => (
            <div key={i} style={{ padding: '8px 0', borderTop: i ? `1px solid ${HAIRLINE}` : 'none' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                <input aria-label="Outcome number" value={p.number || ''} disabled={!editable} onChange={e => setProposed(draft.proposed.map((x, j) => (j === i ? { ...x, number: e.target.value } : x)))} placeholder="#" style={{ ...eiInput, width: 60 }} />
                <Choice value={p.kind} disabled={!editable} onChange={v => setProposed(draft.proposed.map((x, j) => (j === i ? { ...x, kind: v } : x)))} options={[['new', 'New'], ['modified', 'Modified']]} />
                {editable && <button type="button" onClick={() => setProposed(draft.proposed.filter((_, j) => j !== i))} style={{ ...buttonStyle('text'), color: MUTED }}>Remove</button>}
              </div>
              {text(p.text, v => setProposed(draft.proposed.map((x, j) => (j === i ? { ...x, text: v } : x))), 2, 'IFSP outcome')}
              {(p.steps || []).map((s, k) => (
                <div key={k} style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '6px 0 0 14px', flexWrap: 'wrap' }}>
                  <input aria-label="Step label" value={s.label || ''} disabled={!editable} onChange={e => setProposed(draft.proposed.map((x, j) => (j === i ? { ...x, steps: x.steps.map((y, m) => (m === k ? { ...y, label: e.target.value } : y)) } : x)))} placeholder="1a" style={{ ...eiInput, width: 54 }} />
                  <input aria-label="Developmental step" value={s.text || ''} disabled={!editable} onChange={e => setProposed(draft.proposed.map((x, j) => (j === i ? { ...x, steps: x.steps.map((y, m) => (m === k ? { ...y, text: e.target.value } : y)) } : x)))} style={{ ...eiInput, flex: '1 1 220px' }} />
                  <Choice value={s.kind} disabled={!editable} onChange={v => setProposed(draft.proposed.map((x, j) => (j === i ? { ...x, steps: x.steps.map((y, m) => (m === k ? { ...y, kind: v } : y)) } : x)))} options={[['new', 'New'], ['modified', 'Modified']]} />
                </div>
              ))}
              {editable && <button type="button" onClick={() => setProposed(draft.proposed.map((x, j) => (j === i ? { ...x, steps: [...(x.steps || []), { label: '', text: '', kind: 'new' }] } : x)))} style={{ ...buttonStyle('text'), marginLeft: 8 }}>+ Developmental step</button>}
            </div>
          ))}
          {editable && <button type="button" onClick={() => { setProposed([...draft.proposed, { number: '', text: '', kind: 'new', steps: [] }]); setD({ proposed_none: false }); }} style={buttonStyle('text')}>+ Propose an outcome</button>}
          {!draft.proposed.length && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, color: INK, marginTop: 6 }}>
              <input type="checkbox" checked={!!d.proposed_none} disabled={!editable} onChange={e => setD({ proposed_none: e.target.checked })} /> None proposed
            </label>
          )}
        </Section>

        {editable && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 16, flexWrap: 'wrap' }}>
            <button type="button" disabled={busy || !dirty} onClick={save} style={buttonStyle('secondary')}>{busy ? 'Saving...' : dirty ? 'Save draft' : 'Saved'}</button>
          </div>
        )}
        {msg && <p role="alert" style={{ fontSize: 13.5, color: TONES.danger.fg, margin: '10px 0 0' }}>{msg}</p>}

        <Section title="Signatures" isMobile={isMobile}>
          {missing && missing.length > 0 && data.can_write && !locked && (
            <div style={{ fontSize: 13, color: TONES.warning.fg, marginBottom: 12 }}>
              Before signing, fill in ({missing.length}):
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{missing.slice(0, 12).map(m => <li key={m}>{m}</li>)}{missing.length > 12 && <li>…and {missing.length - 12} more</li>}</ul>
            </div>
          )}
          <p style={{ fontSize: 13.5, fontWeight: 600, color: INK, margin: '0 0 6px' }}>Parent (reviewed the report)</p>
          {report.parent_signed_at ? (
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
              <img src={report.parent_signature} alt="Parent's signature" style={{ height: 46, border: `1px solid ${HAIRLINE}`, borderRadius: 6, background: 'white' }} />
              <span style={{ fontSize: 13, color: INK }}>{report.parent_name} · {report.parent_relationship}<br /><span style={{ color: MUTED }}>Reviewed {fmtDate(report.parent_reviewed_on)}</span></span>
            </div>
          ) : data.can_write ? (
            <button type="button" disabled={busy || (!dirty && missing?.length > 0)} onClick={startParent} style={{ ...buttonStyle('primary'), marginBottom: 12 }}>Hand to parent to review and sign</button>
          ) : <p style={{ fontSize: 13, color: MUTED, margin: '0 0 12px' }}>Not signed yet.</p>}
          <p style={{ fontSize: 13.5, fontWeight: 600, color: INK, margin: '0 0 6px', paddingTop: 12, borderTop: `1px solid ${HAIRLINE}` }}>Interventionist</p>
          {report.provider_signed_at ? (
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <img src={report.provider_signature} alt="Interventionist's signature" style={{ height: 46, border: `1px solid ${HAIRLINE}`, borderRadius: 6, background: 'white' }} />
              <span style={{ fontSize: 13, color: INK }}>{header.interventionist}{header.credentials ? `, ${header.credentials}` : ''} · License # {report.provider_license}<br /><span style={{ color: MUTED }}>Completed {new Date(report.provider_signed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></span>
            </div>
          ) : data.can_write ? (
            <div style={{ maxWidth: 500 }}>
              <p style={{ fontSize: 12.5, color: MUTED, margin: '0 0 8px', lineHeight: 1.45 }}>I certify that I have received and reviewed a copy of the child's IFSP and evaluation/progress notes prior to starting services, have provided services in accordance with the IFSP's frequency and authorized session length, and have worked towards the relevant IFSP outcomes, and that this report accurately represents the child's current level of functioning.</p>
              <label htmlFor="pr-license" style={eiLabel}>License number (or "certified")</label>
              <input id="pr-license" value={license} onChange={e => setLicense(e.target.value)} style={{ ...eiInput, marginBottom: 10 }} />
              <SignaturePad value={sig} onChange={setSig} />
              <button type="button" disabled={busy || !sig || (!dirty && missing?.length > 0)} onClick={providerSign} style={{ ...buttonStyle('primary'), marginTop: 10 }}>Sign report</button>
            </div>
          ) : <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Not signed yet.</p>}
          {report.supervisor_name && (
            <>
              <p style={{ fontSize: 13.5, fontWeight: 600, color: INK, margin: '12px 0 6px', paddingTop: 12, borderTop: `1px solid ${HAIRLINE}` }}>Supervisor</p>
              {report.supervisor_signed_at ? (
                <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                  <img src={report.supervisor_signature} alt="Supervisor's signature" style={{ height: 46, border: `1px solid ${HAIRLINE}`, borderRadius: 6, background: 'white' }} />
                  <span style={{ fontSize: 13, color: INK }}>{report.supervisor_name} · License # {report.supervisor_license}<br /><span style={{ color: MUTED }}>Co-signed {new Date(report.supervisor_signed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></span>
                </div>
              ) : data.can_cosign ? (
                <div style={{ maxWidth: 500 }}>
                  <label htmlFor="pr-sup-license" style={eiLabel}>Your license #</label>
                  <input id="pr-sup-license" value={supLicense} onChange={e => setSupLicense(e.target.value)} placeholder="Filled in from your credentials if left blank" style={{ ...eiInput, marginBottom: 10 }} />
                  <SignaturePad value={supSig} onChange={setSupSig} />
                  <button type="button" disabled={busy || !supSig} onClick={() => step('supervisor-sign', { signature: supSig, license: supLicense }, () => setSupSig(null))} style={{ ...buttonStyle('primary'), marginTop: 10 }}>Co-sign report</button>
                </div>
              ) : <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Waiting for {report.supervisor_name} to co-sign.</p>}
            </>
          )}
        </Section>

        {locked && (
          <Section title="Addenda" isMobile={isMobile}>
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
      {parentSigning && <ParentSign report={report} header={header} onCancel={() => setParentSigning(false)} onDone={() => { setParentSigning(false); load(); }} />}
    </div>
  );
}
