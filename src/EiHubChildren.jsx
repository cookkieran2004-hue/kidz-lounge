import { Fragment, useEffect, useState } from 'react';
import { api } from './api';
import { Status } from './EiHubSetup';
import { DateField } from './pages/SchedulePage';
import { useStaffNames } from './staffDirectory';
import { eiInput, eiLabel, eiGrid } from './eiHubUi';
import { INK, MUTED, HAIRLINE, TONES, buttonStyle, NUMERIC } from './uiTokens';

// EI children's billing details (Admins and Developers; kidz-lounge-api
// routes/eiHub.js, lib/eiHistory.js). What a claim says about the child --
// EI child ID, name and date of birth as EI-Hub has them, sex, address,
// county, diagnosis codes -- kept as DATED VERSIONS: EI-Hub checks each
// claim against the child's record on the date of service, and the agency
// keeps what it billed and when it changed. So an edit is either a change
// that takes effect from a date (the old version is kept, ended the day
// before) or a correction of one version (a mistake; its dates stay). Each
// authorization's referring provider is dated the same way. A version a sent
// claim used can't be taken back. Auth numbers are set with the EI mandate
// in the patient form.

const fmt = (s) => (s ? new Date(`${String(s).slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const range = (v) => `${v.start_date ? fmt(v.start_date) : 'From the start'} – ${v.end_date ? fmt(v.end_date) : 'now'}`;
const needsReferral = (service) => service !== 'SI';
const splitName = (n) => { const p = String(n || '').trim().split(/\s+/); return { first: p[0] || '', last: p.slice(1).join(' ') }; };
const zipText = (z) => (z && z.length === 9 ? `${z.slice(0, 5)}-${z.slice(5)}` : z);
const FIELDS = ['ei_child_id', 'first_name', 'last_name', 'date_of_birth', 'sex', 'diagnosis_codes', 'county', 'address_line1', 'address_line2', 'city', 'state', 'zip'];

// What's still missing for a child's claims, from their current version.
function problemsOf(c) {
  const v = c.current;
  const out = [];
  if (!v) out.push('EI details');
  else {
    if (!v.ei_child_id) out.push('ID #');
    if (!v.sex) out.push('sex');
    if (!v.address_line1 || !v.city || !v.state || !v.zip) out.push('address');
    if (!v.county) out.push('county');
    if (!v.diagnosis_codes) out.push('diagnosis');
    if (c.ID_Number && v.ei_child_id && c.ID_Number !== v.ei_child_id) out.push(`ID # on the patient record (${c.ID_Number}) differs`);
  }
  if (!c.services.length) out.push('EI services');
  c.services.forEach(s => {
    if (!s.authorization_number) out.push(`${s.service} auth #`);
    else if (needsReferral(s.service) && !s.referral) out.push(`${s.service} referring provider`);
  });
  return out;
}

const summary = (v) => [
  v.ei_child_id && `ID ${v.ei_child_id}`,
  (v.first_name || v.last_name) && `${v.first_name || ''} ${v.last_name || ''}`.trim(),
  v.sex === 'F' ? 'Female' : v.sex === 'M' ? 'Male' : null,
  v.diagnosis_codes,
  v.county,
  v.address_line1 && [v.address_line1, v.city, zipText(v.zip)].filter(Boolean).join(', '),
].filter(Boolean).join(' · ');

