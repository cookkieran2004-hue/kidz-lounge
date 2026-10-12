import { useRef, useState } from 'react';
import { api } from './api';
import { readEiHubFile } from './eiHubFile';
import { Card, Tag } from './dashboardUi';
import { INK, MUTED, HAIRLINE, TONES, NUMERIC, buttonStyle } from './uiTokens';

// Billing -> EI-Hub Entry -> Import (Reception, Admins and Developers;
// kidz-lounge-api lib/eiImport.js). Choose EI-Hub's Child Info and
// Authorizations download; the file is read here (src/eiHubFile.js), the
// server lists what it would change -- EI mandates (service, sessions x
// minutes, auth #), new authorizations, changed EI details, referring
// providers, IFSP dates, service coordinators -- and only
// the ticked changes are applied (Kieran, Oct 2026: "show me first").

const KIND_ORDER = ['link', 'child', 'redate', 'mandate', 'auth', 'referral', 'ifsp', 'sc'];
const KIND_LABEL = { link: 'ID #', child: 'EI details', redate: 'Dates moved', mandate: 'EI mandates', auth: 'Authorizations', referral: 'Referring providers', ifsp: 'IFSP', sc: 'Service coordinators' };
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const fmtDate = (v) => new Date(`${v}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const show = (v) => (v === null || v === undefined || v === '' ? '—' : isDate(v) ? fmtDate(v) : String(v));
const plural = (n, word) => `${n} ${n === 1 ? word : word === 'child' ? 'children' : `${word}s`}`;

export default function EiHubImport() {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);       // { name, headers, rows }
  const [preview, setPreview] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const [busy, setBusy] = useState(null);       // 'reading' | 'applying'
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);       // { applied, failed }
  // Children matched to a patient by hand: { child id key: patient id }.
  const [matches, setMatches] = useState({});
  const [patients, setPatients] = useState(null); // for "Match to patient"

  const choose = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setError(null); setDone(null); setPreview(null); setMatches({}); setBusy('reading');
    try {
      const data = await readEiHubFile(f);
      const p = await api.previewEiImport(data);
      setFile({ name: f.name, ...data });
      setPreview(p);
      // All ticked except an exited child's (c.unticked).
      setPicked(new Set(p.changes.filter(c => !c.unticked).map(c => c.id)));
      if (p.unmatched.length && !patients) api.getPatients().then(list => setPatients((list || []).map(x => ({ id: x.id, name: x.Name })).sort((a, b) => a.name.localeCompare(b.name)))).catch(() => {});
    } catch (err) {
      setError(err.message);
    }
    setBusy(null);
  };

  // Matching a child by hand re-checks the file with that match; the new
  // changes it brings are ticked, the rest keep their ticks.
  const match = async (key, patientId) => {
    const next = { ...matches };
    if (patientId) next[key] = patientId; else delete next[key];
    setError(null); setBusy('reading');
    try {
      const p = await api.previewEiImport({ headers: file.headers, rows: file.rows, matches: next });
      const before = new Set(preview.changes.map(c => c.id));
      setPicked(old => new Set(p.changes.filter(c => old.has(c.id) || (!before.has(c.id) && !c.unticked)).map(c => c.id)));
      setMatches(next);
      setPreview(p);
    } catch (err) {
      setError(err.message);
    }
    setBusy(null);
  };

  const apply = async () => {
    setError(null); setBusy('applying');
    try {
      const r = await api.applyEiImport({ headers: file.headers, rows: file.rows, matches }, [...picked]);
      setDone(r);
      setPreview(null); setFile(null); setMatches({});
    } catch (err) {
      setError(err.message);
    }
    setBusy(null);
  };

  const toggle = (id) => setPicked(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const byPatient = [];
  if (preview) {
    const groups = new Map();
    for (const c of preview.changes) {
      if (!groups.has(c.patient_id)) groups.set(c.patient_id, { name: c.patient_name, id: c.ei_child_id, changes: [] });
      groups.get(c.patient_id).changes.push(c);
    }
    for (const g of groups.values()) {
      g.changes.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
      byPatient.push(g);
    }
    byPatient.sort((a, b) => a.name.localeCompare(b.name));
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Card title="Import from EI-Hub" pad={16}
        action={
          <>
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv,.htm,.html" onChange={choose} style={{ display: 'none' }} />
            <button type="button" onClick={() => inputRef.current?.click()} disabled={!!busy} style={buttonStyle(preview ? 'secondary' : 'primary')}>
              {busy === 'reading' ? 'Reading...' : preview ? 'Choose another file' : 'Choose file'}
            </button>
          </>
        }>
        <p style={{ margin: 0, fontSize: 13, color: INK, lineHeight: 1.5 }}>
          In EI-Hub, open <strong>Child Info and Authorizations</strong> (under Reports in Case Management Module) and click <strong>Excel</strong>. Choose that file here: you'll see every change before anything is saved.
        </p>
        {error && <p role="alert" style={{ margin: '10px 0 0', fontSize: 13, color: TONES.danger.fg }}>{error}</p>}
        {done && KIND_ORDER.some(k => done.applied[k]) && (
          <p role="status" style={{ margin: '10px 0 0', fontSize: 13, color: TONES.success.fg }}>
            Imported: {KIND_ORDER.filter(k => done.applied[k]).map(k => `${KIND_LABEL[k]} ${done.applied[k]}`).join(' · ')}
          </p>
        )}
        {done && (done.failed || []).length > 0 && (
          <div role="alert" style={{ marginTop: 10, fontSize: 13 }}>
            <div style={{ color: TONES.danger.fg, fontWeight: 600 }}>{plural(done.failed.length, 'change')} couldn't be saved (everything else was):</div>
            {done.failed.map((f, i) => (
              <div key={i} style={{ padding: '4px 0', borderTop: i ? `1px solid ${HAIRLINE}` : 'none', color: INK }}>
                <strong>{f.patient_name}</strong> · {f.title}: <span style={{ color: TONES.danger.fg }}>{f.error}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {preview && (
        <>
          <Card pad={16}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 300px', fontSize: 13, color: INK, ...NUMERIC }}>
                <strong>{file.name}</strong>
                <span style={{ color: MUTED }}> · {plural(preview.children, 'child')}: {preview.matched} with sessions, {preview.unmatched.length} not in Kidz Lounge · {plural(preview.changes.length, 'change')}{preview.unchanged ? ` · ${preview.unchanged} already up to date` : ''}</span>
              </div>
              {preview.changes.length > 0 && (
                <>
                  <button type="button" onClick={() => setPicked(picked.size === preview.changes.length ? new Set() : new Set(preview.changes.map(c => c.id)))} style={buttonStyle('text')}>
                    {picked.size === preview.changes.length ? 'Untick all' : 'Tick all'}
                  </button>
                  <button type="button" onClick={apply} disabled={!picked.size || !!busy} style={buttonStyle('primary', { opacity: !picked.size || busy ? 0.6 : 1 })}>
                    {busy === 'applying' ? 'Applying...' : `Apply ${plural(picked.size, 'change')}`}
                  </button>
                </>
              )}
            </div>
            {preview.skipped.no_sessions > 0 && (
              <p style={{ margin: '8px 0 0', fontSize: 12.5, color: MUTED, ...NUMERIC }}>
                Left out: {plural(preview.skipped.no_sessions, 'child')} with no sessions in Kidz Lounge ({plural(preview.skipped.rows, 'row')}).
              </p>
            )}
            {!preview.authorizations_available && (
              <p style={{ margin: '10px 0 0', fontSize: 12.5, color: TONES.warning.fg }}>Authorizations can't be saved until the 2026-10-24 database update is run. Ask an admin to run it.</p>
            )}
            {preview.changes.length === 0 && <p style={{ margin: '10px 0 0', fontSize: 13, color: MUTED }}>{preview.rows_used ? 'Everything in this file is already in Kidz Lounge.' : 'None of the children in this file have sessions in Kidz Lounge.'}</p>}
          </Card>

          {byPatient.map(g => (
            <Card key={g.name + g.id} pad={0}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '10px 16px', borderBottom: `1px solid ${HAIRLINE}` }}>
                <strong style={{ fontSize: 14, color: INK }}>{g.name}</strong>
                {g.id && <span style={{ fontSize: 12.5, color: MUTED, ...NUMERIC }}>EI child ID {g.id}</span>}
              </div>
              {g.changes.map((c, i) => (
                <label key={c.id} style={{ display: 'flex', gap: 10, padding: '10px 16px', borderTop: i ? `1px solid ${HAIRLINE}` : 'none', cursor: 'pointer', alignItems: 'flex-start' }}>
                  <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} style={{ marginTop: 3 }} aria-label={`Apply: ${c.title}`} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>{c.title}</span>
                      {c.note && <span style={{ fontSize: 12, color: MUTED }}>{c.note}</span>}
                    </div>
                    {c.fields.length > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, max-content) minmax(0, 1fr)', gap: '2px 14px', marginTop: 4, fontSize: 12.5, ...NUMERIC }}>
                        {c.fields.map(f => (
                          <div key={f.label} style={{ display: 'contents' }}>
                            <span style={{ color: MUTED }}>{f.label}</span>
                            <span style={{ color: INK, overflowWrap: 'anywhere' }}>
                              {f.from !== null && f.from !== undefined && f.from !== '' && <><span style={{ color: MUTED, textDecoration: 'line-through' }}>{show(f.from)}</span>{' → '}</>}
                              {show(f.to)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </Card>
          ))}

          {preview.unmatched.length > 0 && (
            <Card title="Not in Kidz Lounge" pad={16}>
              <p style={{ margin: '-6px 0 8px', fontSize: 12.5, color: MUTED }}>No patient has these EI child IDs, and none has the same name and date of birth. Pick the patient to bring them in (their ID # is set to the EI child ID), or add the patient first.</p>
              {preview.unmatched.map(u => (
                <div key={u.key || u.ei_child_id} style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', padding: '6px 0', borderTop: `1px solid ${HAIRLINE}`, fontSize: 13, ...NUMERIC }}>
                  <span style={{ minWidth: 160, fontWeight: 500, color: INK }}>{u.name || '—'}</span>
                  <span style={{ color: MUTED }}>EI child ID {u.ei_child_id}</span>
                  {u.date_of_birth && <span style={{ color: MUTED }}>Born {fmtDate(u.date_of_birth)}</span>}
                  <span style={{ color: MUTED }}>{plural(u.authorizations, 'authorization')}</span>
                  <select aria-label={`Match ${u.name || u.ei_child_id} to a patient`} value="" disabled={!!busy}
                    onChange={e => e.target.value && match(u.key, e.target.value)}
                    style={{ marginLeft: 'auto', padding: '5px 8px', borderRadius: 6, border: '1px solid #D4D4D8', fontSize: 13, fontFamily: 'inherit', background: 'white', maxWidth: 260 }}>
                    <option value="">Match to patient…</option>
                    {(u.suggestions || []).length > 0 && (
                      <optgroup label="Likely">
                        {u.suggestions.map(sg => <option key={sg.id} value={sg.id}>{sg.name}{sg.date_of_birth ? ` (born ${fmtDate(sg.date_of_birth)})` : ''}</option>)}
                      </optgroup>
                    )}
                    {patients && (
                      <optgroup label="All patients">
                        {patients.map(pt => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
                      </optgroup>
                    )}
                  </select>
                </div>
              ))}
            </Card>
          )}

          {preview.problems.length > 0 && (
            <Card title="Needs a look" pad={16}>
              {preview.problems.map((p, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '6px 0', borderTop: i ? `1px solid ${HAIRLINE}` : 'none', fontSize: 13 }}>
                  <Tag tone="warning">{p.patient_name || 'File'}</Tag>
                  <span style={{ color: INK }}>{p.message}</span>
                </div>
              ))}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
