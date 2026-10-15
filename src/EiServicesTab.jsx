import { useEffect, useState } from 'react';
import { api } from './api';
import { DateField, dateToInputValue } from './pages/SchedulePage';
import { eiInput, eiLabel } from './eiHubUi';
import { TONES, buttonStyle, choiceStyle } from './uiTokens';
import { DISCIPLINES as SERVICES, DISCIPLINE_NAMES } from './disciplines';

// The patient chart's Services tab (the "ei" feature, PedsDesk only; Kieran,
// Oct 2026; API routes/eiServices.js): an EI child's mandates and
// authorizations per service, with their dates, in one place.
//   - New mandate from a date: a real change. The current one ends the day
//     before; earlier sessions keep it.
//   - Correct: fixes an entry in place, dates included (a wrong start date
//     used to mean deleting and entering it again). The entry next to it
//     moves to match.
//   - Authorizations: auth #, start and end, Basic / Facility, visits.
//     Entered here or imported from EI-Hub; billing uses the one covering
//     each session's date.
// The office edits everything; a provider corrects and changes mandates for
// their own services (never sees auth #s). The patient form's EI tab shows
// this read-only.

const MUTED = 'var(--brand-muted)';
const INK = 'var(--brand-ink)';
const LINE = 'var(--brand-line)';
const ACCENT = 'var(--brand-primary)';
const RED = TONES.danger.fg;
const GREEN = TONES.success.fg;
const VISIT = { basic: 'Basic (home / community)', facility: 'Facility (at the agency)' };
const linkButton = { background: 'none', border: 'none', padding: 0, color: ACCENT, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
const fmt = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const span = (start, end) => `${start ? fmt(start) : 'From the beginning'} – ${end ? fmt(end) : 'now'}`;
const subhead = { margin: '12px 0 4px', fontSize: 12, fontWeight: 600, color: MUTED };
const row = { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '7px 0', borderTop: `1px solid ${LINE}`, fontSize: 13, color: INK };

function MandateForm({ initial, showEnd, startRequired, hint, saveLabel, onSave, onCancel }) {
  const [f, setF] = useState(initial);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await onSave(f); } catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <div style={{ padding: '10px 12px', margin: '6px 0', background: '#FAFAFA', border: `1px solid ${LINE}`, borderRadius: 6 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={eiLabel} htmlFor="m-sessions">Sessions a week</label>
          <input id="m-sessions" value={f.sessions} onChange={e => setF({ ...f, sessions: e.target.value })} placeholder="2 or 1-2" style={{ ...eiInput, width: 90 }} />
        </div>
        <div>
          <label style={eiLabel} htmlFor="m-minutes">Minutes</label>
          <input id="m-minutes" inputMode="numeric" value={f.minutes} onChange={e => setF({ ...f, minutes: e.target.value })} placeholder="30" style={{ ...eiInput, width: 80 }} />
        </div>
        <div>
          <span style={eiLabel}>Starts on</span>
          <DateField style={{ ...eiInput, width: 170 }} ariaLabel="Starts on" value={f.start_date || ''} clearable={!startRequired} placeholder={startRequired ? 'Select date' : 'From the beginning'} onChange={val => setF({ ...f, start_date: val || '' })} />
        </div>
        {showEnd && (
          <div>
            <span style={eiLabel}>Ends on</span>
            <DateField style={{ ...eiInput, width: 170 }} ariaLabel="Ends on" value={f.end_date || ''} onChange={val => setF({ ...f, end_date: val || '' })} />
          </div>
        )}
        <button type="button" disabled={busy || (startRequired && !f.start_date)} onClick={save} style={buttonStyle('primary')}>{saveLabel}</button>
        <button type="button" onClick={onCancel} style={buttonStyle('secondary')}>Cancel</button>
      </div>
      {hint && <p style={{ margin: '8px 0 0', fontSize: 12, color: MUTED }}>{hint}</p>}
      {error && <p role="alert" style={{ margin: '8px 0 0', fontSize: 13, color: RED }}>{error}</p>}
    </div>
  );
}

function AuthForm({ initial, isNew, onSave, onCancel }) {
  const [f, setF] = useState(initial);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await onSave(f); } catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <div style={{ padding: '10px 12px', margin: '6px 0', background: '#FAFAFA', border: `1px solid ${LINE}`, borderRadius: 6 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {isNew && (
          <div>
            <label style={eiLabel} htmlFor="a-number">Auth #</label>
            <input id="a-number" value={f.authorization_number} onChange={e => setF({ ...f, authorization_number: e.target.value })} style={{ ...eiInput, width: 130 }} />
          </div>
        )}
        <div>
          <span style={eiLabel}>Starts on</span>
          <DateField style={{ ...eiInput, width: 170 }} ariaLabel="Authorization starts on" value={f.start_date || ''} onChange={val => setF({ ...f, start_date: val || '' })} />
        </div>
        <div>
          <span style={eiLabel}>Ends on</span>
          <DateField style={{ ...eiInput, width: 170 }} ariaLabel="Authorization ends on" value={f.end_date || ''} onChange={val => setF({ ...f, end_date: val || '' })} />
        </div>
        <div>
          <span style={eiLabel}>Visit type</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['basic', 'Basic'], ['facility', 'Facility']].map(([k, l]) => (
              <button key={k} type="button" aria-pressed={f.visit_type === k} onClick={() => setF({ ...f, visit_type: f.visit_type === k ? '' : k })} style={choiceStyle(f.visit_type === k)}>{l}</button>
            ))}
          </div>
        </div>
        <div>
          <label style={eiLabel} htmlFor="a-visits">Visits (optional)</label>
          <input id="a-visits" inputMode="numeric" value={f.sessions_authorized ?? ''} onChange={e => setF({ ...f, sessions_authorized: e.target.value })} style={{ ...eiInput, width: 80 }} />
        </div>
        <button type="button" disabled={busy || !f.start_date || !f.end_date || (isNew && !f.authorization_number.trim())} onClick={save} style={buttonStyle('primary')}>{isNew ? 'Add' : 'Save correction'}</button>
        <button type="button" onClick={onCancel} style={buttonStyle('secondary')}>Cancel</button>
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 12, color: MUTED }}>Basic covers home and community visits, Facility visits at the agency. A child can hold both for one service at once.</p>
      {error && <p role="alert" style={{ margin: '8px 0 0', fontSize: 13, color: RED }}>{error}</p>}
    </div>
  );
}