// The details form: a change from a date, or a correction of one version.
function DetailsForm({ child, counties, version, onDone, onCancel }) {
  const correcting = !!version;
  const base = version || child.current;
  const name = splitName(child.Name);
  const [form, setForm] = useState(() => Object.fromEntries(FIELDS.map(k => [k,
    base ? (k === 'date_of_birth' ? String(base[k] || '').slice(0, 10) : base[k] || '')
      : ({ ei_child_id: child.ID_Number || '', first_name: name.first, last_name: name.last, date_of_birth: String(child.Date_of_Birth || '').slice(0, 10), state: 'NY', county: 'New York City' }[k] || ''),
  ])));
  const first = !child.versions.length;
  const [from, setFrom] = useState(today());
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    setBusy(true); setStatus(null);
    try {
      const result = correcting
        ? await api.correctEiChildVersion(child.id, version.id, form)
        : await api.saveEiChild(child.id, { ...form, effective_from: first ? null : from });
      onDone(result.versions);
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
    <div style={{ border: `1px solid ${HAIRLINE}`, borderRadius: 8, padding: 14, background: 'white' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: INK, marginBottom: 2 }}>
        {correcting ? `Correct the version ${range(version)}` : first ? 'EI details' : 'A change'}
      </div>
      <p style={{ margin: '0 0 10px', fontSize: 12, color: MUTED }}>
        {correcting ? 'For a mistake in this version. Its dates stay the same.'
          : first ? 'As EI-Hub has them. These apply to all dates until a change is added.'
          : 'As EI-Hub has them now. Sessions before the date keep the earlier details.'}
      </p>
      <div style={eiGrid}>
        {field('ei_child_id', 'ID # (EI child ID)')}
        {field('first_name', 'First name in EI-Hub')}
        {field('last_name', 'Last name in EI-Hub')}
        <div>
          <label style={eiLabel}>Date of birth</label>
          <DateField yearNav clearable style={eiInput} ariaLabel="Date of birth" value={form.date_of_birth} onChange={v => setForm(f => ({ ...f, date_of_birth: v }))} />
        </div>
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
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
        {!correcting && !first && (
          <>
            <span style={{ fontSize: 13, color: INK }}>Takes effect from</span>
            <DateField style={{ ...eiInput, width: 170 }} ariaLabel="Takes effect from" value={from} onChange={setFrom} />
          </>
        )}
        <button type="button" onClick={save} disabled={busy || (!correcting && !first && !from)} style={buttonStyle('primary')}>{busy ? 'Saving...' : 'Save'}</button>
        <button type="button" onClick={onCancel} disabled={busy} style={buttonStyle('secondary')}>Cancel</button>
        <Status status={status} />
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 12, color: MUTED }}>The first diagnosis goes on claims as the main one.</p>
    </div>
  );
}

// Versions, newest first: who made each, and Correct / Take back.
function History({ items, render, onCorrect, onTakeBack, nameOf }) {
  const [confirm, setConfirm] = useState(null);
  const [error, setError] = useState(null);
  const newest = items[items.length - 1];
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      {[...items].reverse().map(v => (
        <div key={v.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', fontSize: 12.5, color: v.end_date ? MUTED : INK, padding: '4px 0', borderBottom: `1px solid ${HAIRLINE}` }}>
          <span style={{ minWidth: 190, fontWeight: v.end_date ? 400 : 600, ...NUMERIC }}>{range(v)}</span>
          <span style={{ flex: 1, minWidth: 200 }}>{render(v)}</span>
          <span style={{ fontSize: 11.5, color: MUTED }}>
            {v.created_by === 'migration' ? 'Brought over' : nameOf(v.created_by)}{v.updated_by ? `, corrected by ${nameOf(v.updated_by)}` : ''}
          </span>
          <button type="button" onClick={() => onCorrect(v)} style={buttonStyle('text', { padding: '0 4px', fontSize: 12 })}>Correct</button>
          {v === newest && (confirm === v.id ? (
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 12 }}>Take this back?</span>
              <button type="button" onClick={async () => { setError(null); try { await onTakeBack(v); } catch (err) { setError(err.message); } setConfirm(null); }} style={buttonStyle('danger', { padding: '2px 8px', fontSize: 12 })}>Take back</button>
              <button type="button" onClick={() => setConfirm(null)} style={buttonStyle('secondary', { padding: '2px 8px', fontSize: 12 })}>Keep</button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirm(v.id)} style={buttonStyle('text', { padding: '0 4px', fontSize: 12, color: TONES.danger.fg })}>Take back</button>
          ))}
        </div>
      ))}
      {error && <div role="alert" style={{ fontSize: 12, color: TONES.danger.fg }}>{error}</div>}
    </div>
  );
}

