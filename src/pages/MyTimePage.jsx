import React from 'react';
import { useIsMobile } from '../useIsMobile';
import { TimeOffTab, PageHeader, PageBody, PAGE_WRAP_STYLE } from './StaffPage';

// Balances, "+ New Request", and the list of your requests all come from
// the existing TimeOffTab -- this page just gives it its own home.
export default function MyTimePage() {
  const isMobile = useIsMobile(768);
  return (
    <div style={PAGE_WRAP_STYLE}>
      <PageHeader title="My time" subtitle="Your time-off balances and requests" isMobile={isMobile} />
      <PageBody isMobile={isMobile}>
        <TimeOffTab isMobile={isMobile} />
      </PageBody>
    </div>
  );
}
