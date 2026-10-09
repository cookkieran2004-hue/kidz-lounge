import { Fragment, useEffect, useState } from 'react';
import { api } from './api';
import { Status } from './EiHubSetup';
import { eiInput, eiLabel, eiGrid } from './eiHubUi';
import { INK, MUTED, HAIRLINE, TONES, buttonStyle, NUMERIC } from './uiTokens';

// EI children's billing details (Developers for now; kidz-lounge-api
// routes/eiHub.js): what a claim needs about the child -- the EI child ID
// (the patient's ID #), date of birth, sex, address, county and diagnosis
// codes -- and, for each current EI service, its authorization number (set
// with the mandate in the patient form) and the referring provider, which
// must match EI-Hub's "Scripts, Orders, Recommendations, and Referrals".
// Special Instruction needs no referring provider (EI-Hub fills in the
// agency's NPI).

const fmtDob = (s) => (s ? new Date(`${String(s).slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null);
const needsReferral = (service) => service !== 'SI';

// What's still missing for a child's claims.
function problemsOf(c) {
  const out = [];
  if (!c.ID_Number) out.push('ID #');
  if (!c.Date_of_Birth) out.push('date of birth');
  if (!c.sex) out.push('sex');
  if (!c.address_line1 || !c.city || !c.state || !c.zip) out.push('address');
  if (!c.county) out.push('county');
  if (!c.diagnosis_codes) out.push('diagnosis');
  if (!c.services.length) out.push('EI services');
  c.services.forEach(s => {
    if (!s.authorization_number) out.push(`${s.service} auth #`);
    else if (needsReferral(s.service) && !s.referral) out.push(`${s.service} referring provider`);
  });
  return out;
}

function ChildForm({ child, counties, onSaved, onCancel }) {
  const [form, setForm] = useState({
    sex: child.sex || '', address_line1: child.address_line1 || '', address_line2: child.address_line2 || '',
    city: child.city || '', state: child.state || 'NY', zip: child.zip || '', county: child.county || 'New York City',
    diagnosis_codes: child.diagnosis_codes || '',
  });
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    setBusy(true); setStatus(null);
    try {
      onSaved(await api.saveEiChild(child.id, form));
    } catch (err) {
      setStatus({ error: err.message });
      setBusy(false);
    }
  };
  const field = (k, label, extra = {}) => (
    <div>
      <label htmlFor={`ei-child-${k}`} style={eiLabel}>{label}</label>
      <input id={`ei-child-${k}`} style={eiInput} value={form[k]} onChange={set(k)} {...extra} />
    </div>
  );
  return (
    <div>
      <div style={eiGrid}>
        <div>
          <label htmlFor="ei-child-sex" style={eiLabel}>Sex</label>
          <select id="ei-child-sex" style={eiInput} value={form.sex} onChange={set('sex')}>
            <option value="">Not set</option><option value="F">Female</option><option value="M">Male</option>
          </select>
        </div>
        {field('diagnosis_codes', 'Diagnosis codes (ICD-10)', { placeholder: 'e.g. F80.2, R62.50' })}
        <div>
          <label htmlFor="ei-child-county" style={eiLabel}>County</label>
          <select id="ei-child-county" style={eiInput} value={form.county} onChange={set('county')}>
            <option value="">Not set</option>
            {counties.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {field('address_line1', 'Address')}
        {field('address_line2', 'Address line 2')}
        {field('city', 'City')}
        {field('state', 'State', { maxLength: 2 })}
        {field('zip', 'ZIP code', { inputMode: 'numeric' })}
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 12, color: MUTED }}>
        As EI-Hub has them. The first diagnosis goes on claims as the main one. Name, date of birth and ID # come from the patient record.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
        <button type="button" onClick={save} disabled={busy} style={buttonStyle('primary')}>{busy ? 'Saving...' : 'Save'}</button>
        <button type="button" onClick={onCancel} disabled={busy} style={buttonStyle('secondary')}>Cancel</button>
        <Status status={status} />
      </div>
    </div>
  );
}

