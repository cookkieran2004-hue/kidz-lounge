import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { DateField } from './SchedulePage';
import { PowerFormLetterhead, SignaturePad } from '../PowerFormFields';
import { pfInputStyle } from '../powerForms';
import { INK, MUTED, HAIRLINE, PAGE_BG, FONT, TONES, buttonStyle } from '../uiTokens';
import { CLINIC } from '../brand';
import { fmtDate, fmtTime, METHOD_LABEL, SERVICE_LABEL } from '../sessionNotePdf';

// The page a telehealth parent opens from a session note signing link
// (/s/<token>; PedsDesk's "ei" feature, Oct 2026). Like a Power Form: no
// sign-in, the link plus the child's date of birth unlock it (kidz-lounge-api
// routes/sessionNotes.js handlePublic), and nothing about the child shows
// before that. The parent reads the note and draws the same two signatures
// as on the provider's device: the session note and the service log.

function Shell({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: PAGE_BG, fontFamily: FONT, color: INK }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 16px 60px' }}>
        <PowerFormLetterhead />
        <div style={{ background: 'white', border: `1px solid ${HAIRLINE}`, borderRadius: 8, padding: '22px 20px' }}>{children}</div>
        <p style={{ fontSize: 12, color: MUTED, marginTop: 14, lineHeight: 1.5 }}>This page is private to your family. Please don't share the link.</p>
      </div>
    </div>
  );
}

const Block = ({ title, children }) => (
  <div style={{ marginTop: 14 }}>
    <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginBottom: 3 }}>{title}</div>
    <div style={{ fontSize: 15, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{children}</div>
  </div>
);

export default function SessionSignPage() {
  const { token } = useParams();
  const [stage, setStage] = useState('loading'); // loading | blocked | dob | sign | done
  const [info, setInfo] = useState(null);
  const [dob, setDob] = useState('');
  const [data, setData] = useState(null);
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [noteSig, setNoteSig] = useState(null);
  const [logSig, setLogSig] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api.getPublicSessionSign(token)
      .then(d => { if (alive) { setInfo(d); setStage(d.status === 'completed' ? 'done' : 'dob'); } })
      .catch(err => { if (alive) { setInfo({ error: err.message }); setStage('blocked'); } });
    return () => { alive = false; };
  }, [token]);

  const unlock = async () => {
    if (!dob) { setMessage("Enter your child's date of birth."); return; }
    setBusy(true); setMessage(null);
    try {
      const d = await api.unlockSessionSign(token, dob);
      setData(d);
      setName(d.parent_hint?.name || '');
      setRelationship(d.parent_hint?.relationship || '');
      setStage('sign');
      window.scrollTo(0, 0);
    } catch (err) { setMessage(err.message); }
    setBusy(false);
  };
  const submit = async () => {
    setBusy(true); setMessage(null);
    try {
      await api.submitSessionSign(token, { access: data.access, parent_name: name, relationship, note_signature: noteSig, log_signature: logSig });
      setStage('done');
      window.scrollTo(0, 0);
    } catch (err) { setMessage(err.message); }
    setBusy(false);
  };

  if (stage === 'loading') return <Shell><p style={{ margin: 0, color: MUTED }}>Loading...</p></Shell>;
  if (stage === 'blocked') {
    return (
      <Shell>
        <h1 style={{ fontSize: 19, fontWeight: 600, margin: '0 0 8px' }}>This link can't be opened</h1>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>{info?.error}</p>
      </Shell>
    );
  }
  if (stage === 'done') {
    return (
      <Shell>
        <h1 style={{ fontSize: 19, fontWeight: 600, margin: '0 0 8px' }}>Thank you</h1>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>{CLINIC.shortName} has received your signatures for this session. You can close this page.</p>
      </Shell>
    );
  }
  if (stage === 'dob') {
    return (
      <Shell>
        <h1 style={{ fontSize: 24, fontWeight: 650, margin: '0 0 8px', lineHeight: 1.25 }}>Sign for your child's session</h1>
        <p style={{ margin: '0 0 16px', fontSize: 15, lineHeight: 1.5 }}>To open the session note, enter your child's date of birth.</p>
        <label htmlFor="ss-dob" style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Child's date of birth</label>
        <DateField id="ss-dob" ariaLabel="Child's date of birth" yearNav style={{ ...pfInputStyle, maxWidth: 260 }} value={dob} onChange={v => setDob(v || '')} />
        {message && <p role="alert" style={{ color: TONES.danger.fg, fontSize: 14, margin: '10px 0 0' }}>{message}</p>}
        <button type="button" onClick={unlock} disabled={busy} style={buttonStyle('primary', { marginTop: 16, padding: '10px 18px', fontSize: 15 })}>
          {busy ? 'Checking...' : 'Open the note'}
        </button>
      </Shell>
    );
  }
  const { session, note } = data;
  const methods = (note.parent_methods || []).map(m => (m === 'other' ? `Other: ${note.parent_methods_other || ''}` : METHOD_LABEL[m])).filter(Boolean);
  return (
    <Shell>
      <h1 style={{ fontSize: 22, fontWeight: 650, margin: '0 0 6px', lineHeight: 1.25 }}>{session.child_first_name}'s session</h1>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>
        {SERVICE_LABEL[session.service] || session.service} with {session.provider} (telehealth)<br />
        {fmtDate(session.date)}, {fmtTime(session.start_time)} to {fmtTime(session.end_time)}
      </p>
      <Block title="IFSP outcomes worked on">{[...(note.outcomes || []), note.outcomes_text].filter(Boolean).join('\n')}</Block>
      <Block title="What happened in the session">{note.narrative}</Block>
      {methods.length > 0 && <Block title="How the provider worked with you">{methods.join(', ')}</Block>}
      <Block title="What you agreed to do between visits">{note.strategies}</Block>

      <div style={{ marginTop: 22, paddingTop: 16, borderTop: `1px solid ${HAIRLINE}` }}>
        <label htmlFor="ss-name" style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Your name</label>
        <input id="ss-name" value={name} onChange={e => setName(e.target.value)} style={{ ...pfInputStyle, marginBottom: 12 }} />
        <label htmlFor="ss-rel" style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Relationship to the child</label>
        <input id="ss-rel" value={relationship} onChange={e => setRelationship(e.target.value)} placeholder="e.g. Mother, Grandmother, Babysitter" style={{ ...pfInputStyle, marginBottom: 18 }} />
        <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>1. Session note</p>
        <p style={{ fontSize: 14, color: MUTED, margin: '0 0 6px' }}>I took part in this session and received a copy of the note, or will.</p>
        <SignaturePad value={noteSig} onChange={setNoteSig} />
        <p style={{ fontSize: 15, fontWeight: 600, margin: '18px 0 4px' }}>2. Service log</p>
        <p style={{ fontSize: 14, color: MUTED, margin: '0 0 6px' }}>I verify the service was delivered on the date and at the time above.</p>
        <SignaturePad value={logSig} onChange={setLogSig} />
        {message && <p role="alert" style={{ color: TONES.danger.fg, fontSize: 14, margin: '12px 0 0' }}>{message}</p>}
        <button type="button" onClick={submit} disabled={busy || !noteSig || !logSig} style={buttonStyle('primary', { marginTop: 18, padding: '10px 18px', fontSize: 15 })}>
          {busy ? 'Sending...' : 'Sign'}
        </button>
      </div>
    </Shell>
  );
}
