import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { DateField } from './SchedulePage';
import { PowerFormInputs } from '../PowerFormFields';
import { pfInputStyle } from '../powerForms';
import { INK, MUTED, HAIRLINE, PAGE_BG, FONT, TONES, buttonStyle } from '../uiTokens';

// The page a parent opens from a Power Form link (/f/<token>; Kieran, Oct
// 2026). No sign-in: the link itself plus the child's date of birth unlock
// the form (kidz-lounge-api routes/powerForms.js handlePublic). Nothing
// about the child is shown before the date of birth is confirmed.

function Shell({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: PAGE_BG, fontFamily: FONT, color: INK }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 16px 60px' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#5B21B6', marginBottom: 16 }}>Kidz Lounge</div>
        <div style={{ background: 'white', border: `1px solid ${HAIRLINE}`, borderRadius: 8, padding: '22px 20px' }}>
          {children}
        </div>
        <p style={{ fontSize: 12, color: MUTED, marginTop: 14, lineHeight: 1.5 }}>
          This form is private to your family. Please don't share the link.
        </p>
      </div>
    </div>
  );
}

export default function PowerFormPage() {
  const { token } = useParams();
  const [stage, setStage] = useState('loading'); // loading | blocked | dob | form | done
  const [info, setInfo] = useState(null);         // { form_name, error }
  const [dob, setDob] = useState('');
  const [form, setForm] = useState(null);         // { access, form_name, intro, fields, child_first_name }
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api.getPublicPowerForm(token)
      .then(d => { if (alive) { setInfo(d); setStage(d.status === 'completed' ? 'done' : 'dob'); } })
      .catch(err => { if (alive) { setInfo({ error: err.message }); setStage('blocked'); } });
    return () => { alive = false; };
  }, [token]);

  const unlock = async () => {
    if (!dob) { setMessage("Enter your child's date of birth."); return; }
    setBusy(true); setMessage(null);
    try {
      setForm(await api.unlockPowerForm(token, dob));
      setStage('form');
      window.scrollTo(0, 0);
    } catch (err) {
      setMessage(err.message);
    }
    setBusy(false);
  };

  const submit = async () => {
    setBusy(true); setMessage(null); setErrors({});
    try {
      await api.submitPowerForm(token, form.access, values);
      setStage('done');
      window.scrollTo(0, 0);
    } catch (err) {
      setMessage(err.message);
      if (err.data?.field) {
        setErrors({ [err.data.field]: err.message });
        document.getElementById(`pf-${err.data.field}-l`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
    setBusy(false);
  };

  if (stage === 'loading') return <Shell><p style={{ margin: 0, color: MUTED }}>Loading...</p></Shell>;
  if (stage === 'blocked') {
    return (
      <Shell>
        <h1 style={{ fontSize: 19, fontWeight: 600, margin: '0 0 8px' }}>This form can't be opened</h1>
        <p style={{ margin: 0, fontSize: 15, color: INK, lineHeight: 1.5 }}>{info?.error}</p>
      </Shell>
    );
  }
  if (stage === 'done') {
    return (
      <Shell>
        <h1 style={{ fontSize: 19, fontWeight: 600, margin: '0 0 8px' }}>Thank you</h1>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>
          Kidz Lounge has received your {info?.form_name || form?.form_name || 'form'}. You can close this page.
        </p>
      </Shell>
    );
  }
  if (stage === 'dob') {
    return (
      <Shell>
        <h1 style={{ fontSize: 19, fontWeight: 600, margin: '0 0 6px' }}>{info?.form_name}</h1>
        <p style={{ margin: '0 0 16px', fontSize: 15, lineHeight: 1.5 }}>To open this form, enter your child's date of birth.</p>
        <label htmlFor="pf-dob" style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Child's date of birth</label>
        <DateField id="pf-dob" ariaLabel="Child's date of birth" yearNav style={{ ...pfInputStyle, maxWidth: 260 }} value={dob} onChange={v => setDob(v || '')} />
        {message && <p role="alert" style={{ color: TONES.danger.fg, fontSize: 14, margin: '10px 0 0' }}>{message}</p>}
        <button type="button" onClick={unlock} disabled={busy} style={buttonStyle('primary', { marginTop: 16, padding: '10px 18px', fontSize: 15 })}>
          {busy ? 'Checking...' : 'Open the form'}
        </button>
      </Shell>
    );
  }
  return (
    <Shell>
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px' }}>{form.form_name}</h1>
      {form.child_first_name && <p style={{ margin: '0 0 12px', fontSize: 14, color: MUTED }}>For {form.child_first_name}</p>}
      {form.intro && <p style={{ margin: '0 0 18px', fontSize: 15, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{form.intro}</p>}
      <PowerFormInputs fields={form.fields} values={values} errors={errors} disabled={busy}
        onChange={(id, v) => { setValues(x => ({ ...x, [id]: v })); setErrors(e => ({ ...e, [id]: undefined })); }} />
      {message && <p role="alert" style={{ color: TONES.danger.fg, fontSize: 14, margin: '18px 0 0' }}>{message}</p>}
      <div style={{ marginTop: 22, paddingTop: 16, borderTop: `1px solid ${HAIRLINE}` }}>
        <button type="button" onClick={submit} disabled={busy} style={buttonStyle('primary', { padding: '10px 18px', fontSize: 15 })}>
          {busy ? 'Sending...' : 'Submit'}
        </button>
      </div>
    </Shell>
  );
}