function ReferralRow({ service, onSaved }) {
  const r = service.referral || {};
  const [form, setForm] = useState({ referring_last: r.referring_last || '', referring_first: r.referring_first || '', referring_npi: r.referring_npi || '' });
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setStatus(null);
    try {
      const saved = await api.saveEiReferral(service.authorization_number, form);
      setStatus({ ok: 'Saved.' });
      onSaved(saved.cleared ? null : saved);
    } catch (err) {
      setStatus({ error: err.message });
    }
    setBusy(false);
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
      <span style={{ width: 150, fontSize: 12.5 }}><strong>{service.service}</strong> · auth {service.authorization_number}</span>
      <input aria-label={`${service.service} referring provider last name`} style={{ ...eiInput, width: 150 }} placeholder="Last name or organization"
        value={form.referring_last} onChange={e => setForm(f => ({ ...f, referring_last: e.target.value }))} />
      <input aria-label={`${service.service} referring provider first name`} style={{ ...eiInput, width: 120 }} placeholder="First name"
        value={form.referring_first} onChange={e => setForm(f => ({ ...f, referring_first: e.target.value }))} />
      <input aria-label={`${service.service} referring provider NPI`} style={{ ...eiInput, width: 120 }} placeholder="NPI" inputMode="numeric" maxLength={10}
        value={form.referring_npi} onChange={e => setForm(f => ({ ...f, referring_npi: e.target.value.replace(/\D/g, '') }))} />
      <button type="button" onClick={save} disabled={busy} style={buttonStyle('secondary', { padding: '6px 10px' })}>{busy ? 'Saving...' : 'Save'}</button>
      <Status status={status} />
    </div>
  );
}

