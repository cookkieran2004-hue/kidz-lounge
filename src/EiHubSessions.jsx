import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { useStaffNames } from './staffDirectory';
import { Tag } from './dashboardUi';
import { eiInput } from './eiHubUi';
import { INK, MUTED, SUBTLE, HAIRLINE, NUMERIC, TONES, ACCENT, buttonStyle } from './uiTokens';

// EI sessions (Billing → EI-Hub Entry → Sessions; Admins and Developers;
// kidz-lounge-api routes/eiHub.js + lib/ei837.js). ONE list for getting each
// EI session of the month into EI-Hub, with one status per session (Oct 2026;
// it replaced separate "entered by hand" and "claims" lists):
//   Needs fixing -> Ready -> In EI-Hub (in a claim file, or typed in by hand)
//   -> Accepted / Rejected (EI-Hub's 277, part 3)
// Each row shows what EI-Hub needs (child ID, auth #, codes: one per 15
// minutes from the provider's defaults, changeable here). Ready sessions go
// into an 837P file (or a test file, for the state's testing stage), or are
// marked as typed in by hand; the server refuses doing both to one session.

const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (s) => new Date(`${s}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const fmtShort = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const fmtTime = (t) => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`; };
const money = (n) => `$${n.toFixed(2)}`;
const PLACE = { 11: 'Office', 12: 'Home' };
const IN_HUB = ['entered', 'sent', 'accepted', 'rejected'];
// A session typed into EI-Hub by hand and changed since needs looking at too.
const needsAction = (s) => s.status === 'needs_fixing' || (s.status === 'entered' && s.entered?.changed);

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

