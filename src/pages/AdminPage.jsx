import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useIsMobile } from '../useIsMobile';
import { usePendingTimeOff } from '../PendingTimeOffContext';
import StaffDirectory from './admin/StaffDirectory';
import { TimeOffManageTab, OfficeHoursTab, PageHeader, TabStrip, PageBody, PAGE_WRAP_STYLE } from './StaffPage';

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
    { key: 'time-off', label: 'Time Off', badge: pendingCount },
    { key: 'office-hours', label: 'Office Hours' },
  ];

  // Tab lives in the address (?tab=staff) so refreshes keep your place.
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = tabs.some(t => t.key === searchParams.get('tab')) ? searchParams.get('tab') : 'staff';
  const setTab = (key) => setSearchParams(key === 'staff' ? {} : { tab: key }, { replace: true });

  return (
    <div style={PAGE_WRAP_STYLE}>
      <PageHeader title="Admin" subtitle="Staff, time-off approvals, and office hours" isMobile={isMobile} />
      <TabStrip tabs={tabs} active={tab} onChange={setTab} isMobile={isMobile} />
      <PageBody isMobile={isMobile}>
        {tab === 'time-off' && <TimeOffManageTab isMobile={isMobile} embedded onChanged={refreshPending} />}
        {tab === 'office-hours' && <OfficeHoursTab isMobile={isMobile} embedded />}
        {tab === 'staff' && <StaffDirectory />}
      </PageBody>
    </div>
  );
}
