import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useIsMobile } from '../useIsMobile';
import { usePendingTimeOff } from '../PendingTimeOffContext';
import StaffDirectory from './admin/StaffDirectory';
import { TimeOffManageTab, OfficeHoursTab } from './StaffPage';
import { Card, PageHeader, UnderlineTabs } from '../dashboardUi';
import AuditLogTab from './admin/AuditLogTab';
import ScheduleChangesTab from './admin/ScheduleChangesTab';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { canViewAuditLog } from '../roles';
import { PAGE_BG, FONT } from '../uiTokens';

// ADMIN area. Staff (the default tab) is the people-first directory; each
// card opens /admin/staff/:username, where providers are managed too (a
// provider is part of a person's account -- there's no separate tab).
// Time Off and Office Hours are practice-wide tools.
// Only admins can reach this route (see RequireAdmin in App.jsx), and the
// server enforces admin rights on every endpoint these tabs call.

export default function AdminPage() {
  const isMobile = useIsMobile(768);
  const { user } = useAuth();
  const { pendingCount, refreshPending } = usePendingTimeOff();
  // Changes to past (billing-locked) appointments waiting for approval.
  const [changeCount, setChangeCount] = useState(0);
  const refreshChanges = useCallback(() => {
    api.getScheduleChangeRequests('pending').then(r => setChangeCount((r || []).length)).catch(() => {});
  }, []);
  useEffect(() => { refreshChanges(); }, [refreshChanges]);

  const tabs = [
    { key: 'staff', label: 'Staff' },
    { key: 'time-off', label: 'Time off', badge: pendingCount },
    { key: 'schedule-changes', label: 'Schedule changes', badge: changeCount },
    { key: 'office-hours', label: 'Office hours' },
    // HIPAA audit log: Developers only.
    ...(canViewAuditLog(user) ? [{ key: 'audit-log', label: 'Audit log' }] : []),
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
        {tab === 'schedule-changes' && (
          <Card title="Changes to past dates" pad={isMobile ? 14 : 20}>
            <ScheduleChangesTab isMobile={isMobile} onChanged={refreshChanges} />
          </Card>
        )}
        {tab === 'audit-log' && (
          <Card title="Audit log" pad={isMobile ? 14 : 20}>
            <AuditLogTab isMobile={isMobile} />
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
