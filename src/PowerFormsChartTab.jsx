import { useEffect, useState } from 'react';
import { api } from './api';
import { useStaffNames } from './staffDirectory';
import { useAuth } from './AuthContext';
import { canAdminister } from './roles';
import { PowerFormAnswers } from './PowerFormFields';
import { buildPowerFormPdf } from './powerForms';
import { Tag } from './dashboardUi';
import { INK, MUTED, HAIRLINE, TONES, NUMERIC, buttonStyle } from './uiTokens';

// The patient chart's Power Forms tab (Reception, Admins and Developers;
// kidz-lounge-api routes/powerForms.js). Send a form built in Admin -> Power
// Forms as a secure link (copied and sent by staff for now), see where each
// one stands, read the answers, apply the ones linked to chart fields after
// checking them, and file a PDF copy in the patient's Documents.

const DAYS = [3, 7, 14, 30];
const STATUS = {
  sent: { text: 'Sent', tone: 'neutral' },
  opened: { text: 'Opened', tone: 'accent' },
  completed: { text: 'Completed', tone: 'success' },
  needs_review: { text: 'Needs review', tone: 'warning' },
  expired: { text: 'Expired', tone: 'warning' },
  cancelled: { text: 'Cancelled', tone: 'neutral' },
};
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const input = { boxSizing: 'border-box', padding: '7px 9px', borderRadius: 6, border: '1px solid #D4D4D8', fontSize: 13, fontFamily: 'inherit', color: INK, background: 'white' };
const label = { display: 'block', fontSize: 12, fontWeight: 500, color: '#52525B', marginBottom: 4 };
const show = (v) => (v === true ? 'Yes' : v === false ? 'No' : v === null || v === undefined || v === '' ? '—' : String(v));

// The link to send, shown once (only a scrambled copy is kept).
function LinkBox({ token, days, onClose }) {
  const link = `${window.location.origin}/f/${token}`;
  const message = `Hi, Kidz Lounge has a form for you to fill in: ${link}\nYou'll need your child's date of birth to open it. The link works for ${days} days.`;
  const [copied, setCopied] = useState(null);
  const copy = async (what, text) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); } catch { setCopied('failed'); }
  };
  return (
    <div style={{ border: `1px solid ${HAIRLINE}`, borderRadius: 8, padding: 14, background: '#FAFAFA', display: 'grid', gap: 10 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>Send this link to the parent</div>
      <input readOnly aria-label="Form link" value={link} onFocus={e => e.target.select()} style={{ ...input, width: '100%', ...NUMERIC }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" onClick={() => copy('link', link)} style={buttonStyle('primary')}>Copy link</button>
        <button type="button" onClick={() => copy('message', message)} style={buttonStyle('secondary')}>Copy a message with the link</button>
        {copied && <span role="status" style={{ fontSize: 12.5, color: copied === 'failed' ? TONES.danger.fg : TONES.success.fg }}>{copied === 'failed' ? 'Couldn\'t copy. Select the link and copy it.' : 'Copied'}</span>}
        <button type="button" onClick={onClose} style={buttonStyle('text', { marginLeft: 'auto' })}>Done</button>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: MUTED }}>For privacy the link can't be shown again. If it's lost, use New link (the old one stops working).</p>
    </div>
  );
}

function SendForm({ patient, templates, onSent }) {
  const defaultTo = [patient.Parent_Name, patient.Relationship_To_Patient && `(${String(patient.Relationship_To_Patient).toLowerCase()})`].filter(Boolean).join(' ');
  const [templateId, setTemplateId] = useState('');
  const [recipient, setRecipient] = useState(defaultTo);
  const [days, setDays] = useState(7);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api.sendPowerForm({ patient_id: patient.id, template_id: Number(templateId), recipient, days });
      onSent(r.token, days);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };
  if (!templates.length) return <p style={{ margin: 0, fontSize: 13, color: MUTED }}>No forms to send yet. An admin builds them in Admin, Power Forms.</p>;
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 10 }}>
        <div>
          <label style={label} htmlFor="pf-send-form">Form</label>
          <select id="pf-send-form" style={{ ...input, width: '100%' }} value={templateId} onChange={e => setTemplateId(e.target.value)}>
            <option value="">Choose a form</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label style={label} htmlFor="pf-send-to">For (optional)</label>
          <input id="pf-send-to" style={{ ...input, width: '100%' }} value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="e.g. Maria Brown (mother)" />
        </div>
        <div>
          <label style={label} htmlFor="pf-send-days">Link works for</label>
          <select id="pf-send-days" style={{ ...input, width: '100%' }} value={days} onChange={e => setDays(Number(e.target.value))}>
            {DAYS.map(d => <option key={d} value={d}>{d} days</option>)}
          </select>
        </div>
      </div>
      {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: TONES.danger.fg }}>{error}</p>}
      <div><button type="button" onClick={send} disabled={busy || !templateId} style={buttonStyle('primary', { opacity: busy || !templateId ? 0.6 : 1 })}>{busy ? 'Making the link...' : 'Get the link'}</button></div>
    </div>
  );
}

