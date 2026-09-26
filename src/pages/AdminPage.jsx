import { useSearchParams } from 'react-router-dom';
import { useIsMobile } from '../useIsMobile';
import { usePendingTimeOff } from '../PendingTimeOffContext';
import StaffDirectory from './admin/StaffDirectory';
import { TimeOffManageTab, OfficeHoursTab, BRAND, BRAND_SERIF } from './StaffPage';
import { Card, INK, MUTED, PAGE_BG, FONT } from '../dashboardUi';

// ADMIN area. Staff (the default tab) is the people-first directory; each
// card opens /admin/staff/:username, where providers are managed too (a
// provider is part of a person's account -- there's no separate tab).
// Time Off and Office Hours are practice-wide tools.
// Only admins can reach this route (see RequireAdmin in App.jsx), and the
// server enforces admin rights on every endpoint these tabs call.

function TabIcon({ name, color }) {
  const paths = {
    staff: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2.4" /><path d="M16 14.2c2.8.3 5 2.6 5 5.8" /></>,
    'time-off': <><rect x="3" y="5" width="18" height="16" rx="2" /><line x1="16" y1="3" x2="16" y2="7" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="3" y1="11" x2="21" y2="11" /><path d="M9 16l2 2 4-4" /></>,
    'office-hours': <><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 14" /></>,
  };
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export default function AdminPage() {
  const isMobile = useIsMobile(768);
  const { pendingCount, refreshPending } = usePendingTimeOff();

  const tabs = [
    { key: 'staff', label: 'Staff' },
    { key: 'time-off', label: 'Time Off', badge: pendingCount },
    { key: 'office-hours', label: 'Office Hours' },
  ];

  // Tab lives in the address (?tab=staff) so refreshes keep your place.
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = tabs.some(t => t.key === searchParams.get('tab')) ? searchParams.get('tab') : 'staff';
  const setTab = (key) => setSearchParams(key === 'staff' ? {} : { tab: key }, { replace: true });

  return (
    <div style={{ background: PAGE_BG, fontFamily: FONT, minHeight: '100%' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? '18px 14px 40px' : '28px 28px 56px' }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: BRAND.forest, letterSpacing: '0.04em', marginBottom: 4 }}>PRACTICE ADMIN</div>
        <h1 style={{ fontFamily: BRAND_SERIF, fontSize: isMobile ? 26 : 32, fontWeight: 700, color: INK, margin: 0 }}>Admin</h1>
        <p style={{ fontSize: 13.5, color: MUTED, margin: '4px 0 20px' }}>Staff accounts, time-off approvals and office hours.</p>

        <div
          role="tablist"
          aria-label="Admin sections"
          style={{ display: isMobile ? 'flex' : 'inline-flex', width: isMobile ? '100%' : 'auto', padding: 4, borderRadius: 12, background: '#F3F0FA', gap: 2, marginBottom: 18, boxSizing: 'border-box' }}
        >
          {tabs.map(t => {
            const on = t.key === tab;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(t.key)}
                style={{
                  flex: isMobile ? 1 : 'none', justifyContent: 'center',
                  padding: isMobile ? '9px 8px' : '9px 16px', borderRadius: 9, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                  fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit',
                  background: on ? 'white' : 'transparent', color: on ? BRAND.forest : MUTED,
                  boxShadow: on ? '0 1px 3px rgba(36,26,51,0.12)' : 'none',
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                }}
              >
                {!isMobile && <TabIcon name={t.key} color={on ? BRAND.forest : MUTED} />}
                {t.label}
                {t.badge > 0 && (
                  <span aria-label={`${t.badge} pending`} style={{ fontSize: 11, fontWeight: 700, minWidth: 18, padding: '1px 6px', borderRadius: 999, background: '#FEF0C7', color: '#93370D' }}>{t.badge}</span>
                )}
              </button>
            );
          })}
        </div>

        {tab === 'staff' && <StaffDirectory />}
        {tab === 'time-off' && (
          <Card title="Time off" pad={isMobile ? 14 : 20}>
            <TimeOffManageTab isMobile={isMobile} embedded onChanged={refreshPending} />
          </Card>
        )}
        {tab === 'office-hours' && (
          <Card title="Office hours" pad={isMobile ? 14 : 20}>
            <OfficeHoursTab isMobile={isMobile} embedded />
          </Card>
        )}
      </div>
    </div>
  );
}
