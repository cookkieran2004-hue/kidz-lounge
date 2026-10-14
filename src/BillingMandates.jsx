import { useState, useEffect, useMemo, Fragment } from 'react';
import { api } from './api';
import { Tag } from './dashboardUi';
import { choiceStyle, INK, MUTED, SUBTLE, HAIRLINE, NUMERIC, TONES } from './uiTokens';

// Billing > Mandates (the "mandates" feature, Oct 2026; API GET
// /billing/mandates, rules in kidz-lounge-api lib/mandates.js): each child
// and service against their mandate, one cell per Sunday-Saturday week --
// sessions credited of sessions owed. Click a row for the week's missed
// sessions and, for EI, each make-up's deadline (14 days, inside the
// authorization, not on a regular session's day) and EI-Hub's make-up
// allowance. A provider sees the children they saw.

const STATUS = {
  met: { tone: 'success', label: 'Met' },
  makeup_due: { tone: 'warning', label: 'Make-up due' },
  in_progress: { tone: 'accent', label: 'This week' },
  short: { tone: 'danger', label: 'Short' },
  upcoming: { tone: 'neutral', label: 'Coming up' },
  no_mandate: { tone: 'neutral', label: 'No mandate' },
};
const OBLIGATION = {
  made_up: (o) => ({ tone: 'success', text: `Made up ${short(o.makeup.date)}` }),
  scheduled: (o) => ({ tone: 'accent', text: `Make-up booked ${short(o.makeup.date)}` }),
  pending: (o) => ({ tone: 'warning', text: `Make up by ${short(o.due_date)}` }),
  due_soon: (o) => ({ tone: 'danger', text: `Make up by ${short(o.due_date)} (soon)` }),
  expired: () => ({ tone: 'danger', text: 'Not made up within 14 days' }),
  not_needed: () => ({ tone: 'neutral', text: 'Not needed: week met' }),
};
const GROUPS = [['all', 'All'], ['EI', 'EI'], ['DOE', 'DOE'], ['Other', 'Insurance & other']];