// A completed form: answers, chart changes to apply, PDF.
function FormDetail({ id, patient, onChanged, onClose }) {
  const nameOf = useStaffNames();
  const [form, setForm] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [note, setNote] = useState(null);
  const [reload, setReload] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { user } = useAuth();
  useEffect(() => {
    let alive = true;
    api.getPowerForm(id)
      .then(f => { if (alive) { setForm(f); setPicked(new Set(f.changes.map(c => c.key))); } })
      .catch(err => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [id, reload]);

  const markReviewed = async () => {
    setBusy('review'); setError(null); setNote(null);
    try {
      await api.reviewPowerForm(id);
      setNote('Marked as reviewed.');
      setReload(n => n + 1);
      onChanged();
    } catch (err) {
      setError(err.message);
    }
    setBusy(null);
  };
  const apply = async () => {
    setBusy('apply'); setError(null); setNote(null);
    try {
      const r = await api.applyPowerForm(id, [...picked]);
      setNote(`Saved to the chart: ${form.changes.filter(c => r.applied.includes(c.key)).map(c => c.label).join(', ')}. The form is marked as reviewed.`);
      setReload(n => n + 1);
      onChanged();
    } catch (err) {
      setError(err.message);
    }
    setBusy(null);
  };
  // Admins and Developers only (the server checks too): the answers and the
  // saved PDF go for good; changes already applied to the chart stay.
  const remove = async () => {
    setBusy('delete'); setError(null); setNote(null);
    try {
      await api.deletePowerForm(id);
      onChanged();
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(null);
    }
  };
  const pdfName = () => `${form.form_name} - ${patient.Name} - ${day(form.completed_at)}.pdf`.replace(/[/\\]/g, '-');
  const download = async () => {
    setBusy('pdf'); setError(null);
    try {
      const blob = await buildPowerFormPdf(form, patient.Name);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = pdfName(); a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      setError(err.message || 'The PDF couldn\'t be made.');
    }
    setBusy(null);
  };
  const saveToDocuments = async () => {
    setBusy('save'); setError(null); setNote(null);
    try {
      const blob = await buildPowerFormPdf(form, patient.Name);
      const filename = pdfName();
      const { uploadUrl, s3Key } = await api.getDocumentUploadUrl(patient.id, filename, 'application/pdf');
      const up = await fetch(uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': 'application/pdf' } });
      if (!up.ok) throw new Error('Saving the PDF to storage failed.');
      const doc = await api.registerPatientDocument(patient.id, { filename, s3_key: s3Key, content_type: 'application/pdf', file_size: blob.size, document_type: 'Power Form' });
      await api.linkPowerFormDocument(id, doc.id);
      setNote('Saved to Documents.');
      setReload(n => n + 1);
      onChanged();
    } catch (err) {
      setError(err.message || 'Saving to Documents failed.');
    }
    setBusy(null);
  };

  if (error && !form) return <p role="alert" style={{ fontSize: 13, color: TONES.danger.fg }}>{error}</p>;
  if (!form) return <p style={{ fontSize: 13, color: MUTED }}>Loading...</p>;
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={onClose} style={buttonStyle('text', { padding: 0 })}>← All forms</button>
      </div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 600, color: INK }}>{form.form_name}</div>
        <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>
          Sent {when(form.created_at)} by {nameOf(form.created_by)}{form.recipient ? ` to ${form.recipient}` : ''} · Completed {when(form.completed_at)}
        </div>
      </div>

      {form.changes.length > 0 && (
        <div style={{ border: `1px solid ${HAIRLINE}`, borderRadius: 8, padding: 12, background: '#FAFAFA' }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: INK, marginBottom: 6 }}>Changes to the chart</div>
          {form.changes.map(c => (
            <label key={c.key} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '5px 0', fontSize: 13.5, cursor: 'pointer', flexWrap: 'wrap' }}>
              <input type="checkbox" checked={picked.has(c.key)} onChange={e => setPicked(s => { const n = new Set(s); if (e.target.checked) n.add(c.key); else n.delete(c.key); return n; })} />
              <span style={{ minWidth: 150, color: MUTED }}>{c.label}</span>
              <span style={{ color: INK }}>
                {c.from !== null && c.from !== '' && <><span style={{ color: MUTED, textDecoration: 'line-through' }}>{show(c.from)}</span>{' → '}</>}
                {show(c.to)}
              </span>
            </label>
          ))}
          <button type="button" onClick={apply} disabled={!!busy || !picked.size} style={buttonStyle('primary', { marginTop: 8, opacity: busy || !picked.size ? 0.6 : 1 })}>
            {busy === 'apply' ? 'Saving...' : 'Apply to the chart'}
          </button>
        </div>
      )}
      {form.applied_at && (
        <p style={{ margin: 0, fontSize: 12.5, color: MUTED }}>Applied to the chart {when(form.applied_at)} by {nameOf(form.applied_by)}.</p>
      )}
      {form.needs_review ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', borderRadius: 8, background: TONES.warning.bg, border: '1px solid #FEDF89' }}>
          <span style={{ fontSize: 13.5, color: TONES.warning.fg, fontWeight: 600, flex: '1 1 220px' }}>
            This form needs review.{form.changes.length ? ' Apply the changes above, or mark it reviewed if none are needed.' : ''}
          </span>
          <button type="button" onClick={markReviewed} disabled={!!busy} style={buttonStyle('secondary')}>{busy === 'review' ? 'Saving...' : 'Mark as reviewed'}</button>
        </div>
      ) : form.reviewed_at && (
        <p style={{ margin: 0, fontSize: 12.5, color: MUTED }}>Reviewed {when(form.reviewed_at)} by {nameOf(form.reviewed_by)}.</p>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {form.document_id
          ? <span style={{ fontSize: 13, color: TONES.success.fg }}>Saved to Documents</span>
          : <button type="button" onClick={saveToDocuments} disabled={!!busy} style={buttonStyle('secondary')}>{busy === 'save' ? 'Saving...' : 'Save PDF to Documents'}</button>}
        <button type="button" onClick={download} disabled={!!busy} style={buttonStyle('secondary')}>{busy === 'pdf' ? 'Making the PDF...' : 'Download PDF'}</button>
        {canAdminister(user) && !confirmDelete && (
          <button type="button" onClick={() => setConfirmDelete(true)} disabled={!!busy} style={buttonStyle('text', { color: TONES.danger.fg, marginLeft: 'auto' })}>Delete form</button>
        )}
      </div>
      {confirmDelete && (
        <div role="alert" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', borderRadius: 8, background: TONES.danger.bg }}>
          <span style={{ fontSize: 13.5, color: TONES.danger.fg, flex: '1 1 240px' }}>
            Delete this form for good? Its answers{form.document_id ? ' and its PDF in Documents' : ''} will be deleted.{form.applied_at ? ' Changes already applied to the chart stay.' : ''}
          </span>
          <button type="button" onClick={remove} disabled={!!busy} style={buttonStyle('danger')}>{busy === 'delete' ? 'Deleting...' : 'Delete'}</button>
          <button type="button" onClick={() => setConfirmDelete(false)} disabled={!!busy} style={buttonStyle('secondary')}>Keep</button>
        </div>
      )}
      {note && <p role="status" style={{ margin: 0, fontSize: 13, color: TONES.success.fg }}>{note}</p>}
      {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: TONES.danger.fg }}>{error}</p>}

      <div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: INK, marginBottom: 2 }}>Answers</div>
        <PowerFormAnswers fields={form.fields} answers={form.answers} />
      </div>
    </div>
  );
}

