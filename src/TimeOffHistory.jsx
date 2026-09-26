import { useState, useEffect } from 'react';
import { api } from './api';
import { useIsMobile } from './useIsMobile';
import { UnderlineTabs } from './dashboardUi';
import { INK, MUTED, SUBTLE, HAIRLINE, NUMERIC, buttonStyle } from './uiTokens';

// PTO / UPTO balance history from the time-off ledger: weekly PTO credits
// (with the hours worked they're based on), monthly UPTO, time off used,
// admin adjustments, the 120-hour cap and year-end carryover.
// `username`: whose (admins); omitted = your own. `refreshKey` reloads it.

const KIND_LABEL = {
  accrual: 'Credited',
  used: 'Time off taken',
  refund: 'Returned',
  adjustment: 'Adjusted by an admin',
  cap: 'Cap',
  carryover: 'Year-end carryover',
  reset: 'Balance restarted',
};

const fmtDate = (s) => new Date(`${String(s).slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const weekLabel = (start) => `Week of ${new Date(`${String(start).slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
const signed = (h) => `${h > 0 ? '+' : h < 0 ? '−' : ''}${Math.abs(h)} h`;

function describe(e) {
  if (e.kind === 'accrual' && e.balance_type === 'PTO' && e.period_start) {
    return { title: `${weekLabel(e.period_start)}: ${e.worked_hours ?? 0} h worked`, sub: e.note };
  }
  return { title: KIND_LABEL[e.kind] || e.kind, sub: e.note };
}

function DayBreakdown({ details }) {
  const days = details?.days || [];
  if (!days.length) return null;
  const cell = { padding: '6px 10px', fontSize: 12.5, borderTop: `1px solid ${HAIRLINE}`, textAlign: 'left', ...NUMERIC };
  return (
    <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: 520, margin: '8px 0 4px', border: `1px solid ${HAIRLINE}`, borderRadius: 6 }}>
      <thead>
        <tr>
          {['Day', 'Scheduled', 'Off', 'Extra', 'Worked'].map(h => <th key={h} style={{ ...cell, borderTop: 'none', color: MUTED, fontWeight: 500, background: '#FAFAFA' }}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {days.map(d => (
          <tr key={d.date}>
            <td style={cell}>{new Date(`${d.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</td>
            <td style={cell}>{d.scheduled !== undefined ? `${d.scheduled} h` : '–'}</td>
            <td style={{ ...cell, color: MUTED }}>{d.closed ? 'Office closed' : d.noPatients ? 'No patients seen' : d.off ? `${d.off} h` : '–'}</td>
            <td style={{ ...cell, color: MUTED }}>{d.overtime ? `${d.overtime} h` : '–'}</td>
            <td style={{ ...cell, fontWeight: 600 }}>{d.worked} h</td>
          </tr>
        ))}
      </tbody>
    </table>
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
  // Phones: description (with the date under it), then change over balance.
  const isMobile = useIsMobile(640);
  const columns = isMobile ? 'minmax(0, 1fr) 72px' : '100px minmax(0, 1fr) 80px 90px';

  return (
    <div>
      <UnderlineTabs
        label="Balance"
        active={type}
        onPick={(t) => { setType(t); setOpen(null); setShowAll(false); }}
        tabs={[{ key: 'PTO', label: 'PTO' }, { key: 'UPTO', label: 'UPTO' }]}
      />
      {entries === null && <p style={{ fontSize: 13, color: MUTED, margin: '12px 0 0' }}>Loading...</p>}
      {entries && entries.length === 0 && <p style={{ fontSize: 13.5, color: MUTED, margin: '14px 0 0' }}>No {type} history yet.</p>}
      {shown.length > 0 && !isMobile && (
        <div style={{ display: 'grid', gridTemplateColumns: columns, gap: 12, padding: '10px 0 6px', fontSize: 12, color: MUTED, borderBottom: `1px solid ${HAIRLINE}` }}>
          <span>Date</span><span>Description</span><span style={{ textAlign: 'right' }}>Change</span><span style={{ textAlign: 'right' }}>Balance</span>
        </div>
      )}
      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {shown.map(e => {
          const { title, sub } = describe(e);
          const canOpen = !!e.details?.days?.length;
          return (
            <li key={e.id} style={{ borderBottom: `1px solid ${HAIRLINE}`, padding: '10px 0' }}>
              <div style={{ display: 'grid', gridTemplateColumns: columns, gap: 12, alignItems: 'baseline' }}>
                {!isMobile && <span style={{ fontSize: 12.5, color: MUTED, ...NUMERIC }}>{fmtDate(e.entry_date)}</span>}
                <span style={{ minWidth: 0 }}>
                  {isMobile && <span style={{ display: 'block', fontSize: 12, color: MUTED, ...NUMERIC }}>{fmtDate(e.entry_date)}</span>}
                  <span style={{ fontSize: 13.5, color: INK }}>{title}</span>
                  {canOpen && (
                    <button type="button" onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={open === e.id} style={buttonStyle('text', { fontSize: 12.5, marginLeft: 4 })}>
                      {open === e.id ? 'Hide details' : 'Details'}
                    </button>
                  )}
                  {sub && <span style={{ display: 'block', fontSize: 12.5, color: MUTED, marginTop: 1 }}>{sub}</span>}
                </span>
                {isMobile ? (
                  <span style={{ textAlign: 'right', ...NUMERIC }}>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 500, color: e.hours === 0 ? SUBTLE : e.hours > 0 ? '#067647' : '#B42318' }}>{signed(e.hours)}</span>
                    <span style={{ display: 'block', fontSize: 12, color: MUTED }}>{e.balance_after} h</span>
                  </span>
                ) : (
                  <>
                    <span style={{ textAlign: 'right', fontSize: 13.5, fontWeight: 500, color: e.hours === 0 ? SUBTLE : e.hours > 0 ? '#067647' : '#B42318', ...NUMERIC }}>{signed(e.hours)}</span>
                    <span style={{ textAlign: 'right', fontSize: 13.5, color: INK, ...NUMERIC }}>{e.balance_after} h</span>
                  </>
                )}
              </div>
              {open === e.id && <div style={{ paddingLeft: isMobile ? 0 : 112, overflowX: 'auto' }}><DayBreakdown details={e.details} /></div>}
            </li>
          );
        })}
      </ol>
      {entries && entries.length > limit && (
        <button type="button" onClick={() => setShowAll(v => !v)} style={buttonStyle('text', { marginTop: 8, marginLeft: -6, fontSize: 12.5 })}>
          {showAll ? 'Show fewer' : `Show all ${entries.length} entries`}
        </button>
      )}
    </div>
  );
}
