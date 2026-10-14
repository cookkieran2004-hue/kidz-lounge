import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from './api';
import { useAuth } from './AuthContext';
import { useIsMobile } from './useIsMobile';
import { canManage } from './roles';
import { Card, PageHeader, Tag, UnderlineTabs } from './dashboardUi';
import { INK, MUTED, HAIRLINE, PAGE_BG, FONT, NUMERIC, TONES, buttonStyle, choiceStyle } from './uiTokens';
import { eiInput, eiLabel } from './eiHubUi';
import { SignaturePad } from './PowerFormFields';
import {
  buildSessionNotePdf, buildServiceLogPdf, openBlob, fmtDate, fmtTime,
  LOCATION_LABEL, DELIVERY_LABEL, PARTICIPANT_LABEL, METHOD_LABEL, SERVICE_LABEL,
} from './sessionNotePdf';

// EI session notes (the "ei" feature, PedsDesk only, Oct 2026; API
// routes/sessionNotes.js, rules in lib/sessionNotes.js). Follows the NYC EI
// Individual Session Note: the provider writes it, the parent or caregiver
// draws two signatures on the provider's device (the note and the service
// log), and the provider signs. The content locks at the first signature;
// corrections are addenda. EI billing won't claim a session until its note
// is signed by both. Reception, Admins and Developers see and print every
// note but never sign for a provider.