function FormRow({ r, first, onOpen, onLink, onChanged }) {
  const nameOf = useStaffNames();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState(null);
  const st = r.needs_review ? STATUS.needs_review : STATUS[r.status] || STATUS.sent;
  const open = r.status === 'sent' || r.status === 'opened';
  const cancel = async () => {
    try { await api.cancelPowerForm(r.id); onChanged(); } catch (err) { setError(err.message); }
    setConfirm(false);
  };
  const newLink = async () => {
    try { const res = await api.newPowerFormLink(r.id, 7); onLink(res.token, 7); onChanged(); } catch (err) { setError(err.message); }
  };
  const detail = r.status === 'completed' ? `Completed ${when(r.completed_at)}${r.reviewed_at ? ` · reviewed by ${nameOf(r.reviewed_by)}` : ''}${r.document_id ? ' · in Documents' : ''}`
    : r.status === 'cancelled' ? `Cancelled ${day(r.cancelled_at)} by ${nameOf(r.cancelled_by)}`
    : r.status === 'expired' ? `Expired ${day(r.expires_at)}`
    : `${r.opened_at ? `Opened ${when(r.opened_at)} · ` : ''}Link works until ${day(r.expires_at)}`;
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderTop: first ? 'none' : `1px solid ${HAIRLINE}`, flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 280px', minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: INK }}>{r.form_name}</span>
          <Tag tone={st.tone}>{st.text}</Tag>
        </div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
          Sent {day(r.created_at)} by {nameOf(r.created_by)}{r.recipient ? ` to ${r.recipient}` : ''} · {detail}
        </div>
        {error && <div role="alert" style={{ fontSize: 12, color: TONES.danger.fg }}>{error}</div>}
      </div>
      {r.status === 'completed' && <button type="button" onClick={onOpen} style={buttonStyle(r.needs_review ? 'primary' : 'secondary')}>{r.needs_review ? 'Review' : 'View answers'}</button>}
      {r.status !== 'completed' && <button type="button" onClick={newLink} style={buttonStyle('text')}>New link</button>}
      {open && (confirm ? (
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 12.5 }}>Cancel this form?</span>
          <button type="button" onClick={cancel} style={buttonStyle('danger', { padding: '4px 10px' })}>Cancel form</button>
          <button type="button" onClick={() => setConfirm(false)} style={buttonStyle('secondary', { padding: '4px 10px' })}>Keep</button>
        </span>
      ) : (
        <button type="button" onClick={() => setConfirm(true)} style={buttonStyle('text', { color: TONES.danger.fg })}>Cancel</button>
      ))}
    </div>
  );
}

