import { useState, useEffect } from 'react';
import { api } from './api';
import { timeTypeStyle } from './timeTypes';

// PTO / UPTO balance history from the time-off ledger: weekly PTO credits
// (with the hours worked they're based on), monthly UPTO, time off used and
// refunded, admin adjustments, the 120-hour cap and year-end carryover.
// `username`: whose (admins); omitted = your own. `refreshKey` reloads it.

const KIND_LABEL = {
  accrual: 'Earned',
  used: 'Used',
  refund: 'Given back',
  adjustment: 'Adjusted',
  cap: 'Cap',
  carryover: 'Year-end carryover',
  reset: 'Balance restarted',
};
const INK = '#241A33';
const MUTED = '#6B6280';
const HAIRLINE = '#E7E2F3';

const fmtDate = (s) => new Date(`${String(s).slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const weekLabel = (start) => `Week of ${new Date(`${String(start).slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

function describe(e) {
  if (e.kind === 'accrual' && e.balance_type === 'PTO' && e.period_start) {
    return { title: `${weekLabel(e.period_start)} · ${e.worked_hours ?? 0}h worked`, sub: e.note };
  }
  return { title: KIND_LABEL[e.kind] || e.kind, sub: e.note };
}

function DayBreakdown({ details }) {
  const days = details?.days || [];
  if (!days.length) return null;
  return (
    <div style={{ margin: '8px 0 2px', display: 'grid', gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`, gap: 6 }}>
      {days.map(d => (
        <div key={d.date} title={(d.notes || []).join(', ')} style={{ background: '#FAF9FD', border: `1px solid ${HAIRLINE}`, borderRadius: 8, padding: '6px 4px', textAlign: 'center' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: MUTED, letterSpacing: '0.04em' }}>{new Date(`${d.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: INK }}>{d.worked}h</div>
          <div style={{ fontSize: 10, color: MUTED }}>
            {d.closed ? 'closed' : d.noPatients ? 'no patients seen' : d.off ? `−${d.off}h off` : ''}{d.overtime ? ` +${d.overtime}h OT` : ''}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TimeOffHistory({ username, refreshKey = 0, limit = 12 }) {
  const [type, setType] = useState('PTO');
  const [entries, setEntries] = useState(null);
  const [open, setOpen] = useState(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let alive = true;
    api.getTimeOffLedger(username, type)
      .then(list => { if (alive) setEntries(list || []); })
      .catch(() => { if (alive) setEntries([]); });
    return () => { alive = false; };
  }, [username, type, refreshKey]);

  const shown = entries ? (showAll ? entries : entries.slice(0, limit)) : [];
  const s = timeTypeStyle(type);

  return (
    <div>
      <div role="tablist" aria-label="Balance" style={{ display: 'inline-flex', padding: 3, borderRadius: 10, background: '#F3F0FA', gap: 2, marginBottom: 12 }}>
        {['PTO', 'UPTO'].map(t => (
          <button key={t} type="button" role="tab" aria-selected={t === type} onClick={() => { setType(t); setOpen(null); setShowAll(false); }}
            style={{ padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, background: t === type ? 'white' : 'transparent', color: t === type ? '#6D28D9' : MUTED, boxShadow: t === type ? '0 1px 3px rgba(36,26,51,0.12)' : 'none' }}>
            {t}
          </button>
        ))}
      </div>
      {entries === null && <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Loading history...</p>}
      {entries && entries.length === 0 && (
        <div style={{ textAlign: 'center', padding: '22px 12px', border: `1.5px dashed ${HAIRLINE}`, borderRadius: 12, color: MUTED, fontSize: 13 }}>
          No {type} history yet.
        </div>
      )}
      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {shown.map(e => {
          const { title, sub } = describe(e);
          const positive = e.hours > 0;
          const zero = e.hours === 0;
          const canOpen = !!e.details?.days?.length;
          return (
            <li key={e.id} style={{ borderTop: `1px solid ${HAIRLINE}`, padding: '10px 0' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ width: 84, flexShrink: 0, fontSize: 12, color: MUTED, paddingTop: 1 }}>{fmtDate(e.entry_date)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {canOpen ? (
                    <button type="button" onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={open === e.id}
                      style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', font: 'inherit', fontSize: 13.5, fontWeight: 700, color: INK, textAlign: 'left' }}>
                      {title} <span style={{ fontSize: 11, color: '#6D28D9', fontWeight: 600 }}>{open === e.id ? 'Hide days' : 'Show days'}</span>
                    </button>
                  ) : (
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>{title}</div>
                  )}
                  {sub && <div style={{ fontSize: 12, color: MUTED, marginTop: 1 }}>{sub}</div>}
                  {open === e.id && <DayBreakdown details={e.details} />}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: zero ? MUTED : positive ? '#067647' : '#B42318' }}>{positive ? '+' : ''}{e.hours}h</div>
                  <div style={{ fontSize: 11.5, color: MUTED }}>Balance {e.balance_after}h</div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {entries && entries.length > limit && (
        <button type="button" onClick={() => setShowAll(v => !v)} style={{ marginTop: 6, border: 'none', background: 'none', color: s.accent, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', padding: 0 }}>
          {showAll ? 'Show less' : `Show all ${entries.length}`}
        </button>
      )}
    </div>
  );
}