function ReferralForm({ service, period, onDone, onCancel }) {
  const first = !service.referrals.length;
  const base = period || {};
  const [form, setForm] = useState({ referring_last: base.referring_last || '', referring_first: base.referring_first || '', referring_npi: base.referring_npi || '' });
  const [from, setFrom] = useState(today());
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setStatus(null);
    try {
      const result = period
        ? await api.correctEiReferral(service.authorization_number, period.id, form)
        : await api.saveEiReferral(service.authorization_number, { ...form, effective_from: first ? null : from });
      onDone(result.periods);
    } catch (err) {
      setStatus({ error: err.message });
      setBusy(false);
    }
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', margin: '6px 0' }}>
      <input aria-label="Referring provider last name" style={{ ...eiInput, width: 160 }} placeholder="Last name or organization"
        value={form.referring_last} onChange={e => setForm(f => ({ ...f, referring_last: e.target.value }))} />
      <input aria-label="Referring provider first name" style={{ ...eiInput, width: 120 }} placeholder="First name"
        value={form.referring_first} onChange={e => setForm(f => ({ ...f, referring_first: e.target.value }))} />
      <input aria-label="Referring provider NPI" style={{ ...eiInput, width: 120 }} placeholder="NPI" inputMode="numeric" maxLength={10}
        value={form.referring_npi} onChange={e => setForm(f => ({ ...f, referring_npi: e.target.value.replace(/\D/g, '') }))} />
      {!period && !first && (
        <>
          <span style={{ fontSize: 12.5 }}>from</span>
          <DateField style={{ ...eiInput, width: 160 }} ariaLabel="Referring provider from" value={from} onChange={setFrom} />
        </>
      )}
      <button type="button" onClick={save} disabled={busy} style={buttonStyle('primary', { padding: '6px 10px' })}>{busy ? 'Saving...' : period ? 'Save correction' : 'Save'}</button>
      <button type="button" onClick={onCancel} disabled={busy} style={buttonStyle('secondary', { padding: '6px 10px' })}>Cancel</button>
      <Status status={status} />
    </div>
  );
}

