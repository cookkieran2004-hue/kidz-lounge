import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from './api';
import { useIsMobile } from './useIsMobile';
import { Card, PageHeader, Tag, UnderlineTabs } from './dashboardUi';
import { INK, MUTED, HAIRLINE, PAGE_BG, FONT, NUMERIC, TONES, buttonStyle } from './uiTokens';
import { fmtDate } from './sessionNotePdf';

// The office's EI compliance dashboard (the "ei" feature, PedsDesk only, Oct
// 2026; API routes/compliance.js): everything an NYC EI agency is audited on
// that's waiting on someone, worked out fresh from the records. Reception,
// Admins and Developers.

const SECTIONS = [
  { key: 'notes', label: 'Session notes' },
  { key: 'reports', label: 'Progress reports' },
  { key: 'evals', label: 'Evaluation reports' },
  { key: 'starts', label: 'Service starts' },
  { key: 'absences', label: 'Provider absences' },
  { key: 'orders', label: 'Orders (PT/OT)' },
  { key: 'makeups', label: 'Make-ups' },
  { key: 'transitions', label: 'Turning 3' },
  { key: 'ifsps', label: 'IFSPs ending' },
  { key: 'authorizations', label: 'Authorizations' },
  { key: 'credentials', label: 'Credentials' },
];

function Rows({ items, isMobile, onNotified }) {
  const navigate = useNavigate();
  if (!items.length) return <p style={{ margin: 0, fontSize: 13.5, color: MUTED }}>Nothing waiting.</p>;
  return items.map((x, i) => {
    const to = x.href || (x.patient_name ? `/patients/${encodeURIComponent(x.patient_name)}` : null);
    // A provider's absence: once the family and SC are told, record it here.
    if (x.notice) {
      return (
        <div key={`${x.notice.provider}-${x.notice.absence_date}-${x.patient_id}`}
          style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(0, 2.4fr) 100px 150px', gap: isMobile ? 4 : 12, alignItems: 'center', padding: '9px 0', borderTop: i ? `1px solid ${HAIRLINE}` : 'none', fontSize: 13.5, color: INK, ...NUMERIC }}>
          <span style={{ fontWeight: 600 }}>{x.patient_name}</span>
          <span>{x.text}</span>
          <span><Tag tone={x.severity === 'danger' ? 'danger' : 'warning'}>{fmtDate(x.date)}</Tag></span>
          <button type="button" onClick={() => api.addAbsenceNotice(x.notice).then(onNotified).catch(err => window.alert(err.message))} style={buttonStyle('secondary', { padding: '4px 10px' })}>Told family &amp; SC</button>
        </div>
      );
    }
    return (
      <button key={`${x.href || ''}-${x.patient_name || ''}-${x.text}-${i}`} type="button" disabled={!to} onClick={() => to && navigate(to)}
        style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr) auto' : 'minmax(0, 1fr) minmax(0, 0.8fr) minmax(0, 1.8fr) 100px', gap: isMobile ? 4 : 12, alignItems: 'center',
          width: '100%', textAlign: 'left', padding: '9px 0', border: 'none', borderTop: i ? `1px solid ${HAIRLINE}` : 'none', background: 'none', cursor: to ? 'pointer' : 'default', fontFamily: 'inherit', fontSize: 13.5, color: INK, ...NUMERIC }}>
        {isMobile ? (
          <>
            <span>
              <span style={{ fontWeight: 600 }}>{x.patient_name || x.provider}</span>
              <span style={{ display: 'block', fontSize: 12.5, color: MUTED }}>{[x.patient_name ? x.provider : null, x.text].filter(Boolean).join(' · ')}</span>
            </span>
            <Tag tone={x.severity === 'danger' ? 'danger' : 'warning'}>{x.date ? fmtDate(x.date) : x.severity === 'danger' ? 'Late' : 'Soon'}</Tag>
          </>
        ) : (
          <>
            <span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{x.patient_name || x.provider}</span>
            <span style={{ color: MUTED, overflowWrap: 'anywhere' }}>{x.patient_name ? x.provider || '' : ''}</span>
            <span style={{ overflowWrap: 'anywhere' }}>{x.text}</span>
            <span><Tag tone={x.severity === 'danger' ? 'danger' : 'warning'}>{x.date ? fmtDate(x.date) : x.severity === 'danger' ? 'Late' : 'Soon'}</Tag></span>
          </>
        )}
      </button>
    );
  });
}

export default function CompliancePage() {
  const isMobile = useIsMobile(900);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('notes');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let alive = true;
    api.getCompliance()
      .then(d => { if (alive) { setData(d); setError(null); } })
      .catch(err => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [reload]);
  const sections = data?.sections || {};
  const late = (k) => (sections[k] || []).filter(x => x.severity === 'danger').length;
  const items = sections[tab];
  return (
    <div style={{ background: PAGE_BG, fontFamily: FONT, minHeight: '100%' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '18px 14px 40px' : '28px 28px 56px' }}>
        <PageHeader title="Compliance" isMobile={isMobile} />
        <UnderlineTabs label="Compliance areas" active={tab} onPick={setTab} style={{ marginBottom: 16 }}
          tabs={SECTIONS.map(s => ({ key: s.key, label: s.label, count: data ? (sections[s.key] || []).length : null, alert: late(s.key) ? 'danger' : (sections[s.key] || []).length ? 'warning' : null }))} />
        <Card pad={isMobile ? 14 : 20}>
          {error && <p role="alert" style={{ margin: 0, fontSize: 13.5, color: TONES.danger.fg }}>{error}</p>}
          {!data && !error && <p style={{ margin: 0, fontSize: 13.5, color: MUTED }}>Loading...</p>}
          {data && items === null && <p style={{ margin: 0, fontSize: 13.5, color: TONES.danger.fg }}>This part couldn't be worked out. Try again later.</p>}
          {data && items && <Rows items={items} isMobile={isMobile} onNotified={() => setReload(n => n + 1)} />}
        </Card>
      </div>
    </div>
  );
}
