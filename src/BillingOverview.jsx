import { useState, useEffect } from 'react';
import { api } from './api';
import { useStaffNames } from './staffDirectory';
import { Tag } from './dashboardUi';
import { INK, MUTED, SUBTLE, HAIRLINE, NUMERIC, TONES, buttonStyle } from './uiTokens';

// Billing > Overview (the "mandates" feature, Oct 2026; API GET
// /billing/overview): every provider's month on one screen, for payroll --
// their totals in 30-minute units (the same figures as their billing sheet),
// sessions, PTO / UPTO taken, sessions no total counts, and Reviewed. Click a
// provider to open their sheet. Reception, Admin and Developer see everyone
// plus the clinic's totals and Export for payroll; a provider sees their own
// row.

const fmt = (v) => {
  const n = Math.round(Number(v || 0) * 10) / 10;
  return n ? String(n) : '0';
};
const reviewedText = (r, nameFor) => (r ? `${nameFor(r.reviewed_by)}, ${new Date(r.reviewed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : '');

// One row per provider, then the clinic total; opens in Excel or Sheets.
function exportCsv(data, nameFor) {
  const cols = data.columns;
  const header = ['Provider', 'Discipline', ...cols.map(([, label]) => `${label} (units)`), 'Sessions', 'PTO hours', 'UPTO hours', 'Not counted', 'Reviewed by', 'Reviewed on'];
  const cell = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.map(cell).join(',')];
  for (const p of data.providers) {
    lines.push([
      p.provider, p.discipline || '', ...cols.map(([k]) => fmt(p.totals[k])), p.totals.sessions, fmt(p.time_off.PTO), fmt(p.time_off.UPTO),
      p.totals.missed.length, p.reviewed ? nameFor(p.reviewed.reviewed_by) : '', p.reviewed ? String(p.reviewed.reviewed_at).slice(0, 10) : '',
    ].map(cell).join(','));
  }
  lines.push(['Clinic total', '', ...cols.map(([k]) => fmt(data.clinic[k])), data.clinic.sessions, fmt(data.clinic.PTO), fmt(data.clinic.UPTO), '', '', ''].map(cell).join(','));
  const url = URL.createObjectURL(new Blob([`${lines.join('\n')}\n`], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url; a.download = `payroll-${data.month}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function BillingOverview({ month, manager, isMobile, onOpenProvider }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const nameFor = useStaffNames();

  useEffect(() => {
    let alive = true;
    api.getBillingOverview(month)
      .then(d => { if (alive) { setData(d); setError(null); } })
      .catch(err => { if (alive) { setData(null); setError(err.message); } });
    return () => { alive = false; };
  }, [month]);

  if (error) return <p role="alert" style={{ fontSize: 13, color: TONES.danger.fg }}>{error}</p>;
  if (!data) return <p style={{ fontSize: 13, color: MUTED }}>Loading overview...</p>;
  if (!data.providers.length) return <p style={{ fontSize: 13, color: MUTED }}>No sessions this month.</p>;

  const cols = data.columns;
  const reviewedCount = data.providers.filter(p => p.reviewed).length;
  const th = { padding: '8px 10px', fontSize: 11.5, fontWeight: 600, color: MUTED, textAlign: 'right', borderBottom: `1px solid ${HAIRLINE}`, background: '#FAFAFA', whiteSpace: 'nowrap' };
  const td = { padding: '0 10px', height: 40, fontSize: 13, color: INK, textAlign: 'right', borderBottom: `1px solid ${HAIRLINE}`, whiteSpace: 'nowrap' };
  const zero = (v) => (Number(v) ? INK : SUBTLE);

  const actions = manager && (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', padding: '12px 16px', borderBottom: `1px solid ${HAIRLINE}` }}>
      <span style={{ fontSize: 13, color: MUTED }}>
        {data.providers.length} providers · <span style={{ color: reviewedCount === data.providers.length ? TONES.success.fg : INK }}>{reviewedCount} reviewed</span>
      </span>
      <button type="button" onClick={() => exportCsv(data, nameFor)} style={buttonStyle('secondary')}>Export for payroll</button>
    </div>
  );

  if (isMobile) {
    return (
      <div style={{ background: 'white', border: `1px solid ${HAIRLINE}`, borderRadius: 12, overflow: 'hidden' }}>
        {actions}
        {data.providers.map(p => (
          <button key={p.provider} type="button" onClick={() => onOpenProvider(p.provider)}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', border: 'none', borderBottom: `1px solid ${HAIRLINE}`, background: 'white', cursor: 'pointer', fontFamily: 'inherit' }}>
            <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
              <strong style={{ fontSize: 14, color: INK }}>{p.provider}</strong>
              {p.reviewed ? <Tag tone="success">Reviewed</Tag> : <Tag>Not reviewed</Tag>}
            </span>
            <span style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 12.5, color: MUTED, ...NUMERIC }}>
              {cols.filter(([k]) => Number(p.totals[k])).map(([k, label]) => <span key={k}>{label} <strong style={{ color: INK }}>{fmt(p.totals[k])}</strong></span>)}
              {p.totals.missed.length > 0 && <span style={{ color: TONES.warning.fg }}>Not counted {p.totals.missed.length}</span>}
            </span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div style={{ background: 'white', border: `1px solid ${HAIRLINE}`, borderRadius: 12, overflow: 'hidden' }}>
      {actions}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', ...NUMERIC }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>Provider</th>
              {cols.map(([k, label]) => <th key={k} style={th} title="Sessions provided, in 30-minute units (45 min = 1.5, 60 min = 2)">{label}</th>)}
              <th style={th}>Sessions</th>
              <th style={th}>PTO h</th>
              <th style={th}>UPTO h</th>
              <th style={th} title="Sessions provided that no total counts (see the provider's sheet)">Not counted</th>
              <th style={{ ...th, textAlign: 'left' }}>Reviewed</th>
            </tr>
          </thead>
          <tbody>
            {data.providers.map(p => (
              <tr key={p.provider} onClick={() => onOpenProvider(p.provider)} style={{ cursor: 'pointer' }} title={`Open ${p.provider}'s billing sheet`}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 500 }}>
                  {p.provider}
                  {p.discipline && <span style={{ color: MUTED, fontWeight: 400, fontSize: 12, marginLeft: 6 }}>{p.discipline}</span>}
                </td>
                {cols.map(([k]) => <td key={k} style={{ ...td, color: zero(p.totals[k]) }}>{fmt(p.totals[k])}</td>)}
                <td style={{ ...td, fontWeight: 600 }}>{p.totals.sessions}</td>
                <td style={{ ...td, color: zero(p.time_off.PTO) }}>{fmt(p.time_off.PTO)}</td>
                <td style={{ ...td, color: zero(p.time_off.UPTO) }}>{fmt(p.time_off.UPTO)}</td>
                <td style={td}>{p.totals.missed.length ? <Tag tone="warning" title={p.totals.missed.map(m => `${m.patient_name}, day ${m.day}: ${m.reason}`).join('\n')}>{p.totals.missed.length}</Tag> : <span style={{ color: SUBTLE }}>0</span>}</td>
                <td style={{ ...td, textAlign: 'left' }}>
                  {p.reviewed ? <span style={{ color: TONES.success.fg }} title={reviewedText(p.reviewed, nameFor)}>Reviewed</span> : <span style={{ color: MUTED }}>Not yet</span>}
                </td>
              </tr>
            ))}
            {manager && (
              <tr>
                <td style={{ ...td, textAlign: 'left', fontWeight: 700, background: '#F4F4F5', borderTop: `2px solid ${INK}` }}>Clinic total</td>
                {cols.map(([k]) => <td key={k} style={{ ...td, fontWeight: 700, background: '#F4F4F5', borderTop: `2px solid ${INK}` }}>{fmt(data.clinic[k])}</td>)}
                <td style={{ ...td, fontWeight: 700, background: '#F4F4F5', borderTop: `2px solid ${INK}` }}>{data.clinic.sessions}</td>
                <td style={{ ...td, fontWeight: 700, background: '#F4F4F5', borderTop: `2px solid ${INK}` }}>{fmt(data.clinic.PTO)}</td>
                <td style={{ ...td, fontWeight: 700, background: '#F4F4F5', borderTop: `2px solid ${INK}` }}>{fmt(data.clinic.UPTO)}</td>
                <td colSpan={2} style={{ ...td, background: '#F4F4F5', borderTop: `2px solid ${INK}` }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
