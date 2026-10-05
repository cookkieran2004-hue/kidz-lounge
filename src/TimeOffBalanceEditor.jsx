import { useState, useEffect } from 'react';
import { api } from './api';
import { timeTypeStyle } from './timeTypes';
import { DateField, dateToInputValue } from './pages/SchedulePage';
import { INK, MUTED, HAIRLINE, NUMERIC, TONES, buttonStyle } from './uiTokens';

// A staff member's time off allowances (Oct 2026 policy, kidz-lounge-api
// lib/employment.js):
//   salaried -> PTO balance + UPTO
//   hourly   -> UPTO only
//   neither  -> neither
// PTO: set "as of" a date (the app subtracts approved PTO taken since), or
// Adjust to set the balance directly. UPTO: unlimited; only the hours used
// this year are shown. Used on staff profiles (Time off > Balances).

const card = { border: `1px solid ${HAIRLINE}`, borderRadius: 8, padding: '14px 16px', background: 'white' };
const input = { boxSizing: 'border-box', padding: '7px 9px', fontSize: 13, fontFamily: 'inherit', border: `1px solid ${HAIRLINE}`, borderRadius: 6, color: INK };
const TYPE_LABEL = { salaried: 'Salaried', hourly: 'Hourly', neither: 'Neither' };

export default function TimeOffBalanceEditor({ username, onSaved }) {
  const [data, setData] = useState(null); // { pto, policy }
  const [version, setVersion] = useState(0);
  const [mode, setMode] = useState(null); // 'asof' | 'adjust'
  const [hours, setHours] = useState('');
  const [asOf, setAsOf] = useState('2026-09-30');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([api.getTimeOffBalancesFor(username), api.getTimeOffPolicy(username)])
      .then(([b, policy]) => { if (alive) setData({ pto: Number((b || []).find(x => x.balance_type === 'PTO')?.balance_hours ?? 0), policy }); })
      .catch(() => { if (alive) setData({ pto: 0, policy: null }); });
    return () => { alive = false; };
  }, [username, version]);

  if (!data) return null;
  const type = data.policy?.employment_type || 'salaried';
  const usedUpto = Number(data.policy?.upto_used_this_year ?? 0);
  const year = new Date().getFullYear();

  const open = (m) => { setMode(m); setError(null); setNotice(null); setHours(m === 'adjust' ? String(data.pto) : ''); };
  const save = async () => {
    const n = Number(hours);
    if (hours === '' || !Number.isFinite(n)) { setError('Enter a number of hours.'); return; }
    setSaving(true); setError(null);
    try {
      if (mode === 'asof') {
        const r = await api.setPtoAsOf(username, n, asOf);
        const asOfLabel = new Date(`${asOf}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        setNotice(r.used_since
          ? `Set to ${n} h as of ${asOfLabel}, less ${r.used_since} h of PTO taken since: ${r.balance_hours} h now.`
          : `Set to ${n} h as of ${asOfLabel}. No PTO taken since: ${r.balance_hours} h now.`);
      } else {
        await api.setTimeOffBalance(username, 'PTO', n);
        setNotice(`PTO balance set to ${n} h.`);
      }
      setMode(null); setVersion(v => v + 1); onSaved?.();
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  };

  const pto = timeTypeStyle('PTO');
  const upto = timeTypeStyle('UPTO');
  const head = (style, label, tag) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: MUTED }}>
        <span style={{ width: 9, height: 9, borderRadius: 2, background: style.border }} />{label}
      </span>
      {tag && <span style={{ fontSize: 11.5, color: MUTED }}>{tag}</span>}
    </div>
  );

  return (
    <div>
      <p style={{ fontSize: 13, color: MUTED, margin: '0 0 10px' }}>
        Employment type: <strong style={{ color: INK, fontWeight: 600 }}>{TYPE_LABEL[type]}</strong>
        {type === 'neither' && ' · no PTO or UPTO. Change it under Account and role.'}
        {type === 'hourly' && ' · UPTO only.'}
      </p>
      {type !== 'neither' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {type === 'salaried' && (
            <div style={card}>
              {head(pto, 'PTO balance', null)}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, ...NUMERIC }}>
                <span style={{ fontSize: 26, fontWeight: 600, color: data.pto < 0 ? TONES.danger.fg : INK }}>{data.pto}</span>
                <span style={{ fontSize: 12.5, color: MUTED }}>hours · ≈ {(data.pto / 8).toFixed(1)} days</span>
              </div>
              {!mode && (
                <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => open('asof')} style={buttonStyle('secondary', { fontSize: 12.5, padding: '5px 10px' })}>Set as of a date</button>
                  <button type="button" onClick={() => open('adjust')} style={buttonStyle('text', { fontSize: 12.5 })}>Adjust</button>
                </div>
              )}
              {mode && (
                <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                  {mode === 'asof' && (
                    <div>
                      <span style={{ display: 'block', fontSize: 12, color: MUTED, marginBottom: 3 }}>Balance as of</span>
                      <DateField value={asOf} onChange={v => setAsOf(v || dateToInputValue(new Date()))} max={dateToInputValue(new Date())} style={{ ...input, width: '100%' }} ariaLabel="Balance as of date" />
                    </div>
                  )}
                  <label style={{ display: 'block' }}>
                    <span style={{ display: 'block', fontSize: 12, color: MUTED, marginBottom: 3 }}>{mode === 'asof' ? 'PTO hours on that date' : 'New PTO balance (hours)'}</span>
                    <input type="number" step="0.25" min="0" max="120" inputMode="decimal" autoFocus value={hours} onChange={e => setHours(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setMode(null); }} style={{ ...input, width: 120, ...NUMERIC }} />
                  </label>
                  {mode === 'asof' && <span style={{ fontSize: 12, color: MUTED }}>Approved PTO taken from that date on is subtracted automatically.</span>}
                  {error && <span role="alert" style={{ fontSize: 12.5, color: TONES.danger.fg }}>{error}</span>}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" onClick={save} disabled={saving} style={buttonStyle('primary', { fontSize: 12.5, padding: '5px 12px' })}>{saving ? 'Saving...' : 'Save'}</button>
                    <button type="button" onClick={() => setMode(null)} disabled={saving} style={buttonStyle('secondary', { fontSize: 12.5, padding: '5px 12px' })}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}
          <div style={card}>
            {head(upto, 'UPTO', 'Unlimited')}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, ...NUMERIC }}>
              <span style={{ fontSize: 26, fontWeight: 600, color: INK }}>{usedUpto}</span>
              <span style={{ fontSize: 12.5, color: MUTED }}>hours used in {year}</span>
            </div>
          </div>
        </div>
      )}
      {notice && <p role="status" style={{ fontSize: 12.5, color: TONES.success.fg, margin: '8px 0 0' }}>{notice}</p>}
    </div>
  );
}
