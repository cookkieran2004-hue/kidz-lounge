import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useIsMobile } from '../useIsMobile';
import { ProfileBanner, ProfileTab, CredentialsTab, TabStrip, PageBody, PAGE_WRAP_STYLE, BRAND } from './StaffPage';

const TABS = [
  { key: 'profile', label: 'Profile' },
  { key: 'credentials', label: 'Credentials' },
];

export default function MyProfilePage() {
  const isMobile = useIsMobile(768);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);

  // The chosen tab lives in the address (?tab=credentials) so a refresh or
  // a shared link lands on the same tab.
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS.some(t => t.key === searchParams.get('tab')) ? searchParams.get('tab') : 'profile';
  const setTab = (key) => setSearchParams(key === 'profile' ? {} : { tab: key }, { replace: true });

  useEffect(() => {
    api.getMyProfile().then(setProfile).catch(() => setError('Your profile could not be loaded. Refresh the page to try again.'));
  }, []);

  if (error) return <div style={{ padding: 24, fontSize: 14, color: '#b91c1c' }}>{error}</div>;
  if (!profile) return <div style={{ padding: 24, fontSize: 14, color: BRAND.muted }}>Loading...</div>;

  return (
    <div style={PAGE_WRAP_STYLE}>
      <ProfileBanner profile={profile} isMobile={isMobile} />
      <TabStrip tabs={TABS} active={tab} onChange={setTab} isMobile={isMobile} />
      <PageBody isMobile={isMobile}>
        {tab === 'profile' && <ProfileTab profile={profile} isMobile={isMobile} onUpdated={setProfile} />}
        {tab === 'credentials' && <CredentialsTab isMobile={isMobile} />}
      </PageBody>
    </div>
  );
}
