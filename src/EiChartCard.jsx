import { useEffect, useState } from 'react';
import { api } from './api';
import { ChildPanel } from './EiHubChildren';

// The patient chart's EI Billing tab: a child's EI billing details, read
// from the same dated EI details and mandates as EI-Hub billing
// (kidz-lounge-api routes/eiHub.js), saying what a claim would be missing in
// the same words as the Sessions list. Reception, Admins and Developers only
// (the API's canManage): providers don't see EI billing information (Kieran,
// Oct 2026). Auth #s stay with the EI mandate in the patient form.

const MUTED = '#6B6280';
const INK = '#241A33';
const LINE = '#EDE9F7';
const RED = '#B42318';
const GREEN = '#067647';
const ACCENT = '#6D28D9';

const fmt = (s) => (s ? new Date(`${String(s).slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null);
const zipText = (z) => (z && z.length === 9 ? `${z.slice(0, 5)}-${z.slice(5)}` : z);
const referrer = (r) => (r ? `${[r.referring_first, r.referring_last].filter(Boolean).join(' ')} (NPI ${r.referring_npi})` : null);

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, padding: '5px 0', borderBottom: `1px solid ${LINE}` }}>
      <span style={{ color: MUTED, flexShrink: 0 }}>{label}</span>
      <span style={{ color: INK, fontWeight: 500, textAlign: 'right', minWidth: 0 }}>{children}</span>
    </div>
  );
}

// headerStyle / boxStyle match the chart's own sections.
export function EiChartCard({ patient, headerStyle, boxStyle }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let alive = true;
    api.getEiPatient(patient.id)
      .then(d => { if (alive) { setData(d); setError(null); } })
      .catch(err => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [patient.id, reload]);

  if (error) {
    return (
      <>
        <p style={headerStyle}>Early Intervention</p>
        <div style={boxStyle}><p role="alert" style={{ margin: 0, fontSize: 13, color: RED }}>{error}</p></div>
      </>
    );
  }
  if (!data) return <p style={{ fontSize: 13, color: MUTED }}>Loading...</p>;
  if (!data.available) return <p style={{ fontSize: 13, color: MUTED }}>EI billing details need the 2026-10-21 and 2026-10-23 database updates.</p>;
  if (!data.ei) return <p style={{ fontSize: 13, color: MUTED }}>No current EI program.</p>;
  const c = data.child;
  const v = c.current || {};
  const eiName = [v.first_name, v.last_name].filter(Boolean).join(' ');
  const problems = [...c.problems, ...c.services.flatMap(s => s.problems.map(p => `${s.service}: ${p}`))];
  return (
    <>
      <p style={headerStyle}>Early Intervention</p>
      <div style={boxStyle}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
          <div style={{ flex: '1 1 260px', fontSize: 13, color: problems.length ? RED : GREEN }}>
            <div style={{ fontWeight: 600 }}>{problems.length ? 'Not ready to bill' : 'Ready to bill'}</div>
            {problems.map(p => <div key={p} style={{ fontSize: 12.5, marginTop: 2 }}>{p}</div>)}
          </div>
          {data.can_edit && (
            <button type="button" onClick={() => setEditing(e => !e)}
              style={{ border: 'none', background: 'none', padding: 0, color: ACCENT, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {editing ? 'Done' : c.versions.length ? 'Edit EI details' : 'Add EI details'}
            </button>
          )}
        </div>

        {c.current && (
          <>
            <Row label="EI child ID">{v.ei_child_id || '—'}</Row>
            {eiName && eiName !== c.Name && <Row label="Name in EI-Hub">{eiName}</Row>}
            <Row label="Date of birth">{fmt(v.date_of_birth || c.Date_of_Birth) || '—'}</Row>
            <Row label="Sex">{v.sex === 'F' ? 'Female' : v.sex === 'M' ? 'Male' : '—'}</Row>
            <Row label="Diagnosis">{v.diagnosis_codes || '—'}</Row>
            <Row label="County">{v.county || '—'}</Row>
            <Row label="Address">{v.address_line1 ? [v.address_line1, v.address_line2, v.city, [v.state, zipText(v.zip)].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '—'}</Row>
            {c.versions.length > 1 && <Row label="Since">{fmt(v.start_date) || 'the start'} ({c.versions.length} versions)</Row>}
          </>
        )}

        {c.services.map(s => (
          <div key={s.service} style={{ fontSize: 13, padding: '7px 0', borderBottom: `1px solid ${LINE}` }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <strong style={{ color: INK, minWidth: 26 }}>{s.service}</strong>
              {s.mandate && <span style={{ color: MUTED }}>{s.mandate.replace('x', ' × ')} min</span>}
              <span style={{ color: s.authorization_number ? INK : RED }}>{s.authorization_number ? `Auth # ${s.authorization_number}` : 'No auth #'}</span>
            </div>
            {s.service !== 'SI' && s.authorization_number && (
              <div style={{ fontSize: 12.5, color: s.referral ? MUTED : RED, marginTop: 2 }}>
                {s.referral ? `Referred by ${referrer(s.referral)}` : 'No referring provider'}
              </div>
            )}
          </div>
        ))}

        {editing && (
          <div style={{ marginTop: 14, padding: 14, borderRadius: 8, background: 'white', border: `1px solid ${LINE}` }}>
            <ChildPanel child={c} counties={data.counties} onChanged={() => setReload(n => n + 1)} />
            <p style={{ margin: '12px 0 0', fontSize: 12, color: MUTED }}>Auth #s are entered with the EI mandate (Edit patient, Programs).</p>
          </div>
        )}
      </div>
    </>
  );
}