export function PowerFormsChartTab({ patient, headerStyle, boxStyle, onReviewChange }) {
  const [templates, setTemplates] = useState(null);
  const [forms, setForms] = useState(null);
  const [error, setError] = useState(null);
  const [link, setLink] = useState(null); // { token, days }
  const [sending, setSending] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let alive = true;
    Promise.all([api.getPowerFormTemplates(), api.getPatientPowerForms(patient.id)])
      .then(([t, f]) => { if (alive) { setTemplates(t); setForms(f); } })
      .catch(err => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [patient.id, reload]);
  const refresh = () => { setReload(n => n + 1); onReviewChange?.(); };

  if (error) return <p role="alert" style={{ fontSize: 13, color: TONES.danger.fg }}>{error}</p>;
  if (!templates || !forms) return <p style={{ fontSize: 13, color: MUTED }}>Loading...</p>;
  if (openId) {
    return (
      <div style={boxStyle}>
        <FormDetail id={openId} patient={patient} onChanged={refresh} onClose={() => setOpenId(null)} />
      </div>
    );
  }
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <p style={{ ...headerStyle, margin: 0 }}>Power Forms</p>
        <span style={{ flex: 1 }} />
        {!sending && !link && <button type="button" onClick={() => setSending(true)} style={buttonStyle('primary', { padding: '6px 12px' })}>Send a form</button>}
      </div>
      {(sending || link) && (
        <div style={{ ...boxStyle }}>
          {link
            ? <LinkBox token={link.token} days={link.days} onClose={() => setLink(null)} />
            : <SendForm patient={patient} templates={templates} onSent={(token, days) => { setSending(false); setLink({ token, days }); refresh(); }} />}
          {sending && !link && <button type="button" onClick={() => setSending(false)} style={buttonStyle('text', { marginTop: 8, padding: 0 })}>Cancel</button>}
        </div>
      )}
      <div style={{ ...boxStyle }}>
        {forms.length === 0
          ? <p style={{ margin: 0, fontSize: 13, color: MUTED, fontStyle: 'italic' }}>No forms sent yet.</p>
          : [...forms].sort((a, b) => (b.needs_review ? 1 : 0) - (a.needs_review ? 1 : 0)).map((r, i) => <FormRow key={r.id} r={r} first={i === 0} onOpen={() => setOpenId(r.id)} onLink={(token, days) => setLink({ token, days })} onChanged={refresh} />)}
      </div>
    </>
  );
}
