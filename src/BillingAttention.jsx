import { useState, useEffect, useMemo } from 'react';
import { api } from './api';
import { Tag } from './dashboardUi';
import { choiceStyle, INK, MUTED, HAIRLINE, NUMERIC, TONES } from './uiTokens';

// Billing > Needs attention (the "mandates" feature, Oct 2026; API GET
// /billing/attention): everything across the clinic that needs someone to
// act, most urgent first -- EI make-ups due soon or missed, make-ups that
// break the rules (not billable), 4+ absences in a row, missing EI-Hub
// authorizations, weeks short of or over the mandate, sessions no payroll
// total counts, sheets not reviewed. A provider sees their own.

const TYPES = {
  absence_streak: 'Absences in a row',
  makeup_problem: 'Make-up not billable',
  makeup_expired: 'Make-up missed',
  makeups_over_auth: 'Over make-up authorization',
  makeup_due_soon: 'Make-up due soon',
  check_authorization: 'Check authorization',
  over_mandate: 'Over the mandate',
  short_week: 'Short week',
  not_counted: 'Not counted',
  not_reviewed: 'Not reviewed',
};
const short = (ymd) => (ymd ? new Date(`${String(ymd).slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');

export default function BillingAttention({ month }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [type, setType] = useState('all');

  useEffect(() => {
    let alive = true;
    api.getBillingAttention(month)
      .then(d => { if (alive) { setData(d); setError(null); } })
      .catch(err => { if (alive) { setData(null); setError(err.message); } });
    return () => { alive = false; };
  }, [month]);

  const counts = useMemo(() => {
    const c = {};
    for (const i of data?.issues || []) c[i.type] = (c[i.type] || 0) + 1;
    return c;
  }, [data]);

  if (error) return <p role="alert" style={{ fontSize: 13, color: TONES.danger.fg }}>{error}</p>;
  if (!data) return <p style={{ fontSize: 13, color: MUTED }}>Loading...</p>;

  const issues = data.issues.filter(i => type === 'all' || i.type === type);
  const sections = [
    ['danger', 'Act now', issues.filter(i => i.severity === 'danger')],
    ['warning', 'Check', issues.filter(i => i.severity !== 'danger')],
  ].filter(([, , list]) => list.length);

  return (
    <div style={{ background: 'white', border: `1px solid ${HAIRLINE}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${HAIRLINE}` }}>
        <button type="button" onClick={() => setType('all')} style={choiceStyle(type === 'all')}>All {data.issues.length}</button>
        {Object.entries(TYPES).filter(([k]) => counts[k]).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setType(k)} style={choiceStyle(type === k)}>{label} {counts[k]}</button>
        ))}
      </div>
      {sections.length === 0 && <p style={{ fontSize: 13.5, color: MUTED, margin: 0, padding: '18px 16px' }}>Nothing needs attention this month.</p>}
      {sections.map(([sev, title, list]) => (
        <section key={sev}>
          <h3 style={{ fontSize: 12.5, fontWeight: 600, color: TONES[sev].fg, margin: 0, padding: '10px 16px 6px', background: '#FAFAFA', borderBottom: `1px solid ${HAIRLINE}` }}>{title} · {list.length}</h3>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {list.map((i, n) => (
              <li key={`${i.type}-${n}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2, padding: '10px 16px', borderBottom: `1px solid ${HAIRLINE}`, fontSize: 13.5, color: INK }}>
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <Tag tone={sev}>{TYPES[i.type] || i.type}</Tag>
                  {i.patient_name && <strong style={{ fontWeight: 600 }}>{i.patient_name}{i.service ? ` · ${i.service}` : ''}</strong>}
                  {i.date && <span style={{ color: MUTED, fontSize: 12.5, ...NUMERIC }}>{short(i.date)}</span>}
                </span>
                <span>{i.text}</span>
                {i.providers?.length > 0 && <span style={{ fontSize: 12.5, color: MUTED }}>{i.providers.join(', ')}</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
