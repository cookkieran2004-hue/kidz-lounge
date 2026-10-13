import { useEffect, useState } from 'react';
import { api } from '../api';
import { useIsMobile } from '../useIsMobile';
import { Card, PageHeader, Tag } from '../dashboardUi';
import { formatPhone } from '../phone';
import { INK, MUTED, HAIRLINE, PAGE_BG, FONT, NUMERIC, ACCENT, TONES } from '../uiTokens';

// Provider directory (footer link, everyone signed in; Kieran, Oct 2026): the
// office's provider list, built only from what's saved (kidz-lounge-api
// GET /providers/directory). The name is followed by the credentials from
// the provider's Linked provider tab; phone and email come from their staff
// account, the license number from their License Number credential, and
// DOB (month and day only) from their profile's date of birth.

const COLUMNS = 'minmax(0, 2.2fr) minmax(0, 1.1fr) minmax(0, 2fr) minmax(0, 1fr) minmax(0, 0.8fr) minmax(0, 1.1fr) minmax(0, 0.8fr) minmax(0, 0.7fr)';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// 'MM-DD' (month and day only) -> 'Sep 29'.
const birthday = (md) => (md ? `${MONTHS[Number(md.slice(0, 2)) - 1]} ${Number(md.slice(3, 5))}` : null);
const dash = <span style={{ color: MUTED }}>—</span>;
const fullName = (p) => (p.credentials ? `${p.name}, ${p.credentials}` : p.name);

export default function ProviderDirectoryPage() {
  const isMobile = useIsMobile(900);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let alive = true;
    api.getProviderDirectory()
      .then(r => { if (alive) setRows(r || []); })
      .catch(err => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, []);

  // Current providers first, then past ones; by name within each.
  const sorted = rows ? [...rows].sort((a, b) => (b.current - a.current) || a.name.localeCompare(b.name)) : [];
  const cells = (p) => ({
    name: <span style={{ fontWeight: 600, color: INK, overflowWrap: 'anywhere' }}>{fullName(p)}</span>,
    phone: p.phone ? <a href={`tel:${p.phone.replace(/\D/g, '')}`} style={{ color: INK, textDecoration: 'none', ...NUMERIC }}>{formatPhone(p.phone)}</a> : dash,
    email: p.email ? <a href={`mailto:${p.email}`} style={{ color: ACCENT, overflowWrap: 'anywhere' }}>{p.email}</a> : dash,
    npi: p.npi ? <span style={NUMERIC}>{p.npi}</span> : dash,
    discipline: p.discipline || dash,
    license: p.license_number ? <span style={NUMERIC}>{p.license_number}</span> : dash,
    current: <Tag tone={p.current ? 'success' : 'neutral'}>{p.current ? 'Yes' : 'No'}</Tag>,
    dob: birthday(p.birthday) || dash,
  });

  return (
    <div style={{ background: PAGE_BG, fontFamily: FONT, minHeight: '100%' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: isMobile ? '18px 14px 40px' : '28px 28px 56px' }}>
        <PageHeader title="Provider directory" isMobile={isMobile} />
        <Card pad={isMobile ? 14 : 20}>
          {error && <p role="alert" style={{ margin: 0, fontSize: 13.5, color: TONES.danger.fg }}>{error}</p>}
          {!rows && !error && <p style={{ margin: 0, fontSize: 13.5, color: MUTED }}>Loading...</p>}
          {rows && rows.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: MUTED }}>No providers yet.</p>}
          {rows && rows.length > 0 && (isMobile ? (
            <div>
              {sorted.map((p, i) => {
                const c = cells(p);
                const line = (label, v) => (
                  <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0, 1fr)', gap: 8, fontSize: 13.5, padding: '2px 0' }}>
                    <span style={{ color: MUTED }}>{label}</span><span>{v}</span>
                  </div>
                );
                return (
                  <div key={p.id} style={{ padding: '12px 0', borderTop: i ? `1px solid ${HAIRLINE}` : 'none' }}>
                    <div style={{ fontSize: 14.5, marginBottom: 6 }}>{c.name}</div>
                    {line('Phone', c.phone)}{line('Email', c.email)}{line('NPI', c.npi)}{line('Discipline', c.discipline)}{line('License number', c.license)}{line('Current provider', c.current)}{line('DOB', c.dob)}
                  </div>
                );
              })}
            </div>
          ) : (
            <div role="table" aria-label="Provider directory" style={{ fontSize: 13.5, color: INK }}>
              <div role="row" style={{ display: 'grid', gridTemplateColumns: COLUMNS, gap: 14, padding: '0 0 8px', fontSize: 12, color: MUTED, borderBottom: `1px solid ${HAIRLINE}` }}>
                {['Provider', 'Phone', 'Email', 'NPI', 'Discipline', 'License number', 'Current provider', 'DOB'].map(h => <span role="columnheader" key={h}>{h}</span>)}
              </div>
              {sorted.map(p => {
                const c = cells(p);
                return (
                  <div role="row" key={p.id} style={{ display: 'grid', gridTemplateColumns: COLUMNS, gap: 14, alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${HAIRLINE}` }}>
                    {[c.name, c.phone, c.email, c.npi, c.discipline, c.license, c.current, c.dob].map((v, i) => <span role="cell" key={i} style={{ minWidth: 0 }}>{v}</span>)}
                  </div>
                );
              })}
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
