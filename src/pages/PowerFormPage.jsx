import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { DateField } from './SchedulePage';
import { PowerFormInputs, PowerFormLetterhead, PatientLabel } from '../PowerFormFields';
import { pfInputStyle, startingAnswers } from '../powerForms';
import { INK, MUTED, HAIRLINE, PAGE_BG, FONT, TONES, ACCENT, buttonStyle } from '../uiTokens';
import { CLINIC } from '../brand';

// The page a parent opens from a Power Form link (/f/<token>; Kieran, Oct
// 2026). No sign-in: the link itself plus the child's date of birth unlock
// the form (kidz-lounge-api routes/powerForms.js handlePublic). Nothing
// about the child is shown before the date of birth is confirmed.
// A link can open a package of forms (e.g. Initial Clearance Forms): the
// parent fills them in one after another, and each is sent on its own, so
// stopping halfway keeps the ones already done.

function Shell({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: PAGE_BG, fontFamily: FONT, color: INK }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 16px 60px' }}>
        <PowerFormLetterhead />
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
  const [form, setForm] = useState(null);         // { access, form_name, child_first_name, packet, forms: [{ id, form_name, intro, fields, status }] }
  const [currentId, setCurrentId] = useState(null); // the form being filled in
  const [valuesById, setValuesById] = useState({}); // answers so far, per form
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
      const d = await api.unlockPowerForm(token, dob);
      // One form or a package: either way a list of forms from here on.
      const forms = d.packet ? d.forms : [{ id: null, form_name: d.form_name, intro: d.intro, fields: d.fields, status: 'open' }];
      setForm({ ...d, forms });
      setValuesById(Object.fromEntries(forms.map(f => [f.id, startingAnswers(f.fields)])));
      setCurrentId((forms.find(f => f.status !== 'completed') || forms[0]).id);
      setStage('form');
      window.scrollTo(0, 0);
    } catch (err) {
      setMessage(err.message);
    }
    setBusy(false);
  };

  const current = form?.forms.find(f => f.id === currentId);
  const values = valuesById[currentId] || {};
  const submit = async () => {
    setBusy(true); setMessage(null); setErrors({});
    try {
      await api.submitPowerForm(token, form.access, values, currentId);
      const forms = form.forms.map(f => (f.id === currentId ? { ...f, status: 'completed' } : f));
      setForm(x => ({ ...x, forms }));
      const next = forms.find(f => f.status !== 'completed');
      if (next) setCurrentId(next.id); else setStage('done');
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
          {CLINIC.shortName} has received your {info?.form_name || form?.form_name || 'form'}. You can close this page.
        </p>
      </Shell>
    );
  }
  if (stage === 'dob') {
    return (
      <Shell>
        <h1 style={{ fontSize: 24, fontWeight: 650, margin: '0 0 8px', lineHeight: 1.25 }}>{info?.form_name}</h1>
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
      {form.packet && (
        <div style={{ marginBottom: 18, paddingBottom: 14, borderBottom: `1px solid ${HAIRLINE}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 600 }}>{form.form_name}</div>
              <div style={{ fontSize: 13.5, color: MUTED, marginTop: 2 }}>{form.forms.filter(f => f.status === 'completed').length} of {form.forms.length} done</div>
            </div>
            <PatientLabel label={form.label} />
          </div>
          <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 3 }}>
            {form.forms.map(f => (
              <li key={f.id} style={{ fontSize: 13.5 }}>
                {f.status === 'completed' ? (
                  <span style={{ color: TONES.success.fg, overflowWrap: 'anywhere' }}>{f.form_name}: done</span>
                ) : f.id === currentId ? (
                  <span style={{ fontWeight: 600, color: ACCENT, overflowWrap: 'anywhere' }}>{f.form_name}</span>
                ) : (
                  <button type="button" onClick={() => { setCurrentId(f.id); setMessage(null); setErrors({}); window.scrollTo(0, 0); }} disabled={busy}
                    style={buttonStyle('text', { padding: 0, fontSize: 13.5, textAlign: 'left', whiteSpace: 'normal', overflowWrap: 'anywhere' })}>{f.form_name}</button>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <h1 style={{ fontSize: 26, fontWeight: 650, margin: '2px 0 4px', lineHeight: 1.25, flex: '1 1 260px' }}>{current.form_name}</h1>
        {!form.packet && <PatientLabel label={form.label} />}
      </div>
      {current.intro && <p style={{ margin: '8px 0 18px', fontSize: 15, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{current.intro}</p>}
      <PowerFormInputs key={currentId} fields={current.fields} values={values} errors={errors} disabled={busy}
        onChange={(id, v) => { setValuesById(x => ({ ...x, [currentId]: { ...(x[currentId] || {}), [id]: v } })); setErrors(e => ({ ...e, [id]: undefined })); }} />
      {message && <p role="alert" style={{ color: TONES.danger.fg, fontSize: 14, margin: '18px 0 0' }}>{message}</p>}
      <div style={{ marginTop: 22, paddingTop: 16, borderTop: `1px solid ${HAIRLINE}` }}>
        <button type="button" onClick={submit} disabled={busy} style={buttonStyle('primary', { padding: '10px 18px', fontSize: 15 })}>
          {busy ? 'Sending...' : form.packet && form.forms.filter(f => f.status !== 'completed').length > 1 ? 'Submit and go to the next form' : 'Submit'}
        </button>
      </div>
    </Shell>
  );
}
