import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { useStaffNames } from './staffDirectory';
import { Tag } from './dashboardUi';
import { eiInput } from './eiHubUi';
import { INK, MUTED, SUBTLE, HAIRLINE, NUMERIC, TONES, ACCENT, buttonStyle } from './uiTokens';

// EI-Hub claim files (Billing → EI-Hub entry → Claims; Developers for now;
// kidz-lounge-api routes/eiHub.js + lib/ei837.js). Each EI session of the
// month with its codes (one per 15 minutes, from the provider's defaults,
// changeable here), its charge, and what's blocking it. Ready sessions can
// be put into an 837P file to upload to EI-Hub: a test file (marked as test,
// up to 50 claims) for the state's testing stage, or a claim file, after
// which those sessions show as sent and aren't offered again.

const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (s) => new Date(`${s}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const fmtTime = (t) => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`; };
const money = (n) => `$${n.toFixed(2)}`;
const PLACE = { 11: 'Office', 12: 'Home' };
const STATUS_TONE = { sent: 'accent', accepted: 'success', rejected: 'danger' };

function saveFile(name, content) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function CodesEditor({ session, allowed, onSaved, onCancel }) {
  const [codes, setCodes] = useState(session.codes.length ? session.codes : Array(session.default_lines || 1).fill(''));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async (list) => {
    setBusy(true); setError(null);
    try {
      await api.saveEiSessionCodes({ session_key: session.key, service: session.service, codes: list });
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <div>
      {codes.map((c, i) => (
        <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
          <select aria-label={`Line ${i + 1} code`} style={{ ...eiInput, width: 'auto', minWidth: 170, padding: '4px 6px' }} value={c}
            onChange={e => setCodes(list => list.map((x, j) => (j === i ? e.target.value : x)))}>
            <option value="">Choose a code</option>
            {(allowed[session.service] || []).map(o => <option key={o.code} value={o.code}>{o.code} {o.label}</option>)}
          </select>
          {codes.length > 1 && <button type="button" aria-label={`Remove line ${i + 1}`} onClick={() => setCodes(list => list.filter((_, j) => j !== i))} style={buttonStyle('text')}>×</button>}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {codes.length < 8 && <button type="button" onClick={() => setCodes(list => [...list, list[list.length - 1] || ''])} style={buttonStyle('text')}>+ Line</button>}
        <button type="button" disabled={busy} onClick={() => save(codes)} style={buttonStyle('primary', { padding: '4px 10px' })}>Save</button>
        {session.codes_changed && <button type="button" disabled={busy} onClick={() => save(null)} style={buttonStyle('secondary', { padding: '4px 10px' })}>Use defaults</button>}
        <button type="button" disabled={busy} onClick={onCancel} style={buttonStyle('secondary', { padding: '4px 10px' })}>Cancel</button>
      </div>
      {error && <div role="alert" style={{ fontSize: 12, color: TONES.danger.fg, marginTop: 4 }}>{error}</div>}
    </div>
  );
}

const FILTERS = [
  { key: 'ready', label: 'Ready' },
  { key: 'blocked', label: 'Needs fixing' },
  { key: 'sent', label: 'Sent' },
  { key: 'all', label: 'All' },
];

export default function EiHubClaims({ month }) {
  const nameOf = useStaffNames();
  const [data, setData] = useState(null);
  const [allowed, setAllowed] = useState({});
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('ready');
  const [selected, setSelected] = useState(() => new Set());
  const [editing, setEditing] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(() => {
    let alive = true;
    api.getEiClaims(month)
      .then(d => { if (alive) { setData(d); setError(null); } })
      .catch(err => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [month]);
  useEffect(load, [load]);
  useEffect(() => { api.getEiSetup().then(s => setAllowed(s.allowed_codes || {})).catch(() => {}); }, []);

  const sessions = useMemo(() => data?.sessions || [], [data]);
  const isReady = (s) => !s.problems.length && !s.claim;
  const counts = {
    ready: sessions.filter(isReady).length,
    blocked: sessions.filter(s => s.problems.length && !s.claim).length,
    sent: sessions.filter(s => s.claim).length,
    all: sessions.length,
  };
  const shown = sessions.filter(s => (filter === 'ready' ? isReady(s) : filter === 'blocked' ? s.problems.length && !s.claim : filter === 'sent' ? s.claim : true));
  const chosen = sessions.filter(s => selected.has(s.key) && isReady(s));
  const allShownChosen = shown.filter(isReady).length > 0 && shown.filter(isReady).every(s => selected.has(s.key));
  const toggle = (key) => setSelected(set => { const n = new Set(set); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  const makeFile = async (test) => {
    setBusy(true); setNotice(null); setConfirming(false);
    try {
      const file = await api.createEiClaimFile({ month, test, session_keys: chosen.map(s => s.key) });
      saveFile(file.file_name, file.content);
      setNotice({ ok: `${file.file_name} downloaded: ${file.claim_count} claim${file.claim_count === 1 ? '' : 's'}. Upload it in EI-Hub under Attendance → 837P Loader.` });
      if (!test) setSelected(new Set());
      load();
    } catch (err) {
      setNotice({ error: err.message });
    }
    setBusy(false);
  };
  const downloadAgain = async (id) => {
    try {
      const f = await api.getEiClaimFile(id);
      saveFile(f.file_name, f.content);
    } catch (err) {
      setNotice({ error: err.message });
    }
  };

  if (error) return <p role="alert" style={{ fontSize: 13, color: TONES.danger.fg }}>{error}</p>;
  if (!data) return <p style={{ fontSize: 13, color: MUTED }}>Loading...</p>;
  if (!data.available) {
    return <p style={{ margin: 0, padding: 16, borderRadius: 12, border: `1px solid ${HAIRLINE}`, fontSize: 13, color: TONES.warning.fg, background: TONES.warning.bg }}>Claim files need the 2026-10-20, 2026-10-21 and 2026-10-22 database updates. Ask an admin to run them.</p>;
  }

  const th = { textAlign: 'left', padding: '8px 10px', fontSize: 12, fontWeight: 600, color: MUTED, borderBottom: `1px solid ${HAIRLINE}`, background: '#FAFAFA', whiteSpace: 'nowrap' };
  const td = { padding: '9px 10px', fontSize: 13, color: INK, borderBottom: `1px solid ${HAIRLINE}`, verticalAlign: 'top' };
  const total = chosen.reduce((t, s) => t + s.lines.reduce((u, l) => u + l.charge, 0), 0);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {data.agency_problems.length > 0 && (
        <p style={{ margin: 0, padding: '10px 14px', borderRadius: 8, fontSize: 13, color: TONES.danger.fg, background: TONES.danger.bg }}>
          Finish the agency in Setup before making a file: {data.agency_problems.join(', ')}.
        </p>
      )}
      <div style={{ background: 'white', border: `1px solid ${HAIRLINE}`, borderRadius: 12, overflow: 'clip' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${HAIRLINE}` }}>
          <div role="tablist" aria-label="Show" style={{ display: 'inline-flex', border: `1px solid ${HAIRLINE}`, borderRadius: 6, overflow: 'hidden' }}>
            {FILTERS.map((f, i) => (
              <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}
                style={{ padding: '6px 12px', border: 'none', borderRight: i < FILTERS.length - 1 ? `1px solid ${HAIRLINE}` : 'none', background: filter === f.key ? '#F5F3FF' : 'white', color: filter === f.key ? ACCENT : INK, fontSize: 13, fontWeight: filter === f.key ? 600 : 500, fontFamily: 'inherit', cursor: 'pointer' }}>
                {f.label} <span style={{ color: SUBTLE, ...NUMERIC }}>{counts[f.key]}</span>
              </button>
            ))}
          </div>
          <span style={{ fontSize: 12.5, color: MUTED }}>One code per 15 minutes, from each provider's defaults in Setup.</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960, ...NUMERIC }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 34 }}>
                  <input type="checkbox" aria-label="Choose every ready session shown" checked={allShownChosen} disabled={!shown.some(isReady)}
                    onChange={e => setSelected(set => { const n = new Set(set); shown.filter(isReady).forEach(s => (e.target.checked ? n.add(s.key) : n.delete(s.key))); return n; })} />
                </th>
                <th style={th}>Date</th><th style={th}>Time</th><th style={th}>Child</th><th style={th}>Service</th><th style={th}>Place</th>
                <th style={th}>Codes</th><th style={{ ...th, textAlign: 'right' }}>Charge</th><th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: MUTED, padding: 28 }}>
                  {sessions.length === 0 ? 'No EI sessions this month yet.' : filter === 'ready' ? 'Nothing ready to bill. Check Needs fixing.' : 'Nothing to show.'}
                </td></tr>
              )}
              {shown.map(s => {
                const charge = s.lines.reduce((t, l) => t + l.charge, 0);
                return (
                  <tr key={s.key} style={{ background: selected.has(s.key) ? '#FAF8FF' : 'white' }}>
                    <td style={td}>
                      <input type="checkbox" aria-label={`Bill ${s.patient_name}, ${fmtDate(s.date)}`} disabled={!isReady(s)} checked={selected.has(s.key) && isReady(s)} onChange={() => toggle(s.key)} />
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(s.date)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtTime(s.start_time)} – {fmtTime(s.end_time)}</td>
                    <td style={td}>
                      <div style={{ fontWeight: 500 }}>{s.patient_name}</div>
                      <div style={{ fontSize: 12, color: MUTED }}>{s.provider}</div>
                    </td>
                    <td style={td}>{s.service || '—'}{s.is_makeup && <div style={{ marginTop: 2 }}><Tag tone="success">Make-up</Tag></div>}</td>
                    <td style={td}>{s.place_of_service ? `${s.place_of_service} ${PLACE[s.place_of_service]}` : '—'}</td>
                    <td style={{ ...td, minWidth: 190 }}>
                      {editing === s.key ? (
                        <CodesEditor session={s} allowed={allowed} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
                      ) : (
                        <>
                          {s.codes.length ? s.codes.join(', ') : <span style={{ color: MUTED }}>None</span>}
                          {s.codes_changed && <span style={{ fontSize: 11.5, color: MUTED }}> (changed)</span>}
                          {s.service && !s.claim && <div><button type="button" onClick={() => setEditing(s.key)} style={buttonStyle('text', { padding: '2px 0' })}>Change codes</button></div>}
                        </>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>{charge ? money(charge) : '—'}</td>
                    <td style={{ ...td, minWidth: 220 }}>
                      {s.claim ? (
                        <>
                          <Tag tone={STATUS_TONE[s.claim.status] || 'neutral'}>{s.claim.status === 'sent' ? 'Sent' : s.claim.status === 'accepted' ? 'Accepted' : 'Rejected'}</Tag>
                          <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{s.claim.file_name}</div>
                        </>
                      ) : s.problems.length ? (
                        s.problems.map(p => <div key={p} style={{ fontSize: 12, color: TONES.danger.fg }}>{p}</div>)
                      ) : (
                        <Tag tone="success">Ready</Tag>
                      )}
                      {s.warnings.map(w => <div key={w} style={{ fontSize: 12, color: TONES.warning.fg }}>{w}</div>)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '12px 16px', borderTop: `1px solid ${HAIRLINE}`, background: '#FAFAFA' }}>
          <span style={{ fontSize: 13, color: INK, ...NUMERIC }}>{chosen.length} session{chosen.length === 1 ? '' : 's'} chosen{chosen.length ? ` · ${money(total)}` : ''}</span>
          <span style={{ flex: 1 }} />
          {confirming ? (
            <>
              <span style={{ fontSize: 13, color: INK }}>Make a claim file? These {chosen.length} sessions will show as sent.</span>
              <button type="button" disabled={busy} onClick={() => makeFile(false)} style={buttonStyle('primary')}>Make claim file</button>
              <button type="button" disabled={busy} onClick={() => setConfirming(false)} style={buttonStyle('secondary')}>Cancel</button>
            </>
          ) : (
            <>
              <button type="button" disabled={busy || !chosen.length || chosen.length > data.test_limit || data.agency_problems.length > 0}
                title={chosen.length > data.test_limit ? `A test file can hold up to ${data.test_limit} claims` : undefined}
                onClick={() => makeFile(true)} style={buttonStyle('secondary')}>Download test file</button>
              <button type="button" disabled={busy || !chosen.length || data.agency_problems.length > 0} onClick={() => setConfirming(true)} style={buttonStyle('primary')}>Download claim file</button>
            </>
          )}
        </div>
        {notice && <p role={notice.error ? 'alert' : 'status'} style={{ margin: 0, padding: '10px 16px', fontSize: 13, color: notice.error ? TONES.danger.fg : TONES.success.fg, borderTop: `1px solid ${HAIRLINE}` }}>{notice.error || notice.ok}</p>}
      </div>

      {data.files.length > 0 && (
        <div style={{ background: 'white', border: `1px solid ${HAIRLINE}`, borderRadius: 12, padding: 16 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: INK }}>Recent files</h3>
          {data.files.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '6px 0', borderBottom: `1px solid ${HAIRLINE}`, fontSize: 13 }}>
              <span style={{ fontWeight: 500 }}>{f.file_name}</span>
              {f.test && <Tag tone="neutral">Test</Tag>}
              <span style={{ color: MUTED }}>{f.claim_count} claim{f.claim_count === 1 ? '' : 's'} · {new Date(f.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} by {nameOf(f.created_by)}</span>
              <span style={{ flex: 1 }} />
              <button type="button" onClick={() => downloadAgain(f.id)} style={buttonStyle('text')}>Download again</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