export default function EiHubChildren() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [counties, setCounties] = useState([]);
  const [editing, setEditing] = useState(null); // child id
  const [filter, setFilter] = useState('missing');
  useEffect(() => {
    let alive = true;
    Promise.all([api.getEiChildren(), api.getEiSetup()])
      .then(([d, setup]) => { if (alive) { setData(d); setCounties(setup.counties || []); } })
      .catch(err => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, []);
  if (error) return <p role="alert" style={{ fontSize: 13, color: TONES.danger.fg }}>{error}</p>;
  if (!data) return <p style={{ fontSize: 13, color: MUTED }}>Loading...</p>;
  if (!data.available) {
    return <p style={{ margin: 0, padding: 16, borderRadius: 12, border: `1px solid ${HAIRLINE}`, fontSize: 13, color: TONES.warning.fg, background: TONES.warning.bg }}>EI billing details need the 2026-10-21 database update. Ask an admin to run it.</p>;
  }
  const updateChild = (id, patch) => setData(d => ({ ...d, children: d.children.map(c => (c.id === id ? { ...c, ...patch } : c)) }));
  const withProblems = data.children.map(c => ({ ...c, problems: problemsOf(c) }));
  const shown = filter === 'missing' ? withProblems.filter(c => c.problems.length) : withProblems;
  const missingCount = withProblems.filter(c => c.problems.length).length;
  const th = { textAlign: 'left', padding: '8px 10px', fontSize: 12, fontWeight: 600, color: MUTED, borderBottom: `1px solid ${HAIRLINE}`, background: '#FAFAFA', whiteSpace: 'nowrap' };
  const td = { padding: '10px', fontSize: 13, color: INK, borderBottom: `1px solid ${HAIRLINE}`, verticalAlign: 'top' };
  return (
    <div style={{ background: 'white', border: `1px solid ${HAIRLINE}`, borderRadius: 12, overflow: 'clip' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${HAIRLINE}`, flexWrap: 'wrap' }}>
        <div role="tablist" aria-label="Show" style={{ display: 'inline-flex', border: `1px solid ${HAIRLINE}`, borderRadius: 6, overflow: 'hidden' }}>
          {[['missing', `Missing details`, missingCount], ['all', 'All EI children', withProblems.length]].map(([k, label, n], i) => (
            <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}
              style={{ padding: '6px 12px', border: 'none', borderRight: i === 0 ? `1px solid ${HAIRLINE}` : 'none', background: filter === k ? '#F5F3FF' : 'white', color: filter === k ? '#6D28D9' : INK, fontSize: 13, fontWeight: filter === k ? 600 : 500, fontFamily: 'inherit', cursor: 'pointer' }}>
              {label} <span style={{ color: '#A1A1AA', ...NUMERIC }}>{n}</span>
            </button>
          ))}
        </div>
        <span style={{ fontSize: 12.5, color: MUTED }}>Auth numbers are set with each EI mandate in the patient form.</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
          <thead>
            <tr><th style={th}>Child</th><th style={th}>Sex</th><th style={th}>Address</th><th style={th}>County</th><th style={th}>Diagnosis</th><th style={th}>Services</th><th style={th} /></tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: MUTED, padding: 28 }}>
                {withProblems.length ? 'Every EI child has what their claims need.' : 'No EI children yet.'}
              </td></tr>
            )}
            {shown.map(c => (
              <Fragment key={c.id}>
                <tr>
                  <td style={td}>
                    <div style={{ fontWeight: 500 }}>{c.Name}</div>
                    <div style={{ fontSize: 12, color: MUTED }}>{[c.ID_Number ? `ID # ${c.ID_Number}` : null, fmtDob(c.Date_of_Birth)].filter(Boolean).join(' · ') || '—'}</div>
                    {c.problems.length > 0 && <div style={{ fontSize: 12, color: TONES.danger.fg, marginTop: 2 }}>Missing: {c.problems.join(', ')}</div>}
                  </td>
                  <td style={td}>{c.sex === 'F' ? 'Female' : c.sex === 'M' ? 'Male' : '—'}</td>
                  <td style={td}>{c.address_line1 ? <>{c.address_line1}{c.address_line2 ? `, ${c.address_line2}` : ''}<div style={{ fontSize: 12, color: MUTED }}>{[c.city, c.state, c.zip].filter(Boolean).join(' ')}</div></> : '—'}</td>
                  <td style={td}>{c.county || '—'}</td>
                  <td style={td}>{c.diagnosis_codes || '—'}</td>
                  <td style={td}>
                    {c.services.length === 0 && <span style={{ color: MUTED }}>No EI mandates entered</span>}
                    {c.services.map(s => (
                      <div key={s.service} style={{ fontSize: 12.5, marginBottom: 2 }}>
                        <strong>{s.service}</strong> {s.mandate}{s.authorization_number ? ` · auth ${s.authorization_number}` : <span style={{ color: TONES.danger.fg }}> · no auth #</span>}
                        {needsReferral(s.service) && s.authorization_number && (
                          <div style={{ fontSize: 12, color: s.referral ? MUTED : TONES.danger.fg }}>
                            {s.referral ? `Referred by ${[s.referral.referring_first, s.referral.referring_last].filter(Boolean).join(' ')} (${s.referral.referring_npi})` : 'No referring provider'}
                          </div>
                        )}
                      </div>
                    ))}
                  </td>
                  <td style={{ ...td, width: 70 }}>
                    <button type="button" onClick={() => setEditing(editing === c.id ? null : c.id)} style={buttonStyle('text')}>{editing === c.id ? 'Close' : 'Edit'}</button>
                  </td>
                </tr>
                {editing === c.id && (
                  <tr>
                    <td colSpan={7} style={{ ...td, background: '#FCFCFD', padding: 16 }}>
                      <ChildForm child={c} counties={counties}
                        onSaved={saved => { updateChild(c.id, saved); setEditing(null); }} onCancel={() => setEditing(null)} />
                      {c.services.some(s => s.authorization_number && needsReferral(s.service)) && (
                        <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${HAIRLINE}` }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: INK }}>Referring providers</div>
                          <div style={{ fontSize: 12, color: MUTED }}>Must match the prescriber on that authorization in EI-Hub (Scripts, Orders, Recommendations, and Referrals).</div>
                          {c.services.filter(s => s.authorization_number && needsReferral(s.service)).map(s => (
                            <ReferralRow key={s.authorization_number} service={s}
                              onSaved={referral => updateChild(c.id, { services: c.services.map(x => (x.authorization_number === s.authorization_number ? { ...x, referral } : x)) })} />
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
