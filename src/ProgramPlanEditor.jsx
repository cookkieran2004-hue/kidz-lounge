import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { api } from './api';
import { useAuth } from './AuthContext';
import { canManage } from './roles';
import { choiceStyle, buttonStyle, HAIRLINE, TONES } from './uiTokens';
import { DateField, dateToInputValue } from './pages/SchedulePage';
import { MANDATE_SERVICES, MINUTE_OPTIONS, mandateLabel, planFromRows, planKey, takesAuthorization, isFirstChange, BILLING_CODES, takesBillingCode, planPayload, sessionsProblem } from './programPlan';

// Program chips for the patient form. Clicking a program opens its mandate:
// which services it covers, each as sessions per week x minutes. A service
// can only be under one program at a time. `plan` / `onChange` as in
// src/programPlan.js; `childServices` (the patient's Services) are listed
// first; `legacyMandate` is the old free-text mandate, shown until
// per-service mandates are entered.

const PRIMARY = 'var(--brand-primary)';
const BORDER = '#E4E4E7';
const MUTED = '#71717A';
const INK = '#18181B';

export default function ProgramPlanEditor({ options, plan, onChange, childServices = [], legacyMandate, showAuth = true }) {
  const [editing, setEditing] = useState(null); // program name
  const selected = new Set(plan.map(p => p.program));
  const ownerOf = (service, except) => plan.find(p => p.program !== except && p.mandates.some(m => m.service === service))?.program;

  const save = (program, { mandates, billing_code }) => {
    const next = plan.some(p => p.program === program)
      ? plan.map(p => (p.program === program ? { ...p, mandates, billing_code } : p))
      : [...plan, { program, mandates, billing_code }];
    onChange(next);
    setEditing(null);
  };
  const remove = (program) => { onChange(plan.filter(p => p.program !== program)); setEditing(null); };
  const hasMandates = plan.some(p => p.mandates.length);

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map(opt => {
          const on = selected.has(opt);
          return (
            <button key={opt} type="button" onClick={() => setEditing(opt)}
              aria-pressed={on} style={choiceStyle(on)}>
              {opt}
            </button>
          );
        })}
      </div>
      {plan.length > 0 && (
        <div style={{ marginTop: 10, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
          {plan.map((p, i) => (
            <div key={p.program} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: i ? `1px solid ${BORDER}` : 'none', fontSize: 13 }}>
              <strong style={{ color: INK, minWidth: 90 }}>{p.program}</strong>
              <span style={{ color: p.mandates.length ? INK : MUTED, flex: 1 }}>
                {takesBillingCode(p.program) && <strong style={{ marginRight: 8, color: p.billing_code ? INK : '#B42318' }}>{p.billing_code || '#'}</strong>}
                {p.mandates.length ? p.mandates.map(mandateLabel).join(' · ') : (p.legacy ? `Old mandate: ${p.legacy}` : 'No mandate entered')}
              </span>
              <button type="button" onClick={() => setEditing(p.program)} style={{ border: 'none', background: 'none', color: PRIMARY, fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>Edit</button>
            </div>
          ))}
        </div>
      )}
      {!hasMandates && legacyMandate && plan.every(p => !p.legacy) && (
        <p style={{ fontSize: 12, color: MUTED, margin: '6px 0 0' }}>Old mandate: {legacyMandate}. Click a program to enter its mandate per service.</p>
      )}
      {editing && (
        <MandateDialog
          program={editing}
          initial={plan.find(p => p.program === editing)?.mandates || []}
          initialCode={plan.find(p => p.program === editing)?.billing_code || ''}
          isSelected={selected.has(editing)}
          childServices={childServices}
          showAuth={showAuth}
          ownerOf={(s) => ownerOf(s, editing)}
          onSave={(m) => save(editing, m)}
          onRemove={() => remove(editing)}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// When a program/mandate change applies. Normally from a date (earlier
// appointments keep the old program for billing). For a patient's first
// change, while they only have the old free-text mandate, it can instead
// replace the old mandate for all dates (`replaceAll`).
export function ChangeStartChoice({ firstChange, replaceAll, onReplaceAll, effectiveFrom, onEffectiveFrom, inputStyle, label = 'Changes start on' }) {
  const box = { display: 'grid', gap: 8, marginTop: 10, padding: '10px 12px', background: '#FAFAFA', border: `1px solid ${HAIRLINE}`, borderRadius: 6, fontSize: 13, color: INK };
  const dateRow = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      <DateField style={{ ...inputStyle, width: 190 }} ariaLabel={label} value={effectiveFrom} onChange={onEffectiveFrom} />
    </span>
  );
  if (!firstChange) {
    return (
      <div style={box}>
        {dateRow}
        <span style={{ fontSize: 12, color: MUTED }}>Appointments before this date keep the old program and mandate.</span>
      </div>
    );
  }
  return (
    <div style={box} role="radiogroup" aria-label="When this applies">
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
        <input type="radio" name="kl-change-start" checked={replaceAll} onChange={() => onReplaceAll(true)} style={{ marginTop: 3 }} />
        <span><strong>Replace the old mandate for all dates</strong><br /><span style={{ fontSize: 12, color: MUTED }}>Past and future appointments use what you entered. Only possible for this first change.</span></span>
      </label>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
        <input type="radio" name="kl-change-start" checked={!replaceAll} onChange={() => onReplaceAll(false)} style={{ marginTop: 3 }} />
        <span style={{ display: 'grid', gap: 6 }}>
          <strong>Start on a date</strong>
          {!replaceAll && dateRow}
        </span>
      </label>
    </div>
  );
}

function MandateDialog({ program, initial, initialCode, isSelected, childServices, ownerOf, onSave, onRemove, onCancel, showAuth }) {
  const coded = takesBillingCode(program);
  // Providers don't see auth #s (the server keeps them as they are).
  const authorized = takesAuthorization(program) && showAuth;
  const [code, setCode] = useState(initialCode || '');
  const order = [...childServices.filter(s => MANDATE_SERVICES.includes(s)), ...MANDATE_SERVICES.filter(s => !childServices.includes(s))];
  const [rows, setRows] = useState(() => Object.fromEntries(order.map(s => {
    const m = initial.find(x => x.service === s);
    return [s, { on: !!m, sessions: m ? String(m.sessions) : '', minutes: m ? Number(m.minutes) : 30, authorization: m?.authorization || '' }];
  })));
  const [error, setError] = useState(null);
  const set = (s, patch) => setRows(r => ({ ...r, [s]: { ...r[s], ...patch } }));

  const submit = () => {
    const mandates = [];
    for (const s of order) {
      const r = rows[s];
      if (!r.on) continue;
      const sessions = r.sessions.replace(/\s+/g, '');
      if (!/^\d{1,2}(-\d{1,2})?$/.test(sessions)) { setError(`Enter sessions per week for ${s}, like 2 or 1-2.`); return; }
      mandates.push({ service: s, sessions, minutes: Number(r.minutes), ...(takesAuthorization(program) ? { authorization: r.authorization.trim() } : {}) });
    }
    onSave({ mandates, billing_code: coded ? code : '' });
  };
  const input = { padding: '7px 9px', borderRadius: 7, border: `1.5px solid ${BORDER}`, fontSize: 13.5, fontFamily: 'inherit', boxSizing: 'border-box', background: 'white' };

  return (
    <div onClick={(e) => { e.stopPropagation(); onCancel(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 10010, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="kl-mandate-title" onClick={e => e.stopPropagation()}
        style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 440, padding: 20, boxShadow: '0 20px 50px rgba(15,23,42,0.25)' }}>
        <h3 id="kl-mandate-title" style={{ margin: '0 0 12px', fontSize: 16, color: INK }}>{program} mandate</h3>
        {coded && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, fontSize: 13.5, fontWeight: 600, color: INK }}>
            Billing code
            <select value={code} onChange={e => setCode(e.target.value)} aria-label={`${program} billing code`}
              style={{ padding: '7px 9px', borderRadius: 7, border: `1.5px solid ${BORDER}`, fontSize: 13.5, fontFamily: 'inherit', background: 'white' }}>
              <option value="">Not set</option>
              {BILLING_CODES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {!code && <span style={{ fontSize: 12, fontWeight: 500, color: MUTED }}>Billing shows a red # until it's set.</span>}
          </label>
        )}
        {authorized && (
          <p style={{ margin: '0 0 10px', fontSize: 12, color: MUTED }}>Auth # is the EI-Hub authorization number for that service. A new number takes effect from the change date.</p>
        )}
        <div style={{ display: 'grid', gap: 8 }}>
          {order.map(s => {
            const owner = ownerOf(s);
            const r = rows[s];
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', opacity: owner ? 0.55 : 1 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, width: 64, fontWeight: 600, fontSize: 13.5, color: INK, cursor: owner ? 'not-allowed' : 'pointer' }}>
                  <input type="checkbox" checked={r.on} disabled={!!owner} onChange={e => set(s, { on: e.target.checked })} aria-label={`${program} covers ${s}`} />
                  {s}
                </label>
                {owner ? (
                  <span style={{ fontSize: 12.5, color: MUTED }}>Under {owner}</span>
                ) : r.on ? (
                  <>
                    <input value={r.sessions} onChange={e => set(s, { sessions: e.target.value })} placeholder="2" inputMode="numeric"
                      aria-label={`${s} sessions per week`} style={{ ...input, width: 64, textAlign: 'center' }} />
                    <span style={{ color: MUTED, fontSize: 13 }}>x</span>
                    <select value={r.minutes} onChange={e => set(s, { minutes: Number(e.target.value) })} aria-label={`${s} minutes`} style={input}>
                      {MINUTE_OPTIONS.map(m => <option key={m} value={m}>{m} min</option>)}
                    </select>
                    <span style={{ fontSize: 12, color: MUTED }}>per week</span>
                    {authorized && (
                      <input value={r.authorization} onChange={e => set(s, { authorization: e.target.value })} placeholder="Auth #" maxLength={40}
                        aria-label={`${s} EI authorization number`} style={{ ...input, width: 110 }} />
                    )}
                  </>
                ) : (
                  <span style={{ fontSize: 12.5, color: MUTED }}>Not covered</span>
                )}
              </div>
            );
          })}
        </div>
        {error && <p role="alert" style={{ color: '#B42318', fontSize: 12.5, margin: '10px 0 0' }}>{error}</p>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
          {isSelected && <button type="button" onClick={onRemove} style={{ border: 'none', background: 'none', color: '#B42318', fontWeight: 600, fontSize: 13, cursor: 'pointer', padding: 0 }}>Remove {program}</button>}
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onCancel} style={{ padding: '7px 14px', borderRadius: 7, border: `1.5px solid ${BORDER}`, background: 'white', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <button type="button" onClick={submit} style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: PRIMARY, color: 'white', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>{isSelected ? 'Save' : `Add ${program}`}</button>
        </div>
      </div>
    </div>
  );
}

// The same editor in its own window, for one patient -- used by the Patients
// data table's Program and Mandate cells. Loads their history, and on Save
// hands back { effective_from, programs } for the patient save.
export function ProgramPlanDialog({ patient, options, onSave, onClose }) {
  // EI auth #s: Reception, Admins and Developers only.
  const showAuth = canManage(useAuth().user);
  const [plan, setPlan] = useState(null);
  const [originalKey, setOriginalKey] = useState('[]');
  const [effectiveFrom, setEffectiveFrom] = useState(() => dateToInputValue(new Date()));
  const [firstChange, setFirstChange] = useState(false);
  const [replaceAll, setReplaceAll] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    api.getPatientPrograms(patient.id)
      .then(res => {
        if (!alive) return;
        let p = planFromRows(res?.rows || []);
        if (!p.length) p = String(patient.Program || '').split(',').map(s => s.trim()).filter(Boolean).map(program => ({ program, mandates: [], legacy: patient.Mandate || null }));
        setPlan(p);
        setOriginalKey(planKey(p));
        setFirstChange(isFirstChange(res?.rows));
      })
      .catch(err => { if (alive) { setPlan([]); setError(err.message); } });
    return () => { alive = false; };
  }, [patient]);

  const changed = plan && planKey(plan) !== originalKey;
  const save = async () => {
    const allDates = firstChange && replaceAll;
    if (!allDates && !effectiveFrom) { setError('Choose the date the changes start.'); return; }
    setSaving(true); setError(null);
    try {
      await onSave({ effective_from: allDates ? null : effectiveFrom, programs: planPayload(plan) });
      onClose();
    } catch (err) {
      setSaving(false);
      if (err.message !== 'PASSWORD_REQUIRED') setError(err.message);
      else onClose(); // the table asks for the password, then saves
    }
  };

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 10005, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="kl-plan-title" onClick={e => e.stopPropagation()}
        style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', padding: 20, boxShadow: '0 20px 50px rgba(15,23,42,0.25)' }}>
        <h3 id="kl-plan-title" style={{ margin: '0 0 14px', fontSize: 16, color: INK }}>{patient.Name}: programs and mandates</h3>
        {!plan ? (
          <p style={{ fontSize: 13, color: MUTED }}>Loading...</p>
        ) : (
          <ProgramPlanEditor options={options} plan={plan} onChange={setPlan} showAuth={showAuth}
            childServices={String(patient.Services || '').split(',').map(s => s.trim()).filter(Boolean)} legacyMandate={patient.Mandate} />
        )}
        {changed && (
          <ChangeStartChoice firstChange={firstChange} replaceAll={replaceAll} onReplaceAll={setReplaceAll}
            effectiveFrom={effectiveFrom} onEffectiveFrom={setEffectiveFrom}
            inputStyle={{ padding: '7px 9px', borderRadius: 7, border: `1.5px solid ${BORDER}`, fontSize: 13.5, boxSizing: 'border-box', background: 'white' }} />
        )}
        {error && <p role="alert" style={{ color: '#B42318', fontSize: 12.5, margin: '10px 0 0' }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" onClick={onClose} style={{ padding: '7px 14px', borderRadius: 7, border: `1.5px solid ${BORDER}`, background: 'white', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <button type="button" onClick={save} disabled={!changed || saving}
            style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: PRIMARY, color: 'white', fontWeight: 600, fontSize: 13, cursor: changed ? 'pointer' : 'default', opacity: changed && !saving ? 1 : 0.5 }}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ---- The patient form's program tabs (Oct 2026) ----
// The patient form (ManageDataPage.jsx PatientModal) gives each program its
// own tab: clicking a program chip adds it and opens its tab, which holds
// everything that program needs. Changes are part of the form and save with
// it (the same `plan` as above).

// The chips on the form's Patient tab. onPick(program): add it if needed and
// open its tab.
export function ProgramChips({ options, plan, onPick }) {
  const selected = new Set(plan.map(p => p.program));
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map(opt => {
        const on = selected.has(opt);
        return (
          <button key={opt} type="button" onClick={() => onPick(opt)}
            aria-pressed={on} style={choiceStyle(on)}>
            {opt}
          </button>
        );
      })}
    </div>
  );
}

// One program's tab: its billing code (insurance / P / PP), and per service
// sessions per week x minutes, plus the auth # for EI (not shown to
// providers). A service can only be under one program at a time. `children`
// goes below (the EI tab's IFSP and EI-Hub details).
// `mandateElsewhere`: the mandate is shown read-only with this note (the
// "ei" feature: an existing child's EI mandates and authorizations are
// changed and corrected on the chart's Services tab, src/EiServicesTab.jsx).
export function ProgramTab({ entry, plan, onChange, onRemove, childServices = [], showAuth, inputStyle, labelStyle, mandateElsewhere, children }) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const program = entry.program;
  const coded = takesBillingCode(program);
  const authorized = takesAuthorization(program) && showAuth;
  const order = [...childServices.filter(s => MANDATE_SERVICES.includes(s)), ...MANDATE_SERVICES.filter(s => !childServices.includes(s))];
  const ownerOf = (service) => plan.find(p => p.program !== program && p.mandates.some(m => m.service === service))?.program;
  const mandate = (s) => entry.mandates.find(m => m.service === s);
  const setMandate = (s, patch) => onChange({ ...entry, mandates: entry.mandates.map(m => (m.service === s ? { ...m, ...patch } : m)) });
  const toggle = (s, on) => onChange({
    ...entry,
    mandates: on
      ? [...entry.mandates, { service: s, sessions: '', minutes: 30, ...(takesAuthorization(program) ? { authorization: '' } : {}) }]
      : entry.mandates.filter(m => m.service !== s),
  });
  const sectionTitle = { fontSize: 13, fontWeight: 600, color: INK, margin: '0 0 8px' };
  return (
    <div>
      {coded && (
        <div style={{ marginBottom: 16 }}>
          <label htmlFor={`kl-code-${program}`} style={labelStyle}>Billing code</label>
          <select id={`kl-code-${program}`} value={entry.billing_code || ''} onChange={e => onChange({ ...entry, billing_code: e.target.value })} style={{ ...inputStyle, maxWidth: 200 }}>
            <option value="">Not set</option>
            {BILLING_CODES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {!entry.billing_code && <p style={{ fontSize: 12, color: MUTED, margin: '4px 0 0' }}>Billing shows a red # until it's set.</p>}
        </div>
      )}
      <p style={sectionTitle}>Mandate</p>
      {entry.legacy && !entry.mandates.length && <p style={{ fontSize: 12.5, color: MUTED, margin: '0 0 8px' }}>Old mandate: {entry.legacy}</p>}
      {mandateElsewhere ? (
        <div style={{ marginBottom: 18 }}>
          {entry.mandates.length ? entry.mandates.map(m => (
            <div key={m.service} style={{ fontSize: 13.5, color: INK, padding: '2px 0' }}><strong style={{ display: 'inline-block', width: 40 }}>{m.service}</strong>{m.sessions}x{m.minutes} per week</div>
          )) : !entry.legacy && <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>No mandate entered.</p>}
          <p style={{ fontSize: 12.5, color: MUTED, margin: '6px 0 0' }}>{mandateElsewhere}</p>
        </div>
      ) : (
      <>
      <div style={{ display: 'grid', gap: 8, marginBottom: 18 }}>
        {order.map(s => {
          const owner = ownerOf(s);
          const m = mandate(s);
          const problem = m && m.sessions !== '' ? sessionsProblem(m.sessions) : null;
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', opacity: owner ? 0.55 : 1 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, width: 64, fontWeight: 600, fontSize: 13.5, color: INK, cursor: owner ? 'not-allowed' : 'pointer' }}>
                <input type="checkbox" checked={!!m} disabled={!!owner} onChange={e => toggle(s, e.target.checked)} aria-label={`${program} covers ${s}`} />
                {s}
              </label>
              {owner ? (
                <span style={{ fontSize: 12.5, color: MUTED }}>Under {owner}</span>
              ) : m ? (
                <>
                  <input value={m.sessions} onChange={e => setMandate(s, { sessions: e.target.value })} placeholder="2" inputMode="numeric"
                    aria-label={`${s} sessions per week`} style={{ ...inputStyle, width: 64, textAlign: 'center', ...(problem ? { borderColor: '#B42318' } : {}) }} />
                  <span style={{ color: MUTED, fontSize: 13 }}>x</span>
                  <select value={m.minutes} onChange={e => setMandate(s, { minutes: Number(e.target.value) })} aria-label={`${s} minutes`} style={{ ...inputStyle, width: 'auto' }}>
                    {MINUTE_OPTIONS.map(x => <option key={x} value={x}>{x} min</option>)}
                  </select>
                  <span style={{ fontSize: 12, color: MUTED }}>per week</span>
                  {authorized && (
                    <input value={m.authorization || ''} onChange={e => setMandate(s, { authorization: e.target.value })} placeholder="Auth #" maxLength={40}
                      aria-label={`${s} EI authorization number`} style={{ ...inputStyle, width: 130 }} />
                  )}
                  {problem && <span role="alert" style={{ fontSize: 12, color: '#B42318', flexBasis: '100%', paddingLeft: 70 }}>{problem}</span>}
                </>
              ) : (
                <span style={{ fontSize: 12.5, color: MUTED }}>Not covered</span>
              )}
            </div>
          );
        })}
      </div>
      {authorized && <p style={{ margin: '-8px 0 18px', fontSize: 12, color: MUTED }}>Auth # is the EI-Hub authorization number for that service.</p>}
      </>
      )}
      {children}
      <div style={{ marginTop: 18, paddingTop: 12, borderTop: `1px solid ${HAIRLINE}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {confirmRemove ? (
          <>
            <span style={{ fontSize: 13, color: INK }}>Remove {program} from this patient?</span>
            <button type="button" onClick={onRemove} style={buttonStyle('danger')}>Remove</button>
            <button type="button" onClick={() => setConfirmRemove(false)} style={buttonStyle('secondary')}>Keep</button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirmRemove(true)} style={buttonStyle('text', { color: TONES.danger.fg, padding: 0 })}>Remove {program}</button>
        )}
      </div>
    </div>
  );
}