const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const shiftMonth = (m, n) => { const [y, mo] = m.split('-').map(Number); return monthKey(new Date(y, mo - 1 + n, 1)); };
const monthLabel = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const dayLabel = (s) => new Date(`${s}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

const STATUS = {
  none: { text: 'Not started', tone: 'warning' },
  draft: { text: 'Draft', tone: 'warning' },
  needs_parent: { text: 'Needs parent signature', tone: 'warning' },
  needs_provider: { text: 'Needs your signature', tone: 'warning' },
  complete: { text: 'Signed', tone: 'success' },
};
const TABS = [
  { key: 'todo', label: 'To write', statuses: ['none', 'draft'] },
  { key: 'signatures', label: 'Waiting for signatures', statuses: ['needs_parent', 'needs_provider'] },
  { key: 'done', label: 'Signed', statuses: ['complete'] },
];
const noteHref = (key) => `/session-notes/note?key=${encodeURIComponent(key)}`;

function MonthNav({ month, setMonth }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <button type="button" aria-label="Previous month" onClick={() => setMonth(m => shiftMonth(m, -1))} style={buttonStyle('secondary', { padding: '6px 10px' })}>‹</button>
      <span style={{ fontSize: 13.5, fontWeight: 600, color: INK, minWidth: 130, textAlign: 'center' }}>{monthLabel(month)}</span>
      <button type="button" aria-label="Next month" onClick={() => setMonth(m => shiftMonth(m, 1))} style={buttonStyle('secondary', { padding: '6px 10px' })}>›</button>
    </div>
  );
}

function SessionRows({ sessions, showProvider, showChild = true, isMobile }) {
  const navigate = useNavigate();
  if (!sessions.length) return <p style={{ margin: 0, fontSize: 13.5, color: MUTED }}>Nothing here.</p>;
  return sessions.map((s, i) => {
    const st = STATUS[s.note_status] || STATUS.none;
    return (
      <button key={s.key} type="button" onClick={() => navigate(noteHref(s.key))}
        style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr) auto' : `130px 90px minmax(0, 1fr) ${showProvider ? 'minmax(0, 1fr) ' : ''}60px 190px`, gap: isMobile ? 4 : 12, alignItems: 'center', width: '100%', textAlign: 'left',
          padding: '10px 0', border: 'none', borderTop: i ? `1px solid ${HAIRLINE}` : 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, color: INK, ...NUMERIC }}>
        {isMobile ? (
          <>
            <span>
              <span style={{ fontWeight: 600 }}>{showChild ? s.patient_name : dayLabel(s.date)}</span>
              <span style={{ display: 'block', fontSize: 12.5, color: MUTED }}>
                {[showChild ? dayLabel(s.date) : null, fmtTime(s.start_time), s.service, showProvider ? s.provider : null].filter(Boolean).join(' · ')}{s.cancelled ? ' · Canceled' : ''}
              </span>
            </span>
            <Tag tone={st.tone}>{st.text}</Tag>
          </>
        ) : (
          <>
            <span>{dayLabel(s.date)}</span>
            <span style={{ color: MUTED }}>{fmtTime(s.start_time)}</span>
            <span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{showChild ? s.patient_name : (s.cancelled ? 'Canceled session' : 'Session')}{showChild && s.cancelled ? <span style={{ fontWeight: 400, color: MUTED }}> · Canceled</span> : null}</span>
            {showProvider && <span style={{ color: MUTED, overflowWrap: 'anywhere' }}>{s.provider}</span>}
            <span style={{ color: MUTED }}>{s.service || '—'}</span>
            <span><Tag tone={st.tone}>{st.text}</Tag></span>
          </>
        )}
      </button>
    );
  });
}

// /session-notes: a provider's EI sessions by note status; the office sees
// everyone's, with a provider filter.
export function SessionNotesPage() {
  const { user } = useAuth();
  const isMobile = useIsMobile(900);
  const manager = canManage(user);
  const [month, setMonth] = useState(monthKey());
  const [provider, setProvider] = useState('');
  const [tab, setTab] = useState('todo');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let alive = true;
    api.getSessionNotes(month, { provider: manager ? provider : null })
      .then(d => { if (alive) { setData(d); setError(null); } })
      .catch(err => { if (alive) { setData(null); setError(err.message); } });
    return () => { alive = false; };
  }, [month, provider, manager]);
  const [providers, setProviders] = useState([]);
  useEffect(() => {
    if (!manager) return undefined;
    let alive = true;
    api.getProviders().then(list => { if (alive) setProviders((list || []).map(p => p.Name).sort()); }).catch(() => {});
    return () => { alive = false; };
  }, [manager]);
  const sessions = useMemo(() => [...(data?.sessions || [])].reverse(), [data]); // newest first
  const counts = Object.fromEntries(TABS.map(t => [t.key, sessions.filter(s => t.statuses.includes(s.note_status)).length]));
  const shown = sessions.filter(s => TABS.find(t => t.key === tab).statuses.includes(s.note_status));

  return (
    <div style={{ background: PAGE_BG, fontFamily: FONT, minHeight: '100%' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '18px 14px 40px' : '28px 28px 56px' }}>
        <PageHeader title="Session notes" isMobile={isMobile} actions={(
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {manager && (
              <select value={provider} onChange={e => setProvider(e.target.value)} aria-label="Provider"
                style={{ padding: '7px 10px', borderRadius: 6, border: `1px solid ${HAIRLINE}`, fontSize: 13, fontFamily: 'inherit', background: 'white' }}>
                <option value="">All providers</option>
                {providers.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
            <MonthNav month={month} setMonth={setMonth} />
          </div>
        )} />
        <UnderlineTabs label="Session note views" active={tab} onPick={setTab} style={{ marginBottom: 16 }}
          tabs={TABS.map(t => ({ key: t.key, label: t.label, count: data ? counts[t.key] : null, alert: t.key === 'todo' && counts.todo ? 'warning' : null }))} />
        <Card pad={isMobile ? 14 : 20}>
          {error && <p role="alert" style={{ margin: 0, fontSize: 13.5, color: TONES.danger.fg }}>{error}</p>}
          {!data && !error && <p style={{ margin: 0, fontSize: 13.5, color: MUTED }}>Loading...</p>}
          {data && <SessionRows sessions={shown} showProvider={manager} isMobile={isMobile} />}
        </Card>
      </div>
    </div>
  );
}

// The chart's Session notes tab (EI patients): this child's sessions for a
// month, and each provider's service log as a PDF.
export function SessionNotesChartTab({ patient, headerStyle, boxStyle }) {
  const isMobile = useIsMobile(900);
  const [month, setMonth] = useState(monthKey());
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let alive = true;
    api.getSessionNotes(month, { patientId: patient.id })
      .then(d => { if (alive) { setData(d); setError(null); } })
      .catch(err => { if (alive) { setData(null); setError(err.message); } });
    return () => { alive = false; };
  }, [month, patient.id]);
  const providers = [...new Set((data?.sessions || []).map(s => s.provider))];
  const printLog = async (prov) => {
    try {
      const log = await api.getServiceLog(patient.id, prov, month);
      if (!log.rows.length) { window.alert(`No sessions with ${prov} have been signed by the parent in ${monthLabel(month)}.`); return; }
      openBlob(await buildServiceLogPdf(log));
    } catch (err) { window.alert(err.message); }
  };
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <p style={headerStyle}>Session notes</p>
        <MonthNav month={month} setMonth={setMonth} />
      </div>
      <div style={boxStyle}>
        {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: TONES.danger.fg }}>{error}</p>}
        {!data && !error && <p style={{ margin: 0, fontSize: 13, color: MUTED }}>Loading...</p>}
        {data && <SessionRows sessions={[...data.sessions].reverse()} showProvider showChild={false} isMobile={isMobile} />}
        {providers.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: `1px solid ${HAIRLINE}` }}>
            {providers.map(p => <button key={p} type="button" onClick={() => printLog(p)} style={buttonStyle('secondary')}>Service log · {p}</button>)}
          </div>
        )}
      </div>
    </>
  );
}

const Check = ({ checked, onChange, disabled, children }) => (
  <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13.5, color: INK, cursor: disabled ? 'default' : 'pointer', padding: '3px 0' }}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} style={{ marginTop: 3 }} />
    <span>{children}</span>
  </label>
);
const Question = ({ n, title, children }) => (
  <div style={{ paddingTop: 14, marginTop: 14, borderTop: `1px solid ${HAIRLINE}` }}>
    <p style={{ fontSize: 13.5, fontWeight: 600, color: INK, margin: '0 0 8px' }}>{n ? `${n}. ` : ''}{title}</p>
    {children}
  </div>
);
const toggle = (list, v, on) => (on ? [...new Set([...(list || []), v])] : (list || []).filter(x => x !== v));
const blank = { location: '', delivery: 'in_person', participants: ['child', 'parent'], participants_other: '', outcome_ids: [], outcomes_text: '', narrative: '', parent_methods: [], parent_methods_other: '', strategies: '' };
const fromNote = (n, session) => (n ? {
  location: n.location || '', delivery: n.delivery || '', participants: n.participants || [], participants_other: n.participants_other || '',
  outcome_ids: n.outcome_ids || [], outcomes_text: n.outcomes_text || '', narrative: n.narrative || '', parent_methods: n.parent_methods || [],
  parent_methods_other: n.parent_methods_other || '', strategies: n.strategies || '',
} : { ...blank, location: session.location || '' });

// Full-screen panel the provider hands to the parent: name, relationship,
// and two drawn signatures (the session note and the service log). Above
// everything (chat, tasks): the parent mustn't see the provider's app.
function ParentSignPanel({ data, onDone, onCancel }) {
  const { session } = data;
  const [name, setName] = useState(session.parent_hint?.name || '');
  const [relationship, setRelationship] = useState(session.parent_hint?.relationship || '');
  const [noteSig, setNoteSig] = useState(null);
  const [logSig, setLogSig] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.parentSignSessionNote({ key: session.key, parent_name: name, relationship, note_signature: noteSig, log_signature: logSig });
      onDone();
    } catch (err) { setError(err.message); setBusy(false); }
  };
  const when = `${dayLabel(session.date)}, ${fmtTime(session.start_time)} to ${fmtTime(session.end_time)}`;
  return (
    <div role="dialog" aria-modal="true" aria-label="Parent signature" style={{ position: 'fixed', inset: 0, zIndex: 10050, background: 'white', overflowY: 'auto', fontFamily: FONT }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 18px 40px' }}>
        <h2 style={{ fontSize: 20, margin: '0 0 6px', color: INK }}>Please sign for today's session</h2>
        <p style={{ fontSize: 15, color: INK, margin: '0 0 18px', lineHeight: 1.5 }}>
          {session.header.child_name} · {SERVICE_LABEL[session.service] || session.service} with {session.header.interventionist}<br />{when}
        </p>
        <label htmlFor="ps-name" style={eiLabel}>Your name</label>
        <input id="ps-name" value={name} onChange={e => setName(e.target.value)} style={{ ...eiInput, marginBottom: 12 }} />
        <label htmlFor="ps-rel" style={eiLabel}>Relationship to the child</label>
        <input id="ps-rel" value={relationship} onChange={e => setRelationship(e.target.value)} placeholder="e.g. Mother, Grandmother, Babysitter, Child care teacher" style={{ ...eiInput, marginBottom: 18 }} />
        <p style={{ fontSize: 14, fontWeight: 600, color: INK, margin: '0 0 6px' }}>1. Session note</p>
        <p style={{ fontSize: 13, color: MUTED, margin: '0 0 6px' }}>I took part in this session and received a copy of the note, or will.</p>
        <SignaturePad value={noteSig} onChange={setNoteSig} />
        <p style={{ fontSize: 14, fontWeight: 600, color: INK, margin: '18px 0 6px' }}>2. Service log</p>
        <p style={{ fontSize: 13, color: MUTED, margin: '0 0 6px' }}>I verify the service was delivered on the date and at the time above.</p>
        <SignaturePad value={logSig} onChange={setLogSig} />
        {error && <p role="alert" style={{ fontSize: 13.5, color: TONES.danger.fg, margin: '12px 0 0' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button type="button" disabled={busy || !noteSig || !logSig} onClick={submit} style={buttonStyle('primary', { padding: '10px 18px', fontSize: 15 })}>{busy ? 'Saving...' : 'Sign'}</button>
          <button type="button" disabled={busy} onClick={onCancel} style={buttonStyle('secondary', { padding: '10px 18px', fontSize: 15 })}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// /session-notes/note?key=...: write, sign and print one session's note.
export function SessionNotePage() {
  const [params] = useSearchParams();
  const key = params.get('key') || '';
  const isMobile = useIsMobile(900);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [parentSigning, setParentSigning] = useState(false);
  const [providerSig, setProviderSig] = useState(null);
  const [license, setLicense] = useState('');
  const [addendum, setAddendum] = useState('');

  const load = useCallback(() => api.getSessionNote(key)
    .then(d => { setData(d); setError(null); setForm(fromNote(d.note, d.session)); setDirty(!d.note && d.can_write); setLicense(d.note?.provider_license || d.session.header.license || ''); })
    .catch(err => setError(err.message)), [key]);
  useEffect(() => { load(); }, [load]);

  if (error) return <div style={{ padding: 28, fontFamily: FONT }}><p role="alert" style={{ color: TONES.danger.fg, fontSize: 14 }}>{error}</p><Link to="/session-notes">Back to session notes</Link></div>;
  if (!data || !form) return <p style={{ padding: 28, fontFamily: FONT, color: MUTED, fontSize: 13.5 }}>Loading...</p>;

  const { session, note, addenda } = data;
  const locked = !!(note && (note.provider_signed_at || note.parent_signed_at));
  const editable = data.can_write && !locked;
  const set = (patch) => { setForm(f => ({ ...f, ...patch })); setDirty(true); };
  const h = note?.header || session.header;
  const cancelled = note ? note.cancelled : session.cancelled;
  // A signed note shows the outcomes as they were when it was signed.
  const outcomeList = note?.header?.outcomes || session.outcomes;

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const r = await api.saveSessionNote({ key, ...form });
      setData(d => ({ ...d, note: r.note, status: r.status, missing: r.missing }));
      setDirty(false);
      return r;
    } catch (err) { setSaveError(err.message); return false; } finally { setSaving(false); }
  };
  const providerSign = async () => {
    if (dirty && !(await save())) return;
    setSaving(true);
    setSaveError(null);
    try { await api.providerSignSessionNote({ key, signature: providerSig, license }); setProviderSig(null); await load(); } catch (err) { setSaveError(err.message); }
    setSaving(false);
  };
  // The parent only gets the device once the note is complete (they sign
  // what's written).
  const startParent = async () => {
    const left = dirty ? (await save())?.missing : data.missing;
    if (!left || left.length) return;
    setParentSigning(true);
  };
  const addAddendum = async () => {
    try { const r = await api.addSessionNoteAddendum(key, addendum); setData(d => ({ ...d, addenda: r.addenda })); setAddendum(''); } catch (err) { window.alert(err.message); }
  };
  const pdf = async () => { try { openBlob(await buildSessionNotePdf(data)); } catch (err) { window.alert(err.message); } };
  const serviceLog = async () => {
    try { openBlob(await buildServiceLogPdf(await api.getServiceLog(session.patient_id, session.provider, session.date.slice(0, 7)))); } catch (err) { window.alert(err.message); }
  };
  const missing = dirty ? null : data.missing;
  const st = STATUS[data.status] || STATUS.none;
  const ta = (k, rows = 4, placeholder) => (
    <textarea value={form[k]} disabled={!editable} onChange={e => set({ [k]: e.target.value })} rows={rows} placeholder={placeholder}
      style={{ ...eiInput, resize: 'vertical', lineHeight: 1.45, background: editable ? 'white' : '#FAFAFA' }} />
  );
  const row = (l, v) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, padding: '5px 0', borderBottom: `1px solid ${HAIRLINE}` }}>
      <span style={{ color: MUTED }}>{l}</span><span style={{ color: INK, fontWeight: 500, textAlign: 'right', overflowWrap: 'anywhere' }}>{v || '—'}</span>
    </div>
  );

  return (
    <div style={{ background: PAGE_BG, fontFamily: FONT, minHeight: '100%' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: isMobile ? '18px 14px 60px' : '28px 28px 72px' }}>
        <Link to="/session-notes" style={{ fontSize: 13, color: 'var(--brand-primary)' }}>← Session notes</Link>
        <PageHeader title={`${h.child_name} · ${dayLabel(session.date)}`} isMobile={isMobile} actions={(
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Tag tone={st.tone}>{st.text}</Tag>
            {locked && <button type="button" onClick={pdf} style={buttonStyle('secondary')}>PDF</button>}
            {note?.parent_signed_at && <button type="button" onClick={serviceLog} style={buttonStyle('secondary')}>Service log</button>}
          </div>
        )} />

        <Card pad={isMobile ? 14 : 20}>
          {cancelled && (
            <p style={{ margin: '0 0 12px', fontSize: 13.5, color: TONES.warning.fg, fontWeight: 600 }}>
              Canceled session ({session.status}). Give the reason in 1. Must be made up by {fmtDate(note?.makeup_by || session.makeup_by)}.
            </p>
          )}
          {(note?.makeup_for_date || session.makeup_for_date) && <p style={{ margin: '0 0 12px', fontSize: 13.5, color: INK }}>Make-up for the missed session on {fmtDate(note?.makeup_for_date || session.makeup_for_date)}.</p>}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', columnGap: 24 }}>
            <div>
              {row('Child (as in EI-Hub)', h.child_name)}
              {row('DOB · Sex', [fmtDate(h.date_of_birth), h.sex === 'F' ? 'Female' : h.sex === 'M' ? 'Male' : null].filter(Boolean).join(' · '))}
              {row('EI #', h.ei_number)}
              {row('ICD-10', h.icd10)}
              {row('Codes', [...(h.cpt_codes || []), ...(h.hcpcs_codes || [])].join(', '))}
            </div>
            <div>
              {row('Interventionist', [h.interventionist, h.credentials].filter(Boolean).join(', '))}
              {row('NPI', h.npi)}
              {row('Service', SERVICE_LABEL[session.service] || session.service)}
              {row('Time', `${fmtTime(session.start_time)} to ${fmtTime(session.end_time)}`)}
              {row('IFSP', session.ifsp ? session.ifsp.type : 'None in effect on this date')}
            </div>
          </div>
          {!h.ei_number || !h.npi ? <p style={{ fontSize: 12.5, color: TONES.warning.fg, margin: '8px 0 0' }}>Missing details above come from the child's EI details and the provider's EI-Hub setup. Ask the office to fill them in.</p> : null}

          {!cancelled && (
            <Question title="Session">
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                <div>
                  <span style={eiLabel}>IFSP service location</span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {Object.entries(LOCATION_LABEL).map(([v, l]) => (
                      <button key={v} type="button" disabled={!editable} aria-pressed={form.location === v} onClick={() => set({ location: v })} style={choiceStyle(form.location === v)}>{l}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <span style={eiLabel}>Session delivered</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {Object.entries(DELIVERY_LABEL).map(([v, l]) => (
                      <button key={v} type="button" disabled={!editable} aria-pressed={form.delivery === v} onClick={() => set({ delivery: v })} style={choiceStyle(form.delivery === v)}>{l}</button>
                    ))}
                  </div>
                </div>
              </div>
              <span style={{ ...eiLabel, marginTop: 12 }}>Who took part</span>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                {Object.entries(PARTICIPANT_LABEL).map(([v, l]) => (
                  <Check key={v} checked={form.participants.includes(v)} disabled={!editable} onChange={on => set({ participants: toggle(form.participants, v, on) })}>{l}</Check>
                ))}
                {form.participants.includes('other') && (
                  <input aria-label="Who else took part" value={form.participants_other} disabled={!editable} onChange={e => set({ participants_other: e.target.value })}
                    placeholder="e.g. sibling, child care teacher" style={{ ...eiInput, width: 'auto', flex: '1 1 200px' }} />
                )}
              </div>
            </Question>
          )}

          <Question n={1} title={cancelled ? 'Why was the session canceled?' : 'IFSP outcome(s) and developmental step(s) addressed during this session'}>
            {!cancelled && (outcomeList.length
              ? outcomeList.map(o => (
                <Check key={o.id} checked={form.outcome_ids.includes(o.id)} disabled={!editable} onChange={on => set({ outcome_ids: toggle(form.outcome_ids, o.id, on) })}>
                  <strong>Outcome {o.number}:</strong> {o.outcome}{o.services?.length ? <span style={{ color: MUTED }}> · {o.services.join(', ')}</span> : null}
                </Check>
              ))
              : <p style={{ fontSize: 12.5, color: MUTED, margin: '0 0 6px' }}>No IFSP outcomes are entered for this date (chart → IFSP). Write the outcomes and steps below.</p>)}
            <div style={{ marginTop: 6 }}>{ta('outcomes_text', 2, cancelled ? 'e.g. Child sick; parent called at 8 AM' : 'Developmental steps worked on (e.g. 1a, 1b), or anything to add')}</div>
          </Question>

          {!cancelled && (
            <>
              <Question n={2} title="What happened during today's session and the progress made toward the IFSP outcome(s)">
                <p style={{ fontSize: 12.5, color: MUTED, margin: '0 0 6px' }}>Include the routine activity and the strategies used. When available, include the parent's feedback on using the strategies between sessions.</p>
                {ta('narrative', 7)}
              </Question>
              <Question n={3} title="How did you work with the parent/caregiver?">
                {Object.entries(METHOD_LABEL).map(([v, l]) => (
                  <Check key={v} checked={form.parent_methods.includes(v)} disabled={!editable} onChange={on => set({ parent_methods: toggle(form.parent_methods, v, on) })}>{l}</Check>
                ))}
                {form.parent_methods.includes('other') && <div style={{ marginTop: 4 }}>{ta('parent_methods_other', 2, 'Describe (or, if the parent didn\'t take part, why and how you tried to include them)')}</div>}
              </Question>
              <Question n={4} title="What strategies/activities did you and the parent/caregiver agree to do between visits?">
                {ta('strategies', 4)}
              </Question>
            </>
          )}

          {editable && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 16, flexWrap: 'wrap' }}>
              <button type="button" disabled={saving || !dirty} onClick={save} style={buttonStyle('secondary')}>{saving ? 'Saving...' : dirty ? 'Save draft' : 'Saved'}</button>
              {saveError && <span role="alert" style={{ fontSize: 13, color: TONES.danger.fg }}>{saveError}</span>}
            </div>
          )}
        </Card>

        <Card pad={isMobile ? 14 : 20} style={{ marginTop: 16 }} title="Signatures">
          {missing && missing.length > 0 && data.can_write && !locked && (
            <div style={{ fontSize: 13, color: TONES.warning.fg, marginBottom: 12 }}>
              Before signing, fill in:
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{missing.map(m => <li key={m}>{m}</li>)}</ul>
            </div>
          )}
          {!cancelled && (
            <div style={{ paddingBottom: 12, marginBottom: 12, borderBottom: `1px solid ${HAIRLINE}` }}>
              <p style={{ fontSize: 13.5, fontWeight: 600, color: INK, margin: '0 0 6px' }}>Parent or caregiver</p>
              {note?.parent_signed_at ? (
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                  <img src={note.parent_note_signature} alt="Parent's signature on the note" style={{ height: 46, border: `1px solid ${HAIRLINE}`, borderRadius: 6, background: 'white' }} />
                  <img src={note.parent_log_signature} alt="Parent's signature on the service log" style={{ height: 46, border: `1px solid ${HAIRLINE}`, borderRadius: 6, background: 'white' }} />
                  <span style={{ fontSize: 13, color: INK }}>{note.parent_name} · {note.parent_relationship}<br /><span style={{ color: MUTED }}>{new Date(note.parent_signed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></span>
                </div>
              ) : data.can_write ? (
                <button type="button" disabled={saving || (!dirty && missing?.length > 0)} onClick={startParent} style={buttonStyle('primary')}>Hand to parent to sign</button>
              ) : <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Not signed yet.</p>}
            </div>
          )}
          <p style={{ fontSize: 13.5, fontWeight: 600, color: INK, margin: '0 0 6px' }}>Interventionist</p>
          {note?.provider_signed_at ? (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <img src={note.provider_signature} alt="Interventionist's signature" style={{ height: 46, border: `1px solid ${HAIRLINE}`, borderRadius: 6, background: 'white' }} />
              <span style={{ fontSize: 13, color: INK }}>{h.interventionist}{h.credentials ? `, ${h.credentials}` : ''} · License # {note.provider_license}<br /><span style={{ color: MUTED }}>{new Date(note.provider_signed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></span>
            </div>
          ) : data.can_write ? (
            <div style={{ maxWidth: 460 }}>
              <label htmlFor="sn-license" style={eiLabel}>License / certification # (or "certified")</label>
              <input id="sn-license" value={license} onChange={e => setLicense(e.target.value)} style={{ ...eiInput, marginBottom: 10 }} />
              <SignaturePad value={providerSig} onChange={setProviderSig} />
              <p style={{ fontSize: 12.5, color: MUTED, margin: '6px 0 10px' }}>Signing locks the note. Corrections after that are added as addenda.</p>
              <button type="button" disabled={saving || !providerSig || (!dirty && missing?.length > 0)} onClick={providerSign} style={buttonStyle('primary')}>Sign note</button>
              {saveError && <p role="alert" style={{ fontSize: 13, color: TONES.danger.fg, margin: '8px 0 0' }}>{saveError}</p>}
            </div>
          ) : <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Not signed yet.</p>}
        </Card>

        {locked && (
          <Card pad={isMobile ? 14 : 20} style={{ marginTop: 16 }} title="Addenda">
            {addenda.length === 0 && <p style={{ fontSize: 13, color: MUTED, margin: '0 0 8px' }}>None.</p>}
            {addenda.map(a => (
              <div key={a.id} style={{ fontSize: 13.5, color: INK, padding: '8px 0', borderBottom: `1px solid ${HAIRLINE}` }}>
                <div style={{ fontSize: 12, color: MUTED, marginBottom: 2 }}>{a.signed_name || a.signed_by} · {new Date(a.signed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{a.body}</div>
              </div>
            ))}
            {data.can_write && (
              <div style={{ marginTop: 10 }}>
                <textarea aria-label="New addendum" value={addendum} onChange={e => setAddendum(e.target.value)} rows={3} placeholder="Correction or addition, e.g. The session ended at 4:05 PM, not 4:00 PM."
                  style={{ ...eiInput, resize: 'vertical' }} />
                <button type="button" disabled={!addendum.trim()} onClick={addAddendum} style={buttonStyle('secondary', { marginTop: 8 })}>Add signed addendum</button>
              </div>
            )}
          </Card>
        )}
      </div>
      {parentSigning && <ParentSignPanel data={data} onCancel={() => setParentSigning(false)} onDone={() => { setParentSigning(false); load(); }} />}
    </div>
  );
}
