import { useEffect, useState } from 'react';
import { api } from './api';
import { DateField } from './pages/SchedulePage';
import { IFSP_TYPE_OPTIONS } from './ifspTypes';
import { eiInput, eiLabel, eiGrid } from './eiHubUi';
import { TONES, buttonStyle, choiceStyle } from './uiTokens';
import { formatPhone } from './phone';

// The patient chart's IFSP tab (the "ei" feature, PedsDesk only, Oct 2026;
// API routes/ifsp.js, lib/ifsp.js). Every IFSP period the child has had,
// with its outcomes and the IFSP PDF (uploaded into the child's Documents
// as type "IFSP"), the current one's progress report date, and turning 3.
// Reception, Admins and Developers edit; a provider sees it for children on
// their caseload (Kieran, Oct 2026). Saving the current IFSP also updates
// the patient's IFSP dates and Report Date, so the usual reminders follow.

const MUTED = 'var(--brand-muted)';
const INK = 'var(--brand-ink)';
const LINE = 'var(--brand-line)';
const ACCENT = 'var(--brand-primary)';
const RED = TONES.danger.fg;
const GREEN = TONES.success.fg;
const AMBER = TONES.warning.fg;

const TYPES = [...IFSP_TYPE_OPTIONS, 'Amendment'];
const SERVICES = ['ST', 'OT', 'PT', 'SI'];
const ELIGIBLE = [['', 'Not known yet'], ['pending', 'Being evaluated'], ['yes', 'Eligible'], ['no', 'Not eligible']];