function ChildPanel({ child, counties, onChanged }) {
  const nameOf = useStaffNames();
  const [editing, setEditing] = useState(child.versions.length ? null : 'new'); // 'new' | version
  const [refEditing, setRefEditing] = useState(null); // { auth, period|null }
  const setVersions = (versions) => onChanged({ versions, current: versions.find(v => !v.end_date) || null });
  const setPeriods = (auth, periods) => onChanged({
    services: child.services.map(s => (s.authorization_number === auth ? { ...s, referrals: periods, referral: periods.find(p => !p.end_date) || null } : s)),
  });
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <section>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>EI details</span>
          {child.versions.length > 0 && !editing && (
            <button type="button" onClick={() => setEditing('new')} style={buttonStyle('text', { padding: 0 })}>Add a change</button>
          )}
        </div>
        {editing && (
          <DetailsForm key={editing === 'new' ? 'new' : editing.id} child={child} counties={counties} version={editing === 'new' ? null : editing}
            onCancel={() => setEditing(null)} onDone={(versions) => { setVersions(versions); setEditing(null); }} />
        )}
        {child.versions.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <History items={child.versions} nameOf={nameOf} render={summary}
              onCorrect={(v) => setEditing(v)}
              onTakeBack={async (v) => setVersions((await api.takeBackEiChildVersion(child.id, v.id)).versions)} />
          </div>
        )}
      </section>

      {child.services.some(s => s.authorization_number && needsReferral(s.service)) && (
        <section>
          <div style={{ fontSize: 13, fontWeight: 600, color: INK }}>Referring providers</div>
          <p style={{ margin: '0 0 6px', fontSize: 12, color: MUTED }}>Must match the prescriber on that authorization in EI-Hub (Scripts, Orders, Recommendations, and Referrals), for the same dates.</p>
          {child.services.filter(s => s.authorization_number && needsReferral(s.service)).map(s => (
            <div key={s.authorization_number} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 12.5 }}>
                <strong>{s.service}</strong><span>auth {s.authorization_number}</span>
                {!(refEditing && refEditing.auth === s.authorization_number) && (
                  <button type="button" onClick={() => setRefEditing({ auth: s.authorization_number, period: null })} style={buttonStyle('text', { padding: 0, fontSize: 12.5 })}>
                    {s.referrals.length ? 'Add a change' : 'Add referring provider'}
                  </button>
                )}
              </div>
              {refEditing && refEditing.auth === s.authorization_number && (
                <ReferralForm key={refEditing.period ? refEditing.period.id : 'new'} service={s} period={refEditing.period}
                  onCancel={() => setRefEditing(null)} onDone={(periods) => { setPeriods(s.authorization_number, periods); setRefEditing(null); }} />
              )}
              {s.referrals.length > 0 && (
                <History items={s.referrals} nameOf={nameOf}
                  render={(p) => `${[p.referring_first, p.referring_last].filter(Boolean).join(' ')} · NPI ${p.referring_npi}`}
                  onCorrect={(p) => setRefEditing({ auth: s.authorization_number, period: p })}
                  onTakeBack={async (p) => setPeriods(s.authorization_number, (await api.takeBackEiReferral(s.authorization_number, p.id)).periods)} />
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

export default function EiHubChildren() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [counties, setCounties] = useState([]);
  const [open, setOpen] = useState(null); // child id
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
    return <p style={{ margin: 0, padding: 16, borderRadius: 12, border: `1px solid ${HAIRLINE}`, fontSize: 13, color: TONES.warning.fg, background: TONES.warning.bg }}>EI billing details need the 2026-10-21 and 2026-10-23 database updates. Ask an admin to run them.</p>;
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
          {[['missing', 'Missing details', missingCount], ['all', 'All EI children', withProblems.length]].map(([k, label, n], i) => (
            <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}
              style={{ padding: '6px 12px', border: 'none', borderRight: i === 0 ? `1px solid ${HAIRLINE}` : 'none', background: filter === k ? '#F5F3FF' : 'white', color: filter === k ? '#6D28D9' : INK, fontSize: 13, fontWeight: filter === k ? 600 : 500, fontFamily: 'inherit', cursor: 'pointer' }}>
              {label} <span style={{ color: '#A1A1AA', ...NUMERIC }}>{n}</span>
            </button>
          ))}
        </div>
        <span style={{ fontSize: 12.5, color: MUTED }}>Every change is kept with its date. Auth numbers are set with each EI mandate in the patient form.</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880 }}>
          <thead>
            <tr><th style={th}>Child</th><th style={th}>Current EI details</th><th style={th}>Services</th><th style={th} /></tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={4} style={{ ...td, textAlign: 'center', color: MUTED, padding: 28 }}>
                {withProblems.length ? 'Every EI child has what their claims need.' : 'No EI children yet.'}
              </td></tr>
            )}
            {shown.map(c => (
              <Fragment key={c.id}>
                <tr>
                  <td style={td}>
                    <div style={{ fontWeight: 500 }}>{c.Name}</div>
                    <div style={{ fontSize: 12, color: MUTED }}>{[c.current?.ei_child_id || c.ID_Number ? `ID # ${c.current?.ei_child_id || c.ID_Number}` : null, fmt(c.current?.date_of_birth || c.Date_of_Birth)].filter(Boolean).join(' · ') || '—'}</div>
                    {c.problems.length > 0 && <div style={{ fontSize: 12, color: TONES.danger.fg, marginTop: 2 }}>Missing: {c.problems.join(', ')}</div>}
                  </td>
                  <td style={td}>
                    {c.current ? summary(c.current) : <span style={{ color: MUTED }}>None entered</span>}
                    {c.versions.length > 1 && <div style={{ fontSize: 12, color: MUTED }}>{c.versions.length} versions · since {fmt(c.current?.start_date) || 'the start'}</div>}
                  </td>
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
                    <button type="button" onClick={() => setOpen(open === c.id ? null : c.id)} style={buttonStyle('text')}>{open === c.id ? 'Close' : 'Edit'}</button>
                  </td>
                </tr>
                {open === c.id && (
                  <tr>
                    <td colSpan={4} style={{ ...td, background: '#FCFCFD', padding: 16 }}>
                      <ChildPanel child={c} counties={counties} onChanged={(patch) => updateChild(c.id, patch)} />
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
