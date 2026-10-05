import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from './api';
import { Tag } from './dashboardUi';
import { INK, MUTED, SUBTLE, HAIRLINE, NUMERIC, TONES, buttonStyle } from './uiTokens';
import { employmentLabel } from './employment';

// Admin time off > Balances: every active employee's employment type, PTO
// balance and UPTO used this year (GET /time-off/balances/all). Only salaried
// staff have PTO; UPTO is unlimited, so it's a count, not a balance (Oct 2026
// policy). Click a PTO balance to set a new total, with an optional reason;
// it goes through the same PUT /time-off/balances as a staff profile's
// Adjust, so it shows in their Balance history as an adjustment.
// `nameQuery` is the board's name filter; `onChanged` lets the request lists
// refresh their balance notes.

const fmt = (h) => `${Math.round(Number(h) * 100) / 100} h`;
// Before the employment migration the API sends no type: old behaviour.
const typeOf = (r) => r.employment_type || 'salaried';

function BalanceEditor({ row, type, onDone, onCancel }) {
  const current = row.pto;
  const [value, setValue] = useState(String(current));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const n = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(n);
  const diff = valid ? Math.round((n - current) * 100) / 100 : 0;

  const save = async () => {
    if (!valid) { setError('Enter a number of hours.'); return; }
    if (diff === 0) { onCancel(); return; }
    setSaving(true); setError(null);
    try {
      await api.setTimeOffBalance(row.username, type, n, note.trim());
      onDone(`${row.display_name}'s ${type} is now ${fmt(n)}.`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };
  const input = { boxSizing: 'border-box', padding: '6px 8px', fontSize: 13, fontFamily: 'inherit', border: `1px solid ${HAIRLINE}`, borderRadius: 6, color: INK };

  return (
    <div style={{ padding: '4px 0 12px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12.5, color: MUTED }}>New {type} total</span>
      <input
        type="number" step="0.25" inputMode="decimal" autoFocus value={value} aria-label={`New ${type} total for ${row.display_name}`}
        onChange={e => setValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onCancel(); }}
        style={{ ...input, width: 90, ...NUMERIC }}
      />
      <span style={{ fontSize: 12.5, color: diff > 0 ? TONES.success.fg : diff < 0 ? TONES.danger.fg : SUBTLE, minWidth: 60, ...NUMERIC }}>
        {valid && diff !== 0 ? `${diff > 0 ? '+' : '−'}${Math.abs(diff)} h` : 'no change'}
      </span>
      <input
        value={note} onChange={e => setNote(e.target.value)} maxLength={200} placeholder="Reason (optional)" aria-label="Reason"
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onCancel(); }}
        style={{ ...input, flex: '1 1 200px', maxWidth: 320 }}
      />
      <button type="button" onClick={save} disabled={saving} style={buttonStyle('primary', { fontSize: 12.5, padding: '6px 12px' })}>{saving ? 'Saving...' : 'Save'}</button>
      <button type="button" onClick={onCancel} disabled={saving} style={buttonStyle('secondary', { fontSize: 12.5, padding: '6px 12px' })}>Cancel</button>
      {error && <span style={{ flexBasis: '100%', fontSize: 12.5, color: TONES.danger.fg }}>{error}</span>}
    </div>
  );
}

export default function TimeOffBalancesBoard({ nameQuery = '', isMobile, onChanged }) {
  const [data, setData] = useState(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // { username, type }
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    let alive = true;
    api.getAllTimeOffBalances()
      .then(r => { if (alive) { setData(r); setError(null); } })
      .catch(err => { if (alive) { setData(d => d || { rows: [] }); setError(err.message); } });
    return () => { alive = false; };
  }, [version]);

  const rows = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    return (data?.rows || []).filter(r => !q || r.display_name.toLowerCase().includes(q) || r.username.toLowerCase().includes(q));
  }, [data, nameQuery]);
  const totals = useMemo(() => rows.reduce((t, r) => ({ pto: t.pto + (typeOf(r) === 'salaried' ? r.pto : 0), upto: t.upto + Number(r.upto_used_this_year || 0) }), { pto: 0, upto: 0 }), [rows]);
  const cap = data?.balance_cap ?? 120;

  if (!data) return <p style={{ fontSize: 13, color: MUTED }}>Loading balances...</p>;

  const done = (message) => { setEditing(null); setNotice(message); setVersion(v => v + 1); onChanged?.(); };
  const isEditing = (r, type) => editing && editing.username === r.username && editing.type === type;

  const dash = <span style={{ fontSize: 13, color: SUBTLE }}>—</span>;
  const pendingNote = (h) => h > 0 && <span style={{ fontSize: 11.5, color: TONES.warning.fg, marginTop: 2, ...NUMERIC }}>{fmt(h)} pending</span>;
  const uptoCell = (r) => {
    if (typeOf(r) === 'neither') return dash;
    return (
      <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: isMobile ? 'flex-start' : 'flex-end' }}>
        <span style={{ fontSize: 13.5, color: INK, ...NUMERIC }}>{fmt(r.upto_used_this_year || 0)}</span>
        {pendingNote(r.pending_upto)}
      </span>
    );
  };
  const balanceCell = (r, type) => {
    if (typeOf(r) !== 'salaried') return dash;
    const h = r.pto;
    const pending = r.pending_pto;
    return (
      <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: isMobile ? 'flex-start' : 'flex-end' }}>
        <button
          type="button" onClick={() => { setNotice(null); setEditing({ username: r.username, type }); }}
          title={`Change ${r.display_name}'s ${type} total`} aria-label={`${type} ${fmt(h)}, change`}
          style={{
            background: isEditing(r, type) ? '#F4F4F5' : 'none', border: `1px solid ${isEditing(r, type) ? HAIRLINE : 'transparent'}`, borderRadius: 4,
            padding: '2px 6px', margin: '-3px -7px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 500,
            color: h < 0 ? TONES.danger.fg : INK, textDecoration: 'underline dotted', textDecorationColor: SUBTLE, textUnderlineOffset: 3, ...NUMERIC,
          }}
        >
          {fmt(h)}
        </button>
        {pendingNote(pending)}
      </span>
    );
  };

  const cols = isMobile ? 'minmax(0, 1fr) 84px 84px' : 'minmax(0, 1fr) 120px 120px 160px';
  const head = { fontSize: 12, color: MUTED, fontWeight: 500 };
  const right = { textAlign: isMobile ? 'left' : 'right' };

  return (
    <div>
      <p style={{ fontSize: 12.5, color: MUTED, margin: '10px 0 0', ...NUMERIC }}>
        {rows.length} employee{rows.length === 1 ? '' : 's'} · {fmt(Math.round(totals.pto * 100) / 100)} PTO held · {fmt(Math.round(totals.upto * 100) / 100)} UPTO used in {new Date().getFullYear()}.
        {' '}Click a PTO balance to change it. Set employment types and balances as of a date on each profile.
      </p>
      {error && <p role="alert" style={{ fontSize: 13, color: TONES.danger.fg, margin: '8px 0 0' }}>{error}</p>}
      {notice && <p role="status" style={{ fontSize: 12.5, color: TONES.success.fg, fontWeight: 600, margin: '8px 0 0' }}>{notice}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, padding: '12px 0 7px', borderBottom: `1px solid ${HAIRLINE}` }}>
        <span style={head}>Employee</span>
        {!isMobile && <span style={head}>Type</span>}
        <span style={{ ...head, ...right }}>PTO</span>
        <span style={{ ...head, ...right }}>UPTO used {isMobile ? '' : `in ${new Date().getFullYear()}`}</span>
      </div>
      {rows.length === 0 && <p style={{ fontSize: 13.5, color: MUTED, margin: '16px 0' }}>{nameQuery.trim() ? 'No employees match that name.' : 'No active employees.'}</p>}
      {rows.map(r => (
        <div key={r.username} style={{ borderBottom: `1px solid ${HAIRLINE}` }}>
          <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, alignItems: 'center', padding: '9px 0' }}>
            <span style={{ minWidth: 0 }}>
              <Link to={`/admin/staff/${encodeURIComponent(r.username)}`} style={{ fontSize: 13.5, fontWeight: 500, color: INK, textDecoration: 'none' }}>{r.display_name}</Link>
              {typeOf(r) === 'salaried' && r.pto >= cap && <span style={{ marginLeft: 6 }}><Tag tone="warning" title={`PTO balances can't go over ${cap} h`}>At cap</Tag></span>}
              {isMobile && <span style={{ display: 'block', fontSize: 12, color: MUTED }}>{employmentLabel(typeOf(r))}</span>}
            </span>
            {!isMobile && <span style={{ fontSize: 13, color: MUTED }}>{employmentLabel(typeOf(r))}</span>}
            <span style={right}>{balanceCell(r, 'PTO')}</span>
            <span style={right}>{uptoCell(r)}</span>
          </div>
          {editing && editing.username === r.username && (
            <BalanceEditor key={editing.type} row={r} type={editing.type} onDone={done} onCancel={() => setEditing(null)} />
          )}
        </div>
      ))}
    </div>
  );
}

