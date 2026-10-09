import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { useStaffNames } from './staffDirectory';
import { Tag } from './dashboardUi';
import { INK, MUTED, SUBTLE, HAIRLINE, NUMERIC, TONES, ACCENT } from './uiTokens';

// EI-Hub entry (Billing page, Developers only for now): every EI
// session that took place in a month, with what the state's EI-Hub asks for
// when it's typed in, and a tick for each one that's been entered
// (kidz-lounge-api routes/billing.js, GET/PUT /billing/ei-hub).
// Problems (no ID #, no authorization number, no setting) show in red so
// they're fixed before entry; a session changed after it was ticked shows in
// amber, as EI-Hub may need correcting: it's listed under To enter again
// until someone fixes it there and clicks Updated in EI-Hub (which saves the
// session as it is now).

const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (s) => new Date(`${s}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const fmtTime = (t) => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`; };
const fmtWhen = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const FILTERS = [
  { key: 'todo', label: 'To enter' },
  { key: 'entered', label: 'Entered' },
  { key: 'all', label: 'All' },
];

export default function EiHubList({ month }) {
  const nameOf = useStaffNames();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('todo');
  const [provider, setProvider] = useState('');
  const [busy, setBusy] = useState(() => new Set());

  const load = useCallback(() => {
    let alive = true;
    api.getEiHubSessions(month)
      .then(d => { if (alive) { setData(d); setError(null); } })
      .catch(err => { if (alive) { setData(null); setError(err.message); } });
    return () => { alive = false; };
  }, [month]);
  useEffect(load, [load]);

  const sessions = useMemo(() => data?.sessions || [], [data]);
  const providers = useMemo(() => [...new Set(sessions.map(s => s.provider).filter(Boolean))].sort(), [sessions]);
  const mine = provider ? sessions.filter(s => s.provider === provider) : sessions;
  const needsWork = (s) => !s.entered || s.entered.changed;
  const counts = {
    todo: mine.filter(needsWork).length,
    entered: mine.filter(s => s.entered).length,
    changed: mine.filter(s => s.entered?.changed).length,
  };
  const shown = mine.filter(s => (filter === 'todo' ? needsWork(s) : filter === 'entered' ? !!s.entered : true));

  const toggle = async (s, entered) => {
    setBusy(b => new Set(b).add(s.key));
    // Ticked straight away; put back if the save fails.
    const was = s.entered;
    const mark = (value) => setData(d => ({ ...d, sessions: d.sessions.map(x => (x.key === s.key ? { ...x, entered: value } : x)) }));
    mark(entered ? { by: null, at: new Date().toISOString(), changed: false } : null);
    try {
      await api.setEiHubEntered({
        session_key: s.key, entered, patient_name: s.patient_name,
        appointment_date: s.date, appointment_time: s.start_time, duration: s.duration, provider: s.provider,
      });
    } catch (err) {
      mark(was);
      setError(err.message);
    }
    setBusy(b => { const n = new Set(b); n.delete(s.key); return n; });
  };

  const th = { textAlign: 'left', padding: '8px 10px', fontSize: 12, fontWeight: 600, color: MUTED, borderBottom: `1px solid ${HAIRLINE}`, whiteSpace: 'nowrap', background: '#FAFAFA' };
  const td = { padding: '9px 10px', fontSize: 13, color: INK, borderBottom: `1px solid ${HAIRLINE}`, verticalAlign: 'top' };

  return (
    <div style={{ background: 'white', border: `1px solid ${HAIRLINE}`, borderRadius: 12, overflow: 'clip' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${HAIRLINE}` }}>
        <div role="tablist" aria-label="Show" style={{ display: 'inline-flex', border: `1px solid ${HAIRLINE}`, borderRadius: 6, overflow: 'hidden' }}>
          {FILTERS.map(f => (
            <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}
              style={{ padding: '6px 12px', border: 'none', borderRight: f.key !== 'all' ? `1px solid ${HAIRLINE}` : 'none', background: filter === f.key ? '#F5F3FF' : 'white', color: filter === f.key ? ACCENT : INK, fontSize: 13, fontWeight: filter === f.key ? 600 : 500, fontFamily: 'inherit', cursor: 'pointer' }}>
              {f.label}{f.key !== 'all' && <span style={{ marginLeft: 6, color: SUBTLE, ...NUMERIC }}>{counts[f.key]}</span>}
            </button>
          ))}
        </div>
        <select value={provider} onChange={e => setProvider(e.target.value)} aria-label="Provider"
          style={{ padding: '7px 10px', borderRadius: 6, border: `1px solid ${HAIRLINE}`, fontSize: 13, fontFamily: 'inherit', background: 'white' }}>
          <option value="">All providers</option>
          {providers.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        {counts.changed > 0 && (
          <span style={{ fontSize: 12.5, color: TONES.warning.fg }}>{counts.changed} changed after {counts.changed === 1 ? 'it was' : 'they were'} entered</span>
        )}
      </div>

      {error && <p role="alert" style={{ margin: 0, padding: '10px 16px', fontSize: 13, color: TONES.danger.fg }}>{error}</p>}
      {data && !data.tracking && (
        <p style={{ margin: 0, padding: '10px 16px', fontSize: 13, color: TONES.warning.fg, background: TONES.warning.bg }}>
          Ticking sessions as entered needs the 2026-10-20 database update. Ask an admin to run it.
        </p>
      )}
      {!data && !error && <p style={{ margin: 0, padding: 16, fontSize: 13, color: MUTED }}>Loading...</p>}

      {data && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900, ...NUMERIC }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 74 }}>Entered</th>
                <th style={th}>Date</th>
                <th style={th}>Time</th>
                <th style={th}>Child</th>
                <th style={th}>Service</th>
                <th style={th}>Auth #</th>
                <th style={th}>Provider</th>
                <th style={th}>Setting</th>
                <th style={th}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: MUTED, padding: 28 }}>
                  {sessions.length === 0 ? 'No EI sessions this month yet. Sessions show here once their day is over.'
                    : filter === 'todo' ? 'Everything here has been entered in EI-Hub.' : 'Nothing to show.'}
                </td></tr>
              )}
              {shown.map(s => (
                <tr key={s.key} style={{ background: s.entered ? '#FCFCFD' : 'white' }}>
                  <td style={td}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: data.tracking ? 'pointer' : 'default' }}
                      title={s.entered?.by ? `Entered by ${nameOf(s.entered.by)} on ${fmtWhen(s.entered.at)}` : undefined}>
                      <input type="checkbox" checked={!!s.entered} disabled={!data.tracking || busy.has(s.key)}
                        onChange={e => toggle(s, e.target.checked)} aria-label={`Entered in EI-Hub: ${s.patient_name}, ${fmtDate(s.date)}`} />
                      {s.entered?.by && <span style={{ fontSize: 11.5, color: MUTED }}>{fmtWhen(s.entered.at)}</span>}
                    </label>
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(s.date)}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtTime(s.start_time)} – {fmtTime(s.end_time)}</td>
                  <td style={td}>
                    <div style={{ fontWeight: 500 }}>{s.patient_name}</div>
                    <div style={{ fontSize: 12, color: s.ei_child_id ? MUTED : TONES.danger.fg }}>{s.ei_child_id ? `ID # ${s.ei_child_id}` : 'No ID #'}</div>
                  </td>
                  <td style={td}>{s.service || (s.service_options ? s.service_options.join(' or ') : '—')}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap', color: s.authorization ? INK : TONES.danger.fg }}>{s.authorization || 'Missing'}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{s.provider}</td>
                  <td style={{ ...td, color: s.setting ? INK : TONES.danger.fg }}>{s.setting || 'Missing'}</td>
                  <td style={{ ...td, minWidth: 200 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: (s.problems.length || s.entered?.changed) ? 4 : 0 }}>
                      {s.is_makeup && <Tag tone="success">Make-up</Tag>}
                      {s.is_eval && <Tag tone="accent">Eval</Tag>}
                    </div>
                    {s.entered?.changed && (
                      <div style={{ fontSize: 12, color: TONES.warning.fg }}>
                        Changed after it was entered. Check it in EI-Hub.{' '}
                        <button type="button" disabled={busy.has(s.key)} onClick={() => toggle(s, true)}
                          style={{ border: 'none', background: 'none', padding: 0, color: ACCENT, fontWeight: 600, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}>
                          Updated in EI-Hub
                        </button>
                      </div>
                    )}
                    {s.problems.map(p => <div key={p} style={{ fontSize: 12, color: TONES.danger.fg }}>{p}</div>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
