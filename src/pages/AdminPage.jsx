import { useSearchParams } from 'react-router-dom';
import { useIsMobile } from '../useIsMobile';
import { usePendingTimeOff } from '../PendingTimeOffContext';
import StaffDirectory from './admin/StaffDirectory';
import { TimeOffManageTab, OfficeHoursTab } from './StaffPage';
import { Card, PageHeader, UnderlineTabs } from '../dashboardUi';
import { PAGE_BG, FONT } from '../uiTokens';

// ADMIN area. Staff (the default tab) is the people-first directory; each
// card opens /admin/staff/:username, where providers are managed too (a
// provider is part of a person's account -- there's no separate tab).
// Time Off and Office Hours are practice-wide tools.
// Only admins can reach this route (see RequireAdmin in App.jsx), and the
// server enforces admin rights on every endpoint these tabs call.

export default function AdminPage() {
  const isMobile = useIsMobile(768);
  const { pendingCount, refreshPending } = usePendingTimeOff();

  const tabs = [
    { key: 'staff', label: 'Staff' },
    { key: 'time-off', label: 'Time off', badge: pendingCount },
    { key: 'office-hours', label: 'Office hours' },
  ];

  // Tab lives in the address (?tab=staff) so refreshes keep your place.
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = tabs.some(t => t.key === searchParams.get('tab')) ? searchParams.get('tab') : 'staff';
  const setTab = (key) => setSearchParams(key === 'staff' ? {} : { tab: key }, { replace: true });

  return (
    <div style={{ background: PAGE_BG, fontFamily: FONT, minHeight: '100%' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? '18px 14px 40px' : '28px 28px 56px' }}>
        <PageHeader title="Admin" isMobile={isMobile} />
        <UnderlineTabs
          label="Admin sections" active={tab} onPick={setTab} style={{ marginBottom: 18 }}
          tabs={tabs.map(t => ({ key: t.key, label: t.label, count: t.badge > 0 ? t.badge : undefined, warn: t.badge > 0 }))}
        />

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