function StatusCell({ s, nameOf, onUpdated }) {
  if (s.claim) {
    const label = { sent: 'In EI-Hub', accepted: 'Accepted', rejected: 'Rejected' }[s.claim.status] || s.claim.status;
    const tone = { sent: 'accent', accepted: 'success', rejected: 'danger' }[s.claim.status] || 'neutral';
    return (
      <>
        <Tag tone={tone}>{label}</Tag>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>Claim file {s.claim.file_name}</div>
      </>
    );
  }
  if (s.entered) {
    return (
      <>
        <Tag tone="accent">In EI-Hub</Tag>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>Entered by hand{s.entered.by ? ` · ${nameOf(s.entered.by)}, ${fmtShort(s.entered.at)}` : ''}</div>
        {s.entered.changed && (
          <div style={{ fontSize: 12, color: TONES.warning.fg, marginTop: 2 }}>
            Changed after it was entered. Correct it in EI-Hub, then{' '}
            <button type="button" onClick={onUpdated} style={{ border: 'none', background: 'none', padding: 0, color: ACCENT, fontWeight: 600, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}>mark it updated</button>.
          </div>
        )}
      </>
    );
  }
  if (s.problems.length) return s.problems.map(p => <div key={p} style={{ fontSize: 12, color: TONES.danger.fg }}>{p}</div>);
  return <Tag tone="success">Ready</Tag>;
}

const FILTERS = [
  { key: 'action', label: 'Needs fixing' },
  { key: 'ready', label: 'Ready' },
  { key: 'inhub', label: 'In EI-Hub' },
  { key: 'all', label: 'All' },
];

export default function EiHubSessions({ month }) {
  const nameOf = useStaffNames();
  const [data, setData] = useState(null);
  const [allowed, setAllowed] = useState({});
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('ready');
  const [selected, setSelected] = useState(() => new Set());
  const [editing, setEditing] = useState(null);
  const [confirming, setConfirming] = useState(null); // 'file' | 'hand'
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
  const counts = {
    action: sessions.filter(needsAction).length,
    ready: sessions.filter(s => s.status === 'ready').length,
    inhub: sessions.filter(s => IN_HUB.includes(s.status)).length,
    all: sessions.length,
  };
  const shown = sessions.filter(s => (filter === 'action' ? needsAction(s) : filter === 'ready' ? s.status === 'ready' : filter === 'inhub' ? IN_HUB.includes(s.status) : true));
  const selectable = (s) => s.status === 'ready' || s.status === 'entered';
  const chosen = sessions.filter(s => selected.has(s.key) && selectable(s));
  const chosenReady = chosen.filter(s => s.status === 'ready');
  const chosenEntered = chosen.filter(s => s.status === 'entered');
  const shownSelectable = shown.filter(selectable);
  const allShownChosen = shownSelectable.length > 0 && shownSelectable.every(s => selected.has(s.key));
  const toggle = (key) => setSelected(set => { const n = new Set(set); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const done = (message) => { setNotice({ ok: message }); setSelected(new Set()); setConfirming(null); load(); };

  const makeFile = async (test) => {
    setBusy(true); setNotice(null);
    try {
      const file = await api.createEiClaimFile({ month, test, session_keys: chosenReady.map(s => s.key) });
      saveFile(file.file_name, file.content);
      done(`${file.file_name} downloaded: ${file.claim_count} claim${file.claim_count === 1 ? '' : 's'}. Upload it in EI-Hub under Attendance → 837P Loader.`);
    } catch (err) {
      setNotice({ error: err.message });
    }
    setBusy(false);
  };
  // Typed into EI-Hub by hand (or taking that back), one session at a time
  // through the same check the server uses for each.
  const markByHand = async (list, entered) => {
    setBusy(true); setNotice(null);
    let ok = 0;
    for (const s of list) {
      try {
        await api.setEiHubEntered({
          session_key: s.key, entered, patient_name: s.patient_name,
          appointment_date: s.date, appointment_time: s.start_time, duration: s.duration, provider: s.provider,
        });
        ok += 1;
      } catch (err) {
        setNotice({ error: `${s.patient_name} on ${fmtDate(s.date)}: ${err.message}` });
        setBusy(false);
        load();
        return;
      }
    }
    done(entered ? `${ok} session${ok === 1 ? '' : 's'} marked as entered in EI-Hub by hand.` : `${ok} session${ok === 1 ? '' : 's'} back to Ready.`);
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
    return <p style={{ margin: 0, padding: 16, borderRadius: 12, border: `1px solid ${HAIRLINE}`, fontSize: 13, color: TONES.warning.fg, background: TONES.warning.bg }}>EI sessions need the 2026-10-20 to 2026-10-23 database updates. Ask an admin to run them.</p>;
  }

  const th = { textAlign: 'left', padding: '8px 10px', fontSize: 12, fontWeight: 600, color: MUTED, borderBottom: `1px solid ${HAIRLINE}`, background: '#FAFAFA', whiteSpace: 'nowrap' };
  const td = { padding: '9px 10px', fontSize: 13, color: INK, borderBottom: `1px solid ${HAIRLINE}`, verticalAlign: 'top' };
  const total = chosenReady.reduce((t, s) => t + s.lines.reduce((u, l) => u + l.charge, 0), 0);
  const fileBlocked = !chosenReady.length || data.agency_problems.length > 0;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {data.agency_problems.length > 0 && (
        <p style={{ margin: 0, padding: '10px 14px', borderRadius: 8, fontSize: 13, color: TONES.danger.fg, background: TONES.danger.bg }}>
          Finish the agency in Setup before making a claim file: {data.agency_problems.join(', ')}.
        </p>
      )}
      <div style={{ background: 'white', border: `1px solid ${HAIRLINE}`, borderRadius: 12, overflow: 'clip' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${HAIRLINE}` }}>
          <div role="tablist" aria-label="Show" style={{ display: 'inline-flex', border: `1px solid ${HAIRLINE}`, borderRadius: 6, overflow: 'hidden' }}>
            {FILTERS.map((f, i) => (
              <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} onClick={() => { setFilter(f.key); setConfirming(null); }}
                style={{ padding: '6px 12px', border: 'none', borderRight: i < FILTERS.length - 1 ? `1px solid ${HAIRLINE}` : 'none', background: filter === f.key ? '#F5F3FF' : 'white', color: filter === f.key ? ACCENT : INK, fontSize: 13, fontWeight: filter === f.key ? 600 : 500, fontFamily: 'inherit', cursor: 'pointer' }}>
                {f.label} <span style={{ color: f.key === 'action' && counts.action ? TONES.danger.fg : SUBTLE, ...NUMERIC }}>{counts[f.key]}</span>
              </button>
            ))}
          </div>
          <span style={{ fontSize: 12.5, color: MUTED }}>Every EI session of the month. Bill by claim file, or mark ones typed into EI-Hub by hand.</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000, ...NUMERIC }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 34 }}>
                  <input type="checkbox" aria-label="Choose every session shown" checked={allShownChosen} disabled={!shownSelectable.length}
                    onChange={e => setSelected(set => { const n = new Set(set); shownSelectable.forEach(s => (e.target.checked ? n.add(s.key) : n.delete(s.key))); return n; })} />
                </th>
                <th style={th}>Date</th><th style={th}>Time</th><th style={th}>Child</th><th style={th}>Service</th><th style={th}>Provider</th>
                <th style={th}>Place</th><th style={th}>Codes</th><th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr><td colSpan={9} style={{ ...td, textAlign: 'center', color: MUTED, padding: 28 }}>
                  {sessions.length === 0 ? 'No EI sessions this month yet. Sessions show here once their day is over.'
                    : filter === 'ready' ? (counts.action ? 'Nothing ready. Check Needs fixing.' : 'Everything is in EI-Hub.')
                    : filter === 'action' ? 'Nothing needs fixing.' : 'Nothing to show.'}
                </td></tr>
              )}
              {shown.map(s => {
                const charge = s.lines.reduce((t, l) => t + l.charge, 0);
                return (
                  <tr key={s.key} style={{ background: selected.has(s.key) && selectable(s) ? '#FAF8FF' : 'white' }}>
                    <td style={td}>
                      <input type="checkbox" aria-label={`Choose ${s.patient_name}, ${fmtDate(s.date)}`} disabled={!selectable(s)} checked={selected.has(s.key) && selectable(s)} onChange={() => toggle(s.key)} />
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(s.date)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtTime(s.start_time)} – {fmtTime(s.end_time)}</td>
                    <td style={td}>
                      <div style={{ fontWeight: 500 }}>{s.patient_name}</div>
                      <div style={{ fontSize: 12, color: s.ei_child_id ? MUTED : TONES.danger.fg }}>{s.ei_child_id ? `ID # ${s.ei_child_id}` : 'No ID #'}</div>
                    </td>
                    <td style={td}>
                      {s.service || '—'}{s.is_makeup && <span style={{ marginLeft: 4 }}><Tag tone="success">Make-up</Tag></span>}
                      <div style={{ fontSize: 12, color: s.authorization ? MUTED : TONES.danger.fg }}>{s.authorization ? `Auth ${s.authorization}` : 'No auth #'}</div>
                    </td>
                    <td style={td}>{s.provider}</td>
                    <td style={td}>{s.place_of_service ? PLACE[s.place_of_service] : '—'}</td>
                    <td style={{ ...td, minWidth: 180 }}>
                      {editing === s.key ? (
                        <CodesEditor session={s} allowed={allowed} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
                      ) : (
                        <>
                          {s.codes.length ? s.codes.join(', ') : <span style={{ color: MUTED }}>None</span>}
                          {s.codes_changed && <span style={{ fontSize: 11.5, color: MUTED }}> (changed)</span>}
                          {charge > 0 && <div style={{ fontSize: 12, color: MUTED }}>{money(charge)}</div>}
                          {s.service && (s.status === 'ready' || s.status === 'needs_fixing') && (
                            <div><button type="button" onClick={() => setEditing(s.key)} style={buttonStyle('text', { padding: '2px 0' })}>Change codes</button></div>
                          )}
                        </>
                      )}
                    </td>
                    <td style={{ ...td, minWidth: 230 }}>
                      <StatusCell s={s} nameOf={nameOf} onUpdated={() => markByHand([s], true)} />
                      {s.warnings.map(w => <div key={w} style={{ fontSize: 12, color: TONES.warning.fg }}>{w}</div>)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* What can be done with the chosen sessions. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '12px 16px', borderTop: `1px solid ${HAIRLINE}`, background: '#FAFAFA' }}>
          <span style={{ fontSize: 13, color: INK, ...NUMERIC }}>
            {chosen.length} chosen{chosenReady.length ? ` · ${chosenReady.length} ready (${money(total)})` : ''}{chosenEntered.length ? ` · ${chosenEntered.length} entered by hand` : ''}
          </span>
          <span style={{ flex: 1 }} />
          {confirming === 'file' ? (
            <>
              <span style={{ fontSize: 13, color: INK }}>Make a claim file for {chosenReady.length} session{chosenReady.length === 1 ? '' : 's'}? They'll move to In EI-Hub.</span>
              <button type="button" disabled={busy} onClick={() => makeFile(false)} style={buttonStyle('primary')}>Make claim file</button>
              <button type="button" disabled={busy} onClick={() => setConfirming(null)} style={buttonStyle('secondary')}>Cancel</button>
            </>
          ) : confirming === 'hand' ? (
            <>
              <span style={{ fontSize: 13, color: INK }}>Mark {chosenReady.length} session{chosenReady.length === 1 ? '' : 's'} as typed into EI-Hub by hand? They won't go in a claim file.</span>
              <button type="button" disabled={busy} onClick={() => markByHand(chosenReady, true)} style={buttonStyle('primary')}>Mark entered</button>
              <button type="button" disabled={busy} onClick={() => setConfirming(null)} style={buttonStyle('secondary')}>Cancel</button>
            </>
          ) : (
            <>
              {chosenEntered.length > 0 && (
                <button type="button" disabled={busy} onClick={() => markByHand(chosenEntered, false)} style={buttonStyle('secondary')}>Undo entered by hand</button>
              )}
              <button type="button" disabled={busy || !chosenReady.length} onClick={() => setConfirming('hand')} style={buttonStyle('secondary')}>Mark entered by hand</button>
              <button type="button" disabled={busy || fileBlocked || chosenReady.length > data.test_limit}
                title={chosenReady.length > data.test_limit ? `A test file can hold up to ${data.test_limit} claims` : undefined}
                onClick={() => makeFile(true)} style={buttonStyle('secondary')}>Make test file</button>
              <button type="button" disabled={busy || fileBlocked} onClick={() => setConfirming('file')} style={buttonStyle('primary')}>Make claim file</button>
            </>
          )}
        </div>
        {notice && <p role={notice.error ? 'alert' : 'status'} style={{ margin: 0, padding: '10px 16px', fontSize: 13, color: notice.error ? TONES.danger.fg : TONES.success.fg, borderTop: `1px solid ${HAIRLINE}` }}>{notice.error || notice.ok}</p>}
      </div>

      {data.files.length > 0 && (
        <div style={{ background: 'white', border: `1px solid ${HAIRLINE}`, borderRadius: 12, padding: 16 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: INK }}>Claim files</h3>
          {data.files.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '6px 0', borderBottom: `1px solid ${HAIRLINE}`, fontSize: 13 }}>
              <span style={{ fontWeight: 500 }}>{f.file_name}</span>
              {f.test && <Tag tone="neutral">Test</Tag>}
              <span style={{ color: MUTED }}>{f.claim_count} claim{f.claim_count === 1 ? '' : 's'} · {fmtShort(f.created_at)} by {nameOf(f.created_by)}</span>
              <span style={{ flex: 1 }} />
              <button type="button" onClick={() => downloadAgain(f.id)} style={buttonStyle('text')}>Download again</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
