import { useRef, useState } from 'react';
import { api } from './api';
import { readEiHubFile } from './eiHubFile';
import { Card, Tag } from './dashboardUi';
import { INK, MUTED, HAIRLINE, TONES, NUMERIC, buttonStyle } from './uiTokens';

// Billing -> EI-Hub Entry -> Import (Reception, Admins and Developers;
// kidz-lounge-api lib/eiImport.js). Choose EI-Hub's Child Info and
// Authorizations download; the file is read here (src/eiHubFile.js), the
// server lists what it would change -- new authorizations, changed EI
// details, referring providers, IFSP dates, service coordinators -- and only
// the ticked changes are applied (Kieran, Oct 2026: "show me first").

const KIND_ORDER = ['link', 'child', 'auth', 'referral', 'ifsp', 'sc'];
const KIND_LABEL = { link: 'ID #', child: 'EI details', auth: 'Authorizations', referral: 'Referring providers', ifsp: 'IFSP', sc: 'Service coordinators' };
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
  const [done, setDone] = useState(null);       // applied counts

  const choose = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setError(null); setDone(null); setPreview(null); setBusy('reading');
    try {
      const data = await readEiHubFile(f);
      const p = await api.previewEiImport(data);
      setFile({ name: f.name, ...data });
      setPreview(p);
      setPicked(new Set(p.changes.map(c => c.id)));
    } catch (err) {
      setError(err.message);
    }
    setBusy(null);
  };

  const apply = async () => {
    setError(null); setBusy('applying');
    try {
      const r = await api.applyEiImport({ headers: file.headers, rows: file.rows }, [...picked]);
      setDone(r.applied);
      setPreview(null); setFile(null);
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
          In EI-Hub, open <strong>Child Info and Authorizations</strong> (under Reports) and click <strong>Excel</strong>. Choose that file here: you'll see every change before anything is saved.
        </p>
        {error && <p role="alert" style={{ margin: '10px 0 0', fontSize: 13, color: TONES.danger.fg }}>{error}</p>}
        {done && (
          <p role="status" style={{ margin: '10px 0 0', fontSize: 13, color: TONES.success.fg }}>
            Imported: {KIND_ORDER.filter(k => done[k]).map(k => `${KIND_LABEL[k]} ${done[k]}`).join(' · ')}
          </p>
        )}
      </Card>

      {preview && (
        <>
          <Card pad={16}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 300px', fontSize: 13, color: INK, ...NUMERIC }}>
                <strong>{file.name}</strong>
                <span style={{ color: MUTED }}> · {plural(preview.rows_used, 'row')} with your therapists · {plural(preview.children, 'child')}: {preview.matched} found, {preview.unmatched.length} not in Kidz Lounge · {plural(preview.changes.length, 'change')}{preview.unchanged ? ` · ${preview.unchanged} already up to date` : ''}</span>
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
            {(preview.skipped.other_therapist > 0 || preview.skipped.no_therapist > 0) && (
              <p style={{ margin: '8px 0 0', fontSize: 12.5, color: MUTED, ...NUMERIC }}>
                Left out: {[
                  preview.skipped.other_therapist ? `${plural(preview.skipped.other_therapist, 'row')} with a therapist NPI that isn't one of your providers'` : null,
                  preview.skipped.no_therapist ? `${plural(preview.skipped.no_therapist, 'row')} with no therapist` : null,
                ].filter(Boolean).join(' and ')}.
              </p>
            )}
            {!preview.authorizations_available && (
              <p style={{ margin: '10px 0 0', fontSize: 12.5, color: TONES.warning.fg }}>Authorizations can't be saved until the 2026-10-24 database update is run. Ask an admin to run it.</p>
            )}
            {preview.changes.length === 0 && <p style={{ margin: '10px 0 0', fontSize: 13, color: MUTED }}>{preview.rows_used ? 'Everything in this file is already in Kidz Lounge.' : 'None of the rows have one of your therapists.'}</p>}
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
              <p style={{ margin: '-6px 0 8px', fontSize: 12.5, color: MUTED }}>No patient has these EI child IDs (or the same name and date of birth). Add the patient with their ID #, then import again.</p>
              {preview.unmatched.map(u => (
                <div key={u.ei_child_id} style={{ display: 'flex', gap: 14, flexWrap: 'wrap', padding: '6px 0', borderTop: `1px solid ${HAIRLINE}`, fontSize: 13, ...NUMERIC }}>
                  <span style={{ minWidth: 160, fontWeight: 500, color: INK }}>{u.name || '—'}</span>
                  <span style={{ color: MUTED }}>EI child ID {u.ei_child_id}</span>
                  {u.date_of_birth && <span style={{ color: MUTED }}>Born {fmtDate(u.date_of_birth)}</span>}
                  <span style={{ color: MUTED }}>{plural(u.authorizations, 'authorization')}</span>
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