function short(ymd) {
  if (!ymd) return '';
  return new Date(`${ymd}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function weekLabel(w) {
  const a = new Date(`${w.start}T00:00:00`);
  const b = new Date(`${w.end}T00:00:00`);
  const m = (d) => d.toLocaleDateString('en-US', { month: 'short' });
  return a.getMonth() === b.getMonth() ? `${m(a)} ${a.getDate()}–${b.getDate()}` : `${m(a)} ${a.getDate()}–${m(b)} ${b.getDate()}`;
}
const fmtTime = (t) => { const [h, mm] = String(t).split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const hasProblem = (r) => r.weeks.some(w => w.status === 'short' || w.status === 'makeup_due' || w.over)
  || r.makeups.some(o => o.problems.length || o.status === 'expired' || o.status === 'due_soon') || r.streaks.length > 0;

function WeekCell({ w }) {
  if (w.owed === null) {
    return <span style={{ color: SUBTLE }} title="No mandate on file for this week">{w.delivered ? w.delivered : '–'}</span>;
  }
  const st = STATUS[w.status] || STATUS.upcoming;
  const t = TONES[st.tone];
  const title = [
    `${st.label}: ${w.credited} of ${w.owed} (${w.mandate || 'mandate'})`,
    `${w.delivered} provided${w.made_up ? `, ${w.made_up} made up` : ''}${w.excused ? `, ${w.excused} excused` : ''}${w.booked ? `, ${w.booked} booked` : ''}`,
    w.over ? `More sessions than the mandate allows (${w.max} a week)` : null,
    w.due ? `Make-up due by ${short(w.due)}` : null,
  ].filter(Boolean).join('\n');
  return (
    <span title={title} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 3, minWidth: 44, padding: '3px 6px', borderRadius: 4, fontSize: 12.5, fontWeight: 600,
      background: w.status === 'upcoming' ? 'transparent' : t.bg, color: w.status === 'upcoming' ? SUBTLE : t.fg, ...NUMERIC,
    }}>
      {w.credited}/{w.owed}
      {w.over && <span style={{ color: TONES.warning.fg }} aria-label="Over the mandate">+</span>}
    </span>
  );
}

function Detail({ r, colSpan }) {
  const misses = r.weeks.flatMap(w => w.missed.map(m => ({ ...m, week: w })));
  const obligationFor = (id) => r.makeups.find(o => String(o.missed_id) === String(id));
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: '10px 14px 14px', background: '#FAFAFA', borderBottom: `1px solid ${HAIRLINE}` }}>
        <div style={{ display: 'grid', gap: 10, fontSize: 13, color: INK }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px', color: MUTED, fontSize: 12.5 }}>
            <span>Seen by <strong style={{ color: INK }}>{r.providers.join(', ') || 'no one yet'}</strong></span>
            {r.group === 'EI' && (r.ei_auth
              ? <span>EI-Hub authorization {r.ei_auth.authorization_number} · {short(r.ei_auth.start_date)} – {short(r.ei_auth.end_date)} · make-ups {r.ei_auth.makeups_authorized ?? '?'} authorized, {r.ei_auth.makeups_used ?? '?'} used</span>
              : <span style={{ color: TONES.warning.fg }}>No EI-Hub authorization imported for {r.service}: check make-ups are authorized</span>)}
            {r.group !== 'EI' && <span>Make-ups aren't tracked for {r.group === 'DOE' ? 'DOE' : 'this program'}: delivered against the mandate only</span>}
          </div>
          {r.streaks.map(s => (
            <div key={s.from} style={{ color: TONES.danger.fg }}>
              Absent {s.count} sessions in a row ({short(s.from)} – {short(s.to)}). The provider must tell the service coordinator within 24 hours of the 4th absence.
            </div>
          ))}
          {misses.length === 0 ? (
            <div style={{ color: MUTED }}>No missed sessions in these weeks.</div>
          ) : (
            <table style={{ borderCollapse: 'collapse', fontSize: 13, justifySelf: 'start', ...NUMERIC }}>
              <tbody>
                {misses.map(m => {
                  const ob = obligationFor(m.id);
                  const o = ob ? OBLIGATION[ob.status]?.(ob) : null;
                  return (
                    <tr key={m.id}>
                      <td style={{ padding: '4px 14px 4px 0', whiteSpace: 'nowrap' }}>{short(m.date)}, {fmtTime(m.time)}</td>
                      <td style={{ padding: '4px 14px 4px 0', whiteSpace: 'nowrap', color: MUTED }}>{m.provider}</td>
                      <td style={{ padding: '4px 14px 4px 0' }}>{m.label}{m.excused ? <span style={{ color: MUTED }}> · excused, no make-up</span> : ''}</td>
                      <td style={{ padding: '4px 0' }}>
                        {o && <Tag tone={o.tone}>{o.text}</Tag>}
                        {!ob && !m.excused && r.group !== 'EI' && m.makeup && <Tag tone={m.makeup.done ? 'success' : 'accent'}>{m.makeup.done ? 'Made up' : 'Make-up booked'} {short(m.makeup.date)}</Tag>}
                        {ob?.problems.map(p => <div key={p} style={{ color: TONES.danger.fg, fontSize: 12.5, marginTop: 2 }}>Make-up {short(ob.makeup?.date)}: {p}</div>)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function BillingMandates({ month, manager }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('all');
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [provider, setProvider] = useState('');
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let alive = true;
    api.getBillingMandates(month)
      .then(d => { if (alive) { setData(d); setError(null); } })
      .catch(err => { if (alive) { setData(null); setError(err.message); } });
    return () => { alive = false; };
  }, [month]);

  const providers = useMemo(() => [...new Set((data?.rows || []).flatMap(r => r.providers))].sort(), [data]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.rows || []).filter(r => (group === 'all' || r.group === group)
      && (!q || r.patient_name.toLowerCase().includes(q))
      && (!provider || r.providers.includes(provider))
      && (!onlyProblems || hasProblem(r)));
  }, [data, search, group, provider, onlyProblems]);

  if (error) return <p role="alert" style={{ fontSize: 13, color: TONES.danger.fg }}>{error}</p>;
  if (!data) return <p style={{ fontSize: 13, color: MUTED }}>Loading mandates...</p>;

  const th = { padding: '8px 10px', fontSize: 11.5, fontWeight: 600, color: MUTED, textAlign: 'left', borderBottom: `1px solid ${HAIRLINE}`, background: '#FAFAFA', whiteSpace: 'nowrap' };
  const td = { padding: '0 10px', height: 40, fontSize: 13, color: INK, borderBottom: `1px solid ${HAIRLINE}`, whiteSpace: 'nowrap' };
  const colSpan = 5 + data.weeks.length;
  const input = { padding: '7px 10px', borderRadius: 6, border: `1px solid ${HAIRLINE}`, fontSize: 13, fontFamily: 'inherit', background: 'white' };

  return (
    <div style={{ background: 'white', border: `1px solid ${HAIRLINE}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${HAIRLINE}` }}>
        <input aria-label="Search children" placeholder="Search children" value={search} onChange={e => setSearch(e.target.value)} style={{ ...input, width: 200 }} />
        {GROUPS.map(([k, label]) => <button key={k} type="button" onClick={() => setGroup(k)} style={choiceStyle(group === k)}>{label}</button>)}
        {manager && providers.length > 1 && (
          <select aria-label="Provider" value={provider} onChange={e => setProvider(e.target.value)} style={input}>
            <option value="">All providers</option>
            {providers.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: INK, cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyProblems} onChange={e => setOnlyProblems(e.target.checked)} /> Only problems
        </label>
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: MUTED }}>{rows.length} of {data.rows.length}</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', ...NUMERIC }}>
          <thead>
            <tr>
              <th style={th}>Child</th>
              <th style={th}>Service</th>
              <th style={th}>Program</th>
              <th style={th}>Mandate</th>
              {data.weeks.map(w => <th key={w.start} style={{ ...th, textAlign: 'center' }} title={w.days_inside < 7 ? `Checked as a whole week; ${w.days_inside} of its days are in this month` : undefined}>{weekLabel(w)}</th>)}
              <th style={{ ...th, textAlign: 'right' }} title="This month, with weeks at the month's edges counted for the days inside it">Month</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={colSpan} style={{ ...td, height: 60, textAlign: 'center', color: MUTED }}>Nothing to show.</td></tr>}
            {rows.map(r => (
              <Fragment key={r.key}>
                <tr onClick={() => setOpen(o => (o === r.key ? null : r.key))} style={{ cursor: 'pointer', background: open === r.key ? '#FAFAFA' : undefined }} aria-expanded={open === r.key}>
                  <td style={{ ...td, fontWeight: 500 }}>
                    {r.patient_name}
                    {r.streaks.length > 0 && <span style={{ marginLeft: 6 }}><Tag tone="danger" title="4 or more absences in a row">Absences</Tag></span>}
                  </td>
                  <td style={td}>{r.service}</td>
                  <td style={{ ...td, color: MUTED }}>{r.program || '—'}</td>
                  <td style={{ ...td, color: MUTED }}>{r.mandate || '—'}</td>
                  {r.weeks.map(w => <td key={w.start} style={{ ...td, textAlign: 'center' }}><WeekCell w={w} /></td>)}
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>
                    {r.month ? <span title="Sessions credited of sessions owed this month">{r.month.credited} of {r.month.owed}</span> : <span style={{ color: SUBTLE }}>—</span>}
                  </td>
                </tr>
                {open === r.key && <Detail r={r} colSpan={colSpan} />}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', alignItems: 'center', padding: '10px 16px', borderTop: `1px solid ${HAIRLINE}`, fontSize: 12.5, color: MUTED }}>
        {['met', 'makeup_due', 'in_progress', 'short'].map(k => <span key={k} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Tag tone={STATUS[k].tone}>{STATUS[k].label}</Tag></span>)}
        <span><strong style={{ color: TONES.warning.fg }}>+</strong> more than the mandate</span>
        <span>Weeks run Sunday to Saturday. Holidays, and EI family vacations, are excused.</span>
      </div>
    </div>
  );
}