function ServiceCard({ patientId, s, data, today, first, onChanged }) {
  const [form, setForm] = useState(null); // { kind: 'new-mandate' | 'correct-mandate' | 'new-auth' | 'correct-auth' | 'delete-mandate' | 'delete-auth', item }
  const [error, setError] = useState(null);
  const done = () => { setForm(null); setError(null); onChanged(); };
  const current = s.mandates.find(m => m.current);
  const authState = (a) => (a.end_date < today ? 'Ended' : a.start_date > today ? 'Upcoming' : 'Current');
  const remove = async (fn) => { try { await fn(); done(); } catch (err) { setError(err.message); } };
  return (
    <div style={{ padding: first ? '0 0 12px' : '12px 0', borderTop: first ? 'none' : `1px solid ${LINE}` }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>{s.service} <span style={{ fontWeight: 400, color: MUTED }}>{DISCIPLINE_NAMES[s.service] || ''}</span></div>
      {error && <p role="alert" style={{ margin: '6px 0 0', fontSize: 13, color: RED }}>{error}</p>}

      <p style={subhead}>Mandate</p>
      {!s.mandates.length && <p style={{ margin: 0, fontSize: 13, color: MUTED }}>No mandate entered.</p>}
      {s.mandates.map(m => (
        <div key={m.id}>
          <div style={row}>
            <strong style={{ minWidth: 70 }}>{m.sessions && m.minutes ? `${m.sessions}x${m.minutes}` : (m.legacy_mandate ? `Old: ${m.legacy_mandate}` : '—')}</strong>
            <span>{span(m.start_date, m.end_date)}</span>
            {m.current && <span style={{ color: GREEN }}>Current</span>}
            {m.authorization_number && !s.authorizations.length && <span style={{ color: MUTED }}>Auth # {m.authorization_number} (no dates)</span>}
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
              {s.can_edit && <button type="button" onClick={() => setForm({ kind: 'correct-mandate', item: m })} style={linkButton}>Correct</button>}
              {data.can_delete && (form?.kind === 'delete-mandate' && form.item.id === m.id ? (
                <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>Delete this?
                  <button type="button" onClick={() => remove(() => api.deletePatientProgram(patientId, m.id))} style={{ ...linkButton, color: RED }}>Delete</button>
                  <button type="button" onClick={() => setForm(null)} style={linkButton}>Keep</button>
                </span>
              ) : <button type="button" onClick={() => setForm({ kind: 'delete-mandate', item: m })} style={{ ...linkButton, color: MUTED }}>Delete</button>)}
            </span>
          </div>
          {form?.kind === 'correct-mandate' && form.item.id === m.id && (
            <MandateForm initial={{ sessions: m.sessions || '', minutes: m.minutes || '', start_date: m.start_date || '', end_date: m.end_date || '' }}
              showEnd={!m.current} startRequired={false} saveLabel="Save correction"
              hint="Fixes this entry as if it had been entered right. If its dates move, the entry next to it moves to match. Clear the start date for “from the beginning”."
              onCancel={() => setForm(null)}
              onSave={(f) => api.correctEiMandate(patientId, m.id, { ...f, start_date: f.start_date || null }).then(done)} />
          )}
        </div>
      ))}
      {s.can_edit && (form?.kind === 'new-mandate' ? (
        <MandateForm initial={{ sessions: current?.sessions || '', minutes: current?.minutes || '', start_date: '' }} startRequired={s.mandates.length > 0}
          saveLabel="Save" onCancel={() => setForm(null)}
          hint={current ? 'A real change (e.g. the IFSP changed the frequency): the current mandate ends the day before, and earlier sessions keep it.' : 'Leave the date empty for “from the beginning”.'}
          onSave={(f) => api.addEiMandate(patientId, { service: s.service, ...f, start_date: f.start_date || null }).then(done)} />
      ) : <button type="button" onClick={() => setForm({ kind: 'new-mandate' })} style={{ ...linkButton, marginTop: 6 }}>{s.mandates.length ? '+ New mandate from a date' : '+ Enter the mandate'}</button>)}

      {data.can_edit_authorizations && (
        <>
          <p style={subhead}>Authorizations</p>
          {!s.authorizations.length && <p style={{ margin: 0, fontSize: 13, color: MUTED }}>None entered. Billing needs one covering each session's date.</p>}
          {s.authorizations.map(a => (
            <div key={a.authorization_number}>
              <div style={row}>
                <strong style={{ minWidth: 110 }}>#{a.authorization_number}</strong>
                <span>{span(a.start_date, a.end_date)}</span>
                {a.visit_type && <span style={{ color: MUTED }}>{VISIT[a.visit_type]}</span>}
                {a.sessions_authorized !== null && <span style={{ color: MUTED }}>{a.sessions_authorized} visits{a.sessions_used !== null ? ` (${a.sessions_used} used)` : ''}</span>}
                <span style={{ color: authState(a) === 'Current' ? GREEN : MUTED }}>{authState(a)}</span>
                <span style={{ color: MUTED, fontSize: 12 }}>{a.by_hand ? 'Entered by hand' : 'From EI-Hub'}</span>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
                  <button type="button" onClick={() => setForm({ kind: 'correct-auth', item: a })} style={linkButton}>Correct</button>
                  {a.by_hand && (form?.kind === 'delete-auth' && form.item.authorization_number === a.authorization_number ? (
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>Delete this?
                      <button type="button" onClick={() => remove(() => api.deleteEiAuthorization(patientId, a.authorization_number))} style={{ ...linkButton, color: RED }}>Delete</button>
                      <button type="button" onClick={() => setForm(null)} style={linkButton}>Keep</button>
                    </span>
                  ) : <button type="button" onClick={() => setForm({ kind: 'delete-auth', item: a })} style={{ ...linkButton, color: MUTED }}>Delete</button>)}
                </span>
              </div>
              {form?.kind === 'correct-auth' && form.item.authorization_number === a.authorization_number && (
                <AuthForm initial={{ ...a, visit_type: a.visit_type || '' }} onCancel={() => setForm(null)}
                  onSave={(f) => api.correctEiAuthorization(patientId, a.authorization_number, f).then(done)} />
              )}
              {form?.kind === 'correct-auth' && form.item.authorization_number === a.authorization_number && !a.by_hand && (
                <p style={{ margin: '0 0 6px', fontSize: 12, color: MUTED }}>This one came from EI-Hub: the next import will replace it with what EI-Hub has.</p>
              )}
            </div>
          ))}
          {form?.kind === 'new-auth' ? (
            <AuthForm isNew initial={{ authorization_number: '', start_date: '', end_date: '', visit_type: '', sessions_authorized: '' }} onCancel={() => setForm(null)}
              onSave={(f) => api.addEiAuthorization(patientId, { ...f, service: s.service }).then(done)} />
          ) : <button type="button" onClick={() => setForm({ kind: 'new-auth' })} style={{ ...linkButton, marginTop: 6 }}>+ Add authorization</button>}
        </>
      )}
    </div>
  );
}

export default function EiServicesTab({ patient, headerStyle, boxStyle }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);
  const [adding, setAdding] = useState(null); // a service being added
  useEffect(() => {
    let alive = true;
    api.getEiServices(patient.id)
      .then(d => { if (alive) { setData(d); setError(null); } })
      .catch(err => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [patient.id, reload]);
  const today = dateToInputValue(new Date());
  const shown = new Set((data?.services || []).map(s => s.service));
  const canAdd = SERVICES.filter(s => !shown.has(s) && (data?.editable_services || []).includes(s) && !(data?.elsewhere || []).some(e => e.service === s));
  const refresh = () => { setAdding(null); setReload(n => n + 1); };
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <p style={headerStyle}>EI services</p>
        {canAdd.length > 0 && !adding && (
          <span style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 13, color: MUTED }}>
            Add a service:
            {canAdd.map(s => <button key={s} type="button" onClick={() => setAdding(s)} style={linkButton}>{s}</button>)}
          </span>
        )}
      </div>
      <div style={boxStyle}>
        {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: RED }}>{error}</p>}
        {!data && !error && <p style={{ margin: 0, fontSize: 13, color: MUTED }}>Loading...</p>}
        {data && (
          <>
            {data.ei_without_mandate && (
              <p style={{ margin: '0 0 8px', fontSize: 13, color: MUTED }}>EI with no mandate per service yet{data.ei_without_mandate.legacy_mandate ? ` (old mandate: ${data.ei_without_mandate.legacy_mandate})` : ''}. Enter each service's mandate below.</p>
            )}
            {data.elsewhere.length > 0 && (
              <p style={{ margin: '0 0 8px', fontSize: 13, color: MUTED }}>{data.elsewhere.map(e => `${e.service} is under ${e.program}`).join('; ')}. A service can only be under one program at a time: change that in the patient form.</p>
            )}
            {!data.services.length && !adding && <p style={{ margin: 0, fontSize: 13, color: MUTED }}>No EI services entered yet.</p>}
            {data.services.map((s, i) => <ServiceCard key={s.service} patientId={patient.id} s={s} data={data} today={today} first={i === 0} onChanged={refresh} />)}
            {adding && (
              <div style={{ padding: '12px 0', borderTop: data.services.length ? `1px solid ${LINE}` : 'none' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: INK }}>{adding}</div>
                <MandateForm initial={{ sessions: '', minutes: '', start_date: '' }} startRequired={false} saveLabel="Save"
                  hint="Leave the date empty for “from the beginning”. Add its authorizations once it's saved."
                  onCancel={() => setAdding(null)}
                  onSave={(f) => api.addEiMandate(patient.id, { service: adding, ...f, start_date: f.start_date || null }).then(refresh)} />
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
