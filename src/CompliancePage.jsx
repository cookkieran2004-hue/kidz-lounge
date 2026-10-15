import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from './api';
import { useIsMobile } from './useIsMobile';
import { Card, PageHeader, Tag, UnderlineTabs } from './dashboardUi';
import { INK, MUTED, HAIRLINE, PAGE_BG, FONT, NUMERIC, TONES, ACCENT, buttonStyle } from './uiTokens';
import { featureOn } from './brand';
import { fmtDate } from './sessionNotePdf';

// The office's EI compliance dashboard (the "ei" feature, PedsDesk only, Oct
// 2026; API routes/compliance.js): everything an NYC EI agency is audited on
// that's waiting on someone, worked out fresh from the records. Reception,
// Admins and Developers.

// The API's sections sorted into four groups (Kieran, Oct 2026: eleven
// tabs in a row made things hard to find). A summary of the groups comes
// first; picking one shows its sections as tabs. Make-ups and credentials
// have their own pages (Mandates, Credentials), so they're counted here and
// linked to rather than listed twice.
const GROUPS = [
  { key: 'paperwork', label: 'Paperwork', sections: [['notes', 'Session notes'], ['reports', 'Progress reports'], ['evals', 'Evaluation reports']] },
  { key: 'services', label: 'Services', sections: [['starts', 'Service starts'], ['absences', 'Provider absences']],
    link: { section: 'makeups', to: featureOn('mandates') ? '/mandates' : '/billing', page: 'Mandates', what: (n) => `${n} make-up${n === 1 ? '' : 's'} owed or due` } },
  { key: 'deadlines', label: 'Child deadlines', sections: [['ifsps', 'IFSPs ending'], ['authorizations', 'Authorizations'], ['transitions', 'Turning 3'], ['orders', 'Orders (PT/OT)']] },
  { key: 'staff', label: 'Staff', sections: [],
    link: { section: 'credentials', to: '/credentials', page: 'Credentials', what: (n) => `${n} staff credential${n === 1 ? '' : 's'} expired or expiring` } },
];
const keysOf = (g) => [...g.sections.map(([k]) => k), ...(g.link ? [g.link.section] : [])];

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

function GroupCard({ group, sections, active, first, isMobile, onPick }) {
  const items = keysOf(group).flatMap(k => sections[k] || []);
  const late = items.filter(x => x.severity === 'danger').length;
  return (
    <button type="button" onClick={onPick} aria-pressed={active}
      style={{
        textAlign: 'left', padding: '14px 20px', minWidth: 0, background: 'white', cursor: 'pointer', fontFamily: 'inherit',
        border: 'none', borderLeft: !isMobile && !first ? `1px solid ${HAIRLINE}` : 'none', borderTop: isMobile && !first ? `1px solid ${HAIRLINE}` : 'none',
        boxShadow: active ? `inset 0 -2px 0 ${ACCENT}` : 'none',
      }}>
      <div style={{ fontSize: 12.5, color: active ? ACCENT : MUTED, fontWeight: active ? 600 : 400, marginBottom: 6 }}>{group.label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: INK, lineHeight: 1.2, ...NUMERIC }}>{items.length}</div>
      <div style={{ fontSize: 12.5, marginTop: 4, color: late ? TONES.danger.fg : MUTED, ...NUMERIC }}>{late ? `${late} late` : 'Nothing late'}</div>
    </button>
  );
}

export default function CompliancePage() {
  const isMobile = useIsMobile(900);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [groupKey, setGroupKey] = useState('paperwork');
  const [picked, setPicked] = useState({});
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
  const group = GROUPS.find(g => g.key === groupKey);
  const tab = picked[groupKey] || group.sections[0]?.[0] || null;
  const items = tab ? sections[tab] : undefined;
  const linked = group.link ? sections[group.link.section] : undefined;
  return (
    <div style={{ background: PAGE_BG, fontFamily: FONT, minHeight: '100%' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '18px 14px 40px' : '28px 28px 56px' }}>
        <PageHeader title="Compliance" isMobile={isMobile} />
        {error && <p role="alert" style={{ margin: '0 0 12px', fontSize: 13.5, color: TONES.danger.fg }}>{error}</p>}
        {!data && !error && <p style={{ margin: 0, fontSize: 13.5, color: MUTED }}>Loading...</p>}
        {data && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : `repeat(${GROUPS.length}, minmax(0, 1fr))`, border: `1px solid ${HAIRLINE}`, borderRadius: 8, overflow: 'hidden', marginBottom: 20 }}>
              {GROUPS.map((g, i) => <GroupCard key={g.key} group={g} sections={sections} first={i === 0} isMobile={isMobile} active={g.key === groupKey} onPick={() => setGroupKey(g.key)} />)}
            </div>
            {group.sections.length > 0 && (
              <UnderlineTabs label={`${group.label} areas`} active={tab} onPick={(k) => setPicked(p => ({ ...p, [groupKey]: k }))} style={{ marginBottom: 16 }}
                tabs={group.sections.map(([key, label]) => ({ key, label, count: (sections[key] || []).length, alert: late(key) ? 'danger' : (sections[key] || []).length ? 'warning' : null }))} />
            )}
            {tab && (
              <Card pad={isMobile ? 14 : 20}>
                {items === null && <p style={{ margin: 0, fontSize: 13.5, color: TONES.danger.fg }}>This part couldn't be worked out. Try again later.</p>}
                {items && <Rows items={items} isMobile={isMobile} onNotified={() => setReload(n => n + 1)} />}
              </Card>
            )}
            {group.link && (
              <p style={{ margin: tab ? '14px 2px 0' : 0, fontSize: 13.5, color: MUTED }}>
                {linked === null ? `${group.link.page} couldn't be checked. ` : `${group.link.what((linked || []).length)}. `}
                <Link to={group.link.to} style={{ color: ACCENT, fontWeight: 500 }}>Open {group.link.page} →</Link>
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
