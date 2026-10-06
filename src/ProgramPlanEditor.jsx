import { useState } from 'react';
import { MANDATE_SERVICES, MINUTE_OPTIONS, mandateLabel } from './programPlan';

// Program chips for the patient form. Clicking a program opens its mandate:
// which services it covers, each as sessions per week x minutes. A service
// can only be under one program at a time. `plan` / `onChange` as in
// src/programPlan.js; `childServices` (the patient's Services) are listed
// first; `legacyMandate` is the old free-text mandate, shown until
// per-service mandates are entered.

const PRIMARY = '#6D28D9';
const BORDER = '#E2E8F0';
const MUTED = '#64748B';
const INK = '#0F172A';

export default function ProgramPlanEditor({ options, plan, onChange, childServices = [], legacyMandate }) {
  const [editing, setEditing] = useState(null); // program name
  const selected = new Set(plan.map(p => p.program));
  const ownerOf = (service, except) => plan.find(p => p.program !== except && p.mandates.some(m => m.service === service))?.program;

  const save = (program, mandates) => {
    const next = plan.some(p => p.program === program)
      ? plan.map(p => (p.program === program ? { ...p, mandates } : p))
      : [...plan, { program, mandates }];
    onChange(next);
    setEditing(null);
  };
  const remove = (program) => { onChange(plan.filter(p => p.program !== program)); setEditing(null); };
  const hasMandates = plan.some(p => p.mandates.length);

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
        {options.map(opt => {
          const on = selected.has(opt);
          return (
            <button key={opt} type="button" onClick={() => setEditing(opt)}
              style={{
                padding: '6px 13px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                border: `1.5px solid ${on ? PRIMARY : BORDER}`, background: on ? PRIMARY : 'white', color: on ? 'white' : '#475569',
                display: 'inline-flex', alignItems: 'center', gap: 5,
              }}>
              {on && <span style={{ fontSize: 11, lineHeight: 1 }}>&#10003;</span>}
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
          isSelected={selected.has(editing)}
          childServices={childServices}
          ownerOf={(s) => ownerOf(s, editing)}
          onSave={(m) => save(editing, m)}
          onRemove={() => remove(editing)}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function MandateDialog({ program, initial, isSelected, childServices, ownerOf, onSave, onRemove, onCancel }) {
  const order = [...childServices.filter(s => MANDATE_SERVICES.includes(s)), ...MANDATE_SERVICES.filter(s => !childServices.includes(s))];
  const [rows, setRows] = useState(() => Object.fromEntries(order.map(s => {
    const m = initial.find(x => x.service === s);
    return [s, { on: !!m, sessions: m ? String(m.sessions) : '', minutes: m ? Number(m.minutes) : 30 }];
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
      mandates.push({ service: s, sessions, minutes: Number(r.minutes) });
    }
    onSave(mandates);
  };
  const input = { padding: '7px 9px', borderRadius: 7, border: `1.5px solid ${BORDER}`, fontSize: 13.5, fontFamily: 'inherit', boxSizing: 'border-box', background: 'white' };

  return (
    <div onClick={(e) => { e.stopPropagation(); onCancel(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 10010, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="kl-mandate-title" onClick={e => e.stopPropagation()}
        style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 440, padding: 20, boxShadow: '0 20px 50px rgba(15,23,42,0.25)' }}>
        <h3 id="kl-mandate-title" style={{ margin: '0 0 12px', fontSize: 16, color: INK }}>{program} mandate</h3>
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