const fmt = (s) => (s ? new Date(`${String(s).slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null);
const daysBetween = (from, to) => Math.round((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000);

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, padding: '5px 0', borderBottom: `1px solid ${LINE}` }}>
      <span style={{ color: MUTED, flexShrink: 0 }}>{label}</span>
      <span style={{ color: INK, fontWeight: 500, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>{children}</span>
    </div>
  );
}

// A deadline: done (green, with the date), overdue (red), due within two
// weeks (amber), or just the date.
function Due({ date, today, doneOn, doneText = 'Done' }) {
  if (doneOn) return <span style={{ color: GREEN }}>{doneText} {fmt(doneOn)}</span>;
  if (!date) return '—';
  const left = daysBetween(today, date);
  const color = left < 0 ? RED : left <= 14 ? AMBER : INK;
  const note = left < 0 ? ` (${-left} day${left === -1 ? '' : 's'} late)` : left <= 14 ? ` (in ${left} day${left === 1 ? '' : 's'})` : '';
  return <span style={{ color }}>{fmt(date)}{note}</span>;
}

function openDocument(id) {
  api.getDocumentDownloadUrl(id).then(r => window.open(r.downloadUrl, '_blank', 'noopener')).catch(err => window.alert(err.message));
}

const linkButton = { border: 'none', background: 'none', padding: 0, color: ACCENT, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };

function Outcomes({ outcomes }) {
  if (!outcomes.length) return <p style={{ fontSize: 13, color: MUTED, margin: '8px 0 0' }}>No outcomes entered.</p>;
  return (
    <ol style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 13, color: INK }}>
      {outcomes.map(o => (
        <li key={o.id} style={{ padding: '4px 0', lineHeight: 1.45 }}>
          {o.outcome}
          {o.services.length > 0 && <span style={{ color: MUTED, fontSize: 12 }}> · {o.services.join(', ')}</span>}
        </li>
      ))}
    </ol>
  );
}

// Add or edit an IFSP period. `existing` null = new; `seed` fills a new one
// (the service coordinator from the current IFSP / the chart).
function IfspForm({ patient, existing, seed, onSaved, onCancel }) {
  const start = existing || seed || {};
  const [form, setForm] = useState({
    ifsp_type: start.ifsp_type || '', meeting_date: start.meeting_date || '', start_date: existing?.start_date || '', end_date: existing?.end_date || '',
    sc_name: start.sc_name || '', sc_company: start.sc_company || '', sc_phone: formatPhone(start.sc_phone), sc_email: start.sc_email || '',
    notes: existing?.notes || '',
  });
  const [outcomes, setOutcomes] = useState(existing?.outcomes?.length ? existing.outcomes.map(o => ({ outcome: o.outcome, services: o.services })) : [{ outcome: '', services: [] }]);
  const [doc, setDoc] = useState(existing?.document_id ? { id: existing.document_id, filename: existing.document_name } : null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v && v.target ? v.target.value : v }));
  const setOutcome = (i, patch) => setOutcomes(list => list.map((o, j) => (j === i ? { ...o, ...patch } : o)));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      let documentId = doc?.id ?? null;
      if (file) {
        // The PDF goes into the child's Documents (type IFSP) like any upload.
        const { uploadUrl, s3Key } = await api.getDocumentUploadUrl(patient.id, file.name, file.type);
        const up = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } });
        if (!up.ok) throw new Error('The IFSP file could not be uploaded. Try again.');
        const saved = await api.registerPatientDocument(patient.id, { filename: file.name, s3_key: s3Key, content_type: file.type, file_size: file.size, document_type: 'IFSP' });
        documentId = saved.id;
        setDoc({ id: saved.id, filename: saved.filename });
        setFile(null);
      }
      const record = { ...form, document_id: documentId, outcomes: outcomes.filter(o => o.outcome.trim()) };
      if (existing) await api.updateIfsp(patient.id, existing.id, record);
      else await api.addIfsp(patient.id, record);
      onSaved();
    } catch (err) {
      setError(err.message || 'Could not save the IFSP.');
    }
    setBusy(false);
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteIfsp(patient.id, existing.id);
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 12, marginTop: 4 }}>
      <div style={eiGrid}>
        <div>
          <label htmlFor="ifsp-type" style={eiLabel}>IFSP type</label>
          <select id="ifsp-type" value={form.ifsp_type} onChange={set('ifsp_type')} style={eiInput}>
            <option value="">Choose...</option>
            {[...TYPES, ...(form.ifsp_type && !TYPES.includes(form.ifsp_type) ? [form.ifsp_type] : [])].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div><span style={eiLabel}>Meeting date</span><DateField clearable style={eiInput} ariaLabel="Meeting date" value={form.meeting_date} onChange={set('meeting_date')} /></div>
        <div><span style={eiLabel}>Starts</span><DateField style={eiInput} ariaLabel="IFSP start date" value={form.start_date} onChange={set('start_date')} /></div>
        <div><span style={eiLabel}>Ends (next review)</span><DateField clearable style={eiInput} ariaLabel="IFSP end date" min={form.start_date || undefined} value={form.end_date} onChange={set('end_date')} /></div>
      </div>

      <p style={{ fontSize: 12.5, fontWeight: 600, color: INK, margin: '16px 0 6px' }}>Service coordinator</p>
      <div style={eiGrid}>
        {[['sc_name', 'Name'], ['sc_company', 'Agency'], ['sc_phone', 'Phone'], ['sc_email', 'Email']].map(([k, label]) => (
          <div key={k}>
            <label htmlFor={`ifsp-${k}`} style={eiLabel}>{label}</label>
            <input id={`ifsp-${k}`} value={form[k]} style={eiInput}
              onChange={k === 'sc_phone' ? (e => setForm(f => ({ ...f, sc_phone: formatPhone(e.target.value) }))) : set(k)}
              type={k === 'sc_email' ? 'email' : k === 'sc_phone' ? 'tel' : 'text'} inputMode={k === 'sc_phone' ? 'numeric' : undefined}
              placeholder={k === 'sc_phone' ? '(555) 555-5555' : undefined} />
          </div>
        ))}
      </div>

      <p style={{ fontSize: 12.5, fontWeight: 600, color: INK, margin: '16px 0 6px' }}>Outcomes</p>
      {outcomes.map((o, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: MUTED, paddingTop: 8, width: 18 }}>{i + 1}.</span>
          <textarea aria-label={`Outcome ${i + 1}`} value={o.outcome} onChange={e => setOutcome(i, { outcome: e.target.value })} rows={2}
            placeholder="e.g. Sam will use 10 words to ask for what he wants during play and meals."
            style={{ ...eiInput, flex: '1 1 260px', resize: 'vertical', lineHeight: 1.4 }} />
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', paddingTop: 2 }}>
            {SERVICES.map(s => {
              const on = o.services.includes(s);
              return (
                <button key={s} type="button" aria-pressed={on} onClick={() => setOutcome(i, { services: on ? o.services.filter(x => x !== s) : [...o.services, s] })}
                  style={{ ...choiceStyle(on), padding: '4px 8px', fontSize: 12 }}>{s}</button>
              );
            })}
            <button type="button" aria-label={`Remove outcome ${i + 1}`} onClick={() => setOutcomes(list => list.filter((_, j) => j !== i))}
              style={{ ...buttonStyle('text'), color: MUTED }}>Remove</button>
          </div>
        </div>
      ))}
      <button type="button" onClick={() => setOutcomes(list => [...list, { outcome: '', services: [] }])} style={linkButton}>+ Add outcome</button>

      <p style={{ fontSize: 12.5, fontWeight: 600, color: INK, margin: '16px 0 6px' }}>IFSP document</p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
        {doc && !file && <button type="button" onClick={() => openDocument(doc.id)} style={linkButton}>{doc.filename || 'Open the IFSP'}</button>}
        <input type="file" accept="application/pdf,image/*" aria-label="Attach the IFSP" onChange={e => setFile(e.target.files?.[0] || null)} style={{ fontSize: 12.5 }} />
        {doc && !file && <button type="button" onClick={() => setDoc(null)} style={{ ...buttonStyle('text'), color: MUTED }}>Unlink</button>}
      </div>

      <label htmlFor="ifsp-notes" style={{ ...eiLabel, marginTop: 14 }}>Notes</label>
      <textarea id="ifsp-notes" value={form.notes} onChange={set('notes')} rows={2} style={{ ...eiInput, resize: 'vertical' }} />

      {error && <p role="alert" style={{ fontSize: 13, color: RED, margin: '10px 0 0' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <button type="button" disabled={busy} onClick={save} style={buttonStyle('primary')}>{busy ? 'Saving...' : existing ? 'Save changes' : 'Add IFSP'}</button>
        <button type="button" disabled={busy} onClick={onCancel} style={buttonStyle('secondary')}>Cancel</button>
        {existing && !confirmRemove && <button type="button" disabled={busy} onClick={() => setConfirmRemove(true)} style={buttonStyle('danger', { marginLeft: 'auto' })}>Remove</button>}
        {existing && confirmRemove && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: INK, flexWrap: 'wrap' }}>
            Remove this IFSP? The PDF stays in Documents.
            <button type="button" disabled={busy} onClick={remove} style={buttonStyle('danger')}>Remove</button>
            <button type="button" disabled={busy} onClick={() => setConfirmRemove(false)} style={buttonStyle('secondary')}>Keep</button>
          </span>
        )}
      </div>
    </div>
  );
}

function TransitionForm({ patient, record, onSaved, onCancel }) {
  const r = record || {};
  const [form, setForm] = useState({
    cpse_notified_date: r.cpse_notified_date || '', parent_opted_out: !!r.parent_opted_out, conference_date: r.conference_date || '',
    cpse_eligible: r.cpse_eligible || '', ei_end_date: r.ei_end_date || '', notes: r.notes || '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v && v.target ? v.target.value : v }));
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.saveTransition(patient.id, form);
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 12, marginTop: 8 }}>
      <div style={eiGrid}>
        <div><span style={eiLabel}>CPSE told on</span><DateField clearable style={eiInput} ariaLabel="CPSE told on" value={form.cpse_notified_date} onChange={set('cpse_notified_date')} /></div>
        <div><span style={eiLabel}>Conference held on</span><DateField clearable style={eiInput} ariaLabel="Transition conference date" value={form.conference_date} onChange={set('conference_date')} /></div>
        <div>
          <label htmlFor="tr-eligible" style={eiLabel}>CPSE eligibility</label>
          <select id="tr-eligible" value={form.cpse_eligible} onChange={set('cpse_eligible')} style={eiInput}>
            {ELIGIBLE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div><span style={eiLabel}>EI ends on (if not the day before turning 3)</span><DateField clearable style={eiInput} ariaLabel="EI end date" value={form.ei_end_date} onChange={set('ei_end_date')} /></div>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: INK, marginTop: 12, cursor: 'pointer' }}>
        <input type="checkbox" checked={form.parent_opted_out} onChange={e => setForm(f => ({ ...f, parent_opted_out: e.target.checked }))} />
        The parent opted out of telling the CPSE
      </label>
      <label htmlFor="tr-notes" style={{ ...eiLabel, marginTop: 12 }}>Notes</label>
      <textarea id="tr-notes" value={form.notes} onChange={set('notes')} rows={2} style={{ ...eiInput, resize: 'vertical' }} />
      {error && <p role="alert" style={{ fontSize: 13, color: RED, margin: '10px 0 0' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button type="button" disabled={busy} onClick={save} style={buttonStyle('primary')}>{busy ? 'Saving...' : 'Save'}</button>
        <button type="button" disabled={busy} onClick={onCancel} style={buttonStyle('secondary')}>Cancel</button>
      </div>
    </div>
  );
}

export default function IfspTab({ patient, headerStyle, boxStyle, onPatientChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(null); // 'new' | ifsp id | 'transition'
  useEffect(() => {
    let alive = true;
    api.getIfsp(patient.id)
      .then(d => { if (alive) { setData(d); setError(null); } })
      .catch(err => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [patient.id, reload]);

  const saved = () => { setEditing(null); setReload(n => n + 1); if (onPatientChanged) onPatientChanged(); };

  if (error) return <div style={boxStyle}><p role="alert" style={{ margin: 0, fontSize: 13, color: RED }}>{error}</p></div>;
  if (!data) return <p style={{ fontSize: 13, color: MUTED }}>Loading...</p>;

  const { today, can_edit: canEdit, ifsps, transition } = data;
  const current = ifsps.find(i => i.id === data.current_id) || null;
  const sc = current?.sc_name ? current : { sc_name: data.service_coordinator.name, sc_phone: data.service_coordinator.phone, sc_email: data.service_coordinator.email };
  const t = transition.dates;
  const rec = transition.record || {};

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <p style={headerStyle}>Current IFSP</p>
        {canEdit && editing !== 'new' && (
          <button type="button" onClick={() => setEditing('new')} style={linkButton}>+ New IFSP</button>
        )}
      </div>
      <div style={boxStyle}>
        {editing === 'new' && (
          <IfspForm patient={patient} seed={current ? { sc_name: current.sc_name, sc_company: current.sc_company, sc_phone: current.sc_phone, sc_email: current.sc_email } : { sc_name: sc.sc_name, sc_phone: sc.sc_phone, sc_email: sc.sc_email }}
            onSaved={saved} onCancel={() => setEditing(null)} />
        )}
        {editing !== 'new' && !current && (
          <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>No IFSP entered yet.{canEdit ? ' Add one from the IFSP document with + New IFSP.' : ''}</p>
        )}
        {editing !== 'new' && current && (editing === current.id
          ? <IfspForm patient={patient} existing={current} onSaved={saved} onCancel={() => setEditing(null)} />
          : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', marginBottom: 4, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 14, color: INK }}>{current.ifsp_type}</strong>
                <span style={{ display: 'flex', gap: 14 }}>
                  {current.document_id && <button type="button" onClick={() => openDocument(current.document_id)} style={linkButton}>Open IFSP</button>}
                  {canEdit && <button type="button" onClick={() => setEditing(current.id)} style={linkButton}>Edit</button>}
                </span>
              </div>
              <Row label="Dates">{fmt(current.start_date)} – {fmt(current.end_date) || 'no end date'}</Row>
              {current.meeting_date && <Row label="Meeting">{fmt(current.meeting_date)}</Row>}
              <Row label="Progress report due"><Due date={current.report_due} today={today} /></Row>
              <Row label="Service coordinator">
                {sc.sc_name ? [sc.sc_name, sc.sc_company, sc.sc_phone, sc.sc_email].filter(Boolean).join(' · ') : '—'}
              </Row>
              {current.notes && <p style={{ fontSize: 13, color: INK, margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{current.notes}</p>}
              <p style={{ fontSize: 12.5, fontWeight: 600, color: INK, margin: '14px 0 0' }}>Outcomes</p>
              <Outcomes outcomes={current.outcomes} />
            </>
          ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <p style={headerStyle}>Turning 3</p>
        {canEdit && t && editing !== 'transition' && <button type="button" onClick={() => setEditing('transition')} style={linkButton}>Update</button>}
      </div>
      <div style={boxStyle}>
        {!t && <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Add the child's date of birth to see the turning 3 dates.</p>}
        {t && (
          <>
            <Row label="Turns 3">{fmt(t.third_birthday)}</Row>
            <Row label="Tell the CPSE by">
              {rec.parent_opted_out ? <span style={{ color: MUTED }}>Parent opted out</span> : <Due date={t.cpse_notice_by} today={today} doneOn={rec.cpse_notified_date} doneText="Told" />}
            </Row>
            <Row label="Transition conference">
              {rec.conference_date
                ? <Due doneOn={rec.conference_date} doneText="Held" />
                : <span>{fmt(t.conference_from)} to <Due date={t.conference_by} today={today} /></span>}
            </Row>
            <Row label="CPSE eligibility">{(ELIGIBLE.find(([v]) => v === (rec.cpse_eligible || '')) || ELIGIBLE[0])[1]}</Row>
            <Row label="EI ends">
              {fmt(rec.ei_end_date || t.ei_ends)}
              {!rec.ei_end_date && rec.cpse_eligible === 'yes' && <span style={{ color: MUTED, fontWeight: 400 }}> (may continue to {fmt(t.may_continue_until)} if the parent chooses)</span>}
            </Row>
            {rec.notes && <p style={{ fontSize: 13, color: INK, margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{rec.notes}</p>}
            {editing === 'transition' && <TransitionForm patient={patient} record={transition.record} onSaved={saved} onCancel={() => setEditing(null)} />}
          </>
        )}
      </div>

      {ifsps.length > 1 && (
        <>
          <p style={headerStyle}>Earlier IFSPs</p>
          <div style={boxStyle}>
            {ifsps.filter(i => i.id !== data.current_id).map(i => (
              <div key={i.id} style={{ padding: '8px 0', borderBottom: `1px solid ${LINE}` }}>
                {editing === i.id
                  ? <IfspForm patient={patient} existing={i} onSaved={saved} onCancel={() => setEditing(null)} />
                  : (
                    <>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', fontSize: 13 }}>
                        <strong style={{ color: INK }}>{i.ifsp_type}</strong>
                        <span style={{ color: i.start_date > today ? INK : MUTED }}>{fmt(i.start_date)} – {fmt(i.end_date) || 'no end date'}{i.start_date > today ? ' (upcoming)' : ''}</span>
                        <span style={{ marginLeft: 'auto', display: 'flex', gap: 14 }}>
                          {i.document_id && <button type="button" onClick={() => openDocument(i.document_id)} style={linkButton}>Open</button>}
                          {canEdit && <button type="button" onClick={() => setEditing(i.id)} style={linkButton}>Edit</button>}
                        </span>
                      </div>
                      <Outcomes outcomes={i.outcomes} />
                    </>
                  )}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
