import { useIsMobile } from '../useIsMobile';
import { Card, PageHeader } from '../dashboardUi';
import PowerFormsAdminTab from './admin/PowerFormsAdminTab';
import { PAGE_BG, FONT } from '../uiTokens';

// Power Forms builder as its own page (/power-forms, footer link; Kieran,
// Oct 2026). Admins and Developers only (RequireAdmin in App.jsx); the
// server checks the same on every template endpoint.
export default function PowerFormsPage() {
  const isMobile = useIsMobile(768);
  return (
    <div style={{ background: PAGE_BG, fontFamily: FONT, minHeight: '100%' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? '18px 14px 40px' : '28px 28px 56px' }}>
        <PageHeader title="Power Forms" isMobile={isMobile} />
        <Card pad={isMobile ? 14 : 20}>
          <PowerFormsAdminTab />
        </Card>
      </div>
    </div>
  );
}
