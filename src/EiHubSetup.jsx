import { useEffect, useState } from 'react';
import { api } from './api';
import { formatPhone } from './phone';
import { INK, MUTED, HAIRLINE, TONES, buttonStyle } from './uiTokens';
import { eiInput, eiLabel, eiGrid as grid } from './eiHubUi';

// EI-Hub billing setup (Developers for now; kidz-lounge-api routes/eiHub.js):
// the agency as billing provider and submitter, and each provider as EI-Hub
// knows them -- NPI, name, and the codes their sessions bill by default
// (one code per 15 minutes, so a 30-minute session uses lines 1 and 2).

const card = { background: 'white', border: `1px solid ${HAIRLINE}`, borderRadius: 12, padding: 16 };

export function Status({ status }) {
  if (!status) return null;
  return <span role={status.error ? 'alert' : 'status'} style={{ fontSize: 12.5, color: status.error ? TONES.danger.fg : TONES.success.fg }}>{status.error || status.ok}</span>;
}

const AGENCY_FIELDS = [
  ['agency_name', 'Agency name (as approved by the state)'],
  ['npi', 'Agency NPI'],
  ['tax_id', 'Tax ID (also the EI-Hub submitter ID)'],
  ['address_line1', 'Address'],
  ['address_line2', 'Address line 2'],
  ['city', 'City'],
  ['state', 'State'],
  ['zip', 'ZIP code'],
  ['contact_name', 'Billing contact name'],
  ['contact_phone', 'Billing contact phone'],
  ['contact_email', 'Billing contact email'],
];
const AGENCY_REQUIRED = ['agency_name', 'npi', 'tax_id', 'address_line1', 'city', 'state', 'zip', 'contact_name'];

function AgencyCard({ agency, onSaved }) {
  const [form, setForm] = useState(() => Object.fromEntries(AGENCY_FIELDS.map(([k]) => [k, k === 'contact_phone' ? formatPhone(agency?.[k]) : agency?.[k] || ''])));
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const missing = AGENCY_REQUIRED.filter(k => !String(form[k] || '').trim());
  const save = async () => {
    setBusy(true); setStatus(null);
    try {
      const saved = await api.saveEiAgency(form);
      setStatus({ ok: 'Saved.' });
      onSaved(saved);
    } catch (err) {
      setStatus({ error: err.message });
    }
    setBusy(false);
  };
  return (
    <section style={card}>
      <h3 style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 600, color: INK }}>Agency</h3>
      <p style={{ margin: '0 0 12px', fontSize: 12.5, color: MUTED }}>The billing provider and submitter on every claim file. These must match what EI-Hub has for the agency.</p>
      <div style={grid}>
        {AGENCY_FIELDS.map(([k, label]) => (
          <div key={k}>
            <label htmlFor={`ei-agency-${k}`} style={eiLabel}>{label}</label>
            <input id={`ei-agency-${k}`} style={eiInput} value={form[k]}
              inputMode={['npi', 'tax_id', 'zip', 'contact_phone'].includes(k) ? 'numeric' : undefined}
              maxLength={k === 'state' ? 2 : undefined}
              onChange={e => setForm(f => ({ ...f, [k]: k === 'contact_phone' ? formatPhone(e.target.value) : e.target.value }))} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
        <button type="button" onClick={save} disabled={busy} style={buttonStyle('primary')}>{busy ? 'Saving...' : 'Save agency'}</button>
        <Status status={status} />
        {!status && missing.length > 0 && <span style={{ fontSize: 12.5, color: TONES.warning.fg }}>Still needed: {missing.map(k => AGENCY_FIELDS.find(f => f[0] === k)[1].replace(/ \(.*\)$/, '')).join(', ')}</span>}
      </div>
    </section>
  );
}

const disciplinesOf = (specialty) => String(specialty || '').split(/[,/]/).map(x => x.trim().toUpperCase()).filter(Boolean);
// How many default code lines a discipline gets: one per 15 minutes of a
// 30-minute session; speech bills one line per session for now.
const LINES = { OT: 2, PT: 2, SI: 2, ST: 1 };

function ProviderRow({ provider, allowed, onSaved }) {
  const initial = () => ({
    npi: provider.npi || '',
    ei_first_name: provider.ei_first_name || '',
    ei_last_name: provider.ei_last_name || '',
    codes: provider.ei_default_codes || {},
  });
  const [form, setForm] = useState(initial);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const disciplines = disciplinesOf(provider.specialty).filter(d => allowed[d]);
  const setCode = (d, i, code) => setForm(f => {
    const list = [...(f.codes[d] || [])];
    list[i] = code;
    return { ...f, codes: { ...f.codes, [d]: list } };
  });
  const save = async () => {
    setBusy(true); setStatus(null);
    try {
      const codes = Object.fromEntries(Object.entries(form.codes).map(([d, list]) => [d, (list || []).filter(Boolean)]));
      const saved = await api.saveEiProvider(provider.Name, { npi: form.npi, ei_first_name: form.ei_first_name, ei_last_name: form.ei_last_name, ei_default_codes: codes });
      setStatus({ ok: 'Saved.' });
      onSaved(saved);
    } catch (err) {
      setStatus({ error: err.message });
    }
    setBusy(false);
  };
  const td = { padding: '10px 10px', borderBottom: `1px solid ${HAIRLINE}`, verticalAlign: 'top', fontSize: 13, color: INK };
  return (
    <tr>
      <td style={td}>
        <div style={{ fontWeight: 500 }}>{provider.Name}</div>
        <div style={{ fontSize: 12, color: MUTED }}>{disciplines.join(', ') || provider.specialty || 'No discipline set'}</div>
      </td>
      <td style={{ ...td, width: 130 }}>
        <input aria-label={`${provider.Name} NPI`} style={{ ...eiInput, borderColor: form.npi ? '#D4D4D8' : '#FDA29B' }} inputMode="numeric" maxLength={10}
          value={form.npi} placeholder="10 digits" onChange={e => setForm(f => ({ ...f, npi: e.target.value.replace(/\D/g, '') }))} />
      </td>
      <td style={{ ...td, width: 260 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input aria-label={`${provider.Name} first name in EI-Hub`} style={eiInput} value={form.ei_first_name} placeholder={provider.first_name || 'First'}
            onChange={e => setForm(f => ({ ...f, ei_first_name: e.target.value }))} />
          <input aria-label={`${provider.Name} last name in EI-Hub`} style={eiInput} value={form.ei_last_name} placeholder={provider.last_name || 'Last'}
            onChange={e => setForm(f => ({ ...f, ei_last_name: e.target.value }))} />
        </div>
        <div style={{ fontSize: 11.5, color: MUTED, marginTop: 3 }}>Leave blank if it's the same as shown.</div>
      </td>
      <td style={td}>
        {disciplines.length === 0 && <span style={{ fontSize: 12.5, color: MUTED }}>Set their discipline on the staff profile first.</span>}
        {disciplines.map(d => (
          <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ width: 24, fontWeight: 600, fontSize: 12.5 }}>{d}</span>
            {Array.from({ length: LINES[d] || 2 }, (_, i) => (
              <select key={i} aria-label={`${provider.Name} ${d} code ${i + 1}`} style={{ ...eiInput, width: 'auto', minWidth: 150 }}
                value={(form.codes[d] || [])[i] || ''} onChange={e => setCode(d, i, e.target.value)}>
                <option value="">{LINES[d] > 1 ? `Line ${i + 1}: not set` : 'Not set'}</option>
                {allowed[d].map(c => <option key={c.code} value={c.code}>{c.code} {c.label}</option>)}
              </select>
            ))}
          </div>
        ))}
      </td>
      <td style={{ ...td, width: 120 }}>
        <button type="button" onClick={save} disabled={busy} style={buttonStyle('secondary')}>{busy ? 'Saving...' : 'Save'}</button>
        <div style={{ marginTop: 4 }}><Status status={status} /></div>
      </td>
    </tr>
  );
}

export default function EiHubSetup() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let alive = true;
    api.getEiSetup().then(d => { if (alive) setData(d); }).catch(err => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, []);
  if (error) return <p role="alert" style={{ fontSize: 13, color: TONES.danger.fg }}>{error}</p>;
  if (!data) return <p style={{ fontSize: 13, color: MUTED }}>Loading...</p>;
  if (!data.available) {
    return <p style={{ ...card, margin: 0, fontSize: 13, color: TONES.warning.fg, background: TONES.warning.bg }}>Billing setup needs the 2026-10-21 database update. Ask an admin to run it.</p>;
  }
  const providers = data.providers.filter(p => !p.archived);
  const th = { textAlign: 'left', padding: '8px 10px', fontSize: 12, fontWeight: 600, color: MUTED, borderBottom: `1px solid ${HAIRLINE}`, background: '#FAFAFA', whiteSpace: 'nowrap' };
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <AgencyCard agency={data.agency} onSaved={agency => setData(d => ({ ...d, agency }))} />
      <section style={{ ...card, padding: 0, overflow: 'clip' }}>
        <div style={{ padding: '16px 16px 10px' }}>
          <h3 style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 600, color: INK }}>Providers</h3>
          <p style={{ margin: 0, fontSize: 12.5, color: MUTED }}>
            Each provider's individual NPI and name must match their therapist record in EI-Hub. Default codes fill in on each session (one code per 15 minutes) and can be changed per session.
          </p>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
            <thead>
              <tr><th style={th}>Provider</th><th style={th}>NPI</th><th style={th}>Name in EI-Hub</th><th style={th}>Default codes</th><th style={th} /></tr>
            </thead>
            <tbody>
              {providers.map(p => (
                <ProviderRow key={p.id} provider={p} allowed={data.allowed_codes}
                  onSaved={saved => setData(d => ({ ...d, providers: d.providers.map(x => (x.Name === saved.Name ? { ...x, ...saved } : x)) }))} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
