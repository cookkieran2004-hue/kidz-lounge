import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useIsMobile } from '../useIsMobile';
import { Avatar } from '../Avatar';
import { calculateTenure } from './StaffPage';
import { DateField, dateToInputValue } from './SchedulePage';
import { Card, Tag, PageHeader, StatStrip, Stat, UnderlineTabs } from '../dashboardUi';
import { INK, MUTED, SUBTLE, HAIRLINE, PAGE_BG, FONT, NUMERIC, TONES, buttonStyle } from '../uiTokens';

// My profile: who you are at the practice (a summary up top), the details
// you can change yourself, and your licences/certifications. Position,
// role, provider link and hire date are managed by an admin.

const TABS = [
  { key: 'profile', label: 'Profile' },
  { key: 'credentials', label: 'Credentials' },
];
const EXPIRING_SOON_DAYS = 60;

const toDate = (s) => new Date(s + 'T00:00:00');
const longDate = (s) => toDate(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const shortDate = (s) => toDate(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const daysFromToday = (s) => Math.round((toDate(s) - toDate(dateToInputValue(new Date()))) / 86400000);

// Phone numbers are US 10-digit numbers, always stored as (555) 555-5555.
// Only digits can be typed; a leading country code 1 is dropped.
function phoneDigits(value) {
  let d = String(value || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d.slice(0, 10);
}
function formatPhone(value) {
  const d = phoneDigits(value);
  if (d.length === 0) return '';
  if (d.length < 4) return `(${d}`;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

// Days until the next anniversary of the hire date (0 on the day).
function daysToAnniversary(hireDate) {
  if (!hireDate) return null;
  const hire = toDate(hireDate);
  const today = toDate(dateToInputValue(new Date()));
  let next = new Date(today.getFullYear(), hire.getMonth(), hire.getDate());
  if (next < today) next = new Date(today.getFullYear() + 1, hire.getMonth(), hire.getDate());
  return Math.round((next - today) / 86400000);
}

function credentialTone(c) {
  if (!c.expiration_date) return { tone: 'neutral', text: 'No expiry', key: 'none' };
  const left = daysFromToday(c.expiration_date);
  if (left < 0) return { tone: 'danger', text: 'Expired', key: 'expired' };
  if (left <= EXPIRING_SOON_DAYS) return { tone: 'warning', text: left === 0 ? 'Expires today' : `Expires in ${left} day${left === 1 ? '' : 's'}`, key: 'soon' };
  return { tone: 'success', text: 'Current', key: 'valid' };
}

const fieldStyle = (isMobile) => ({ width: '100%', padding: isMobile ? '10px 12px' : '8px 10px', borderRadius: 6, border: `1px solid ${HAIRLINE}`, fontSize: isMobile ? 15 : 13.5, boxSizing: 'border-box', fontFamily: 'inherit', color: INK, background: 'white' });
const labelStyle = { display: 'block', fontSize: 12.5, fontWeight: 500, color: '#3F3F46', marginBottom: 5 };
const helpStyle = { fontSize: 12, color: MUTED, marginTop: 4 };

// ---------- profile tab ----------
function ProfileDetails({ profile, onUpdated, isMobile }) {
  const savedPhone = formatPhone(profile.phone);
  const [form, setForm] = useState({ preferred_name: profile.preferred_name || '', phone: savedPhone, email: profile.email || '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const dirty = form.preferred_name !== (profile.preferred_name || '') || form.phone !== savedPhone || form.email !== (profile.email || '');
  const set = (k) => (e) => { setSaved(false); setForm(f => ({ ...f, [k]: e.target.value })); };
  const setPhone = (e) => { setSaved(false); setForm(f => ({ ...f, phone: formatPhone(e.target.value) })); };
  const phoneCount = phoneDigits(form.phone).length;
  const phoneValid = phoneCount === 0 || phoneCount === 10;
  // An older number saved as free text that isn't 10 digits.
  const storedPhoneInvalid = !!profile.phone && phoneDigits(profile.phone).length !== 10;

  const handleSave = async () => {
    if (!phoneValid) { setError('Enter a full 10-digit phone number, or leave it blank.'); return; }
    setSaving(true); setError(null);
    try {
      const updated = await api.updateMyProfile(form);
      onUpdated(updated);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  };

  const grid = { display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))', gap: 14 };
  return (
    <Card title="Personal details">
      <div style={{ ...grid, marginBottom: 14 }}>
        <div>
          <label style={labelStyle} htmlFor="kl-me-legal">Legal name</label>
          <input id="kl-me-legal" style={{ ...fieldStyle(isMobile), background: '#FAFAFA', color: MUTED }} value={[profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(' ')} disabled />
        </div>
        <div>
          <label style={labelStyle} htmlFor="kl-me-preferred">Preferred name</label>
          <input id="kl-me-preferred" style={fieldStyle(isMobile)} value={form.preferred_name} onChange={set('preferred_name')} placeholder={profile.first_name || ''} />
          <div style={helpStyle}>Shown on the schedule, tasks and chat.</div>
        </div>
        <div>
          <label style={labelStyle} htmlFor="kl-me-phone">Phone</label>
          <input
            id="kl-me-phone" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={14}
            aria-invalid={!phoneValid} aria-describedby="kl-me-phone-hint"
            style={{ ...fieldStyle(isMobile), ...(phoneValid ? {} : { borderColor: '#D92D20' }) }}
            value={form.phone} onChange={setPhone} placeholder="(555) 555-5555"
          />
          <div id="kl-me-phone-hint" style={{ ...helpStyle, color: phoneValid ? MUTED : '#B42318' }}>
            {!phoneValid
              ? `Enter all 10 digits (${phoneCount} of 10 so far).`
              : storedPhoneInvalid && form.phone === savedPhone
                ? `Your saved number (${profile.phone}) isn't a full phone number. Please re-enter it.`
                : '10-digit US number, including area code.'}
          </div>
        </div>
        <div>
          <label style={labelStyle} htmlFor="kl-me-email">Email</label>
          <input id="kl-me-email" type="email" style={fieldStyle(isMobile)} value={form.email} onChange={set('email')} placeholder="you@example.com" />
        </div>
      </div>
      {error && <p role="alert" style={{ color: '#B42318', fontSize: 12.5, margin: '0 0 10px' }}>{error}</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 16, borderTop: `1px solid ${HAIRLINE}` }}>
        <button type="button" onClick={handleSave} disabled={saving || !dirty || !phoneValid} style={buttonStyle('primary', { opacity: saving || !dirty || !phoneValid ? 0.45 : 1, cursor: saving || !dirty || !phoneValid ? 'default' : 'pointer' })}>
          {saving ? 'Saving...' : 'Save changes'}
        </button>
        {saved && !dirty && <span role="status" style={{ fontSize: 12.5, color: TONES.success.fg }}>Changes saved.</span>}
        {dirty && !saving && <span style={{ fontSize: 12.5, color: phoneValid ? MUTED : '#B42318' }}>{phoneValid ? 'Unsaved changes' : 'Complete the phone number to save.'}</span>}
      </div>
    </Card>
  );
}

function AdminManagedCard({ profile }) {
  const rows = [
    ['Position', profile.position || 'Not set'],
    ['Role', profile.role === 'admin' ? 'Admin' : 'Staff'],
    ['Linked provider', profile.provider_name || 'None'],
    ['Hire date', profile.hire_date ? longDate(profile.hire_date) : 'Not set'],
    ['Username', profile.username],
  ];
  return (
    <Card title="Employment" subtitle="Maintained by an administrator.">
      <dl style={{ margin: 0 }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderTop: `1px solid ${HAIRLINE}` }}>
            <dt style={{ fontSize: 13, color: MUTED }}>{label}</dt>
            <dd style={{ margin: 0, fontSize: 13.5, color: INK, textAlign: 'right' }}>{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

// ---------- credentials tab ----------
function CredentialForm({ initial, isMobile, onSave, onCancel }) {
  const [name, setName] = useState(initial?.credential_name || '');
  const [expiration, setExpiration] = useState(initial?.expiration_date || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    if (!name.trim() || !expiration) { setError('Name and expiration date are required.'); return; }
    setSaving(true); setError(null);
    try {
      await onSave({ credential_name: name.trim(), expiration_date: expiration, notes: notes.trim() });
    } catch (err) {
      setError(err.message); setSaving(false);
    }
  };

  return (
    <div style={{ border: `1px solid ${HAIRLINE}`, borderRadius: 6, padding: 16, background: '#FAFAFA', margin: '12px 0' }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))', gap: 14, marginBottom: 14 }}>
        <div>
          <label style={labelStyle} htmlFor="kl-cred-name">Credential name</label>
          <input id="kl-cred-name" style={fieldStyle(isMobile)} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. CCC-SLP License, CPR Certification" />
        </div>
        <div>
          <label style={labelStyle} htmlFor="kl-cred-exp">Expiration date</label>
          <DateField id="kl-cred-exp" style={fieldStyle(isMobile)} yearNav value={expiration} onChange={setExpiration} />
        </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle} htmlFor="kl-cred-notes">Notes (optional)</label>
        <input id="kl-cred-notes" style={fieldStyle(isMobile)} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Renew via ASHA" />
      </div>
      {error && <p role="alert" style={{ color: '#B42318', fontSize: 12.5, margin: '0 0 10px' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={submit} disabled={saving} style={buttonStyle('primary')}>{saving ? 'Saving...' : initial ? 'Save' : 'Add credential'}</button>
        <button type="button" onClick={onCancel} disabled={saving} style={buttonStyle('secondary')}>Cancel</button>
      </div>
    </div>
  );
}

const CRED_COLUMNS = 'minmax(0, 1fr) 150px 170px 150px';

function CredentialRow({ c, isMobile, onEdit, onRemove }) {
  const [confirming, setConfirming] = useState(false);
  const status = credentialTone(c);
  const small = { padding: '5px 10px', fontSize: 12.5 };
  const actions = confirming ? (
    <>
      <button type="button" onClick={() => { setConfirming(false); onRemove(c.id); }} style={buttonStyle('secondary', { ...small, background: '#B42318', borderColor: '#B42318', color: 'white' })}>Remove</button>
      <button type="button" onClick={() => setConfirming(false)} style={buttonStyle('secondary', small)}>Cancel</button>
    </>
  ) : (
    <>
      <button type="button" onClick={() => onEdit(c)} style={buttonStyle('secondary', small)}>Edit</button>
      <button type="button" onClick={() => setConfirming(true)} style={buttonStyle('danger', small)}>Remove</button>
    </>
  );
  const name = (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 13.5, fontWeight: 500, color: INK }}>{c.credential_name}</div>
      {c.notes && <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>{c.notes}</div>}
      {confirming && <div style={{ fontSize: 12.5, color: '#B42318', marginTop: 4 }}>Remove this credential?</div>}
    </div>
  );
  const expires = <span style={{ fontSize: 13.5, color: INK, ...NUMERIC }}>{c.expiration_date ? shortDate(c.expiration_date) : '–'}</span>;
  if (isMobile) {
    return (
      <div style={{ padding: '12px 0', borderBottom: `1px solid ${HAIRLINE}` }}>
        {name}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>{expires}<Tag tone={status.tone}>{status.text}</Tag></div>
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>{actions}</div>
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: CRED_COLUMNS, gap: 16, alignItems: 'center', padding: '12px 0', borderBottom: `1px solid ${HAIRLINE}` }}>
      {name}
      {expires}
      <span><Tag tone={status.tone}>{status.text}</Tag></span>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>{actions}</div>
    </div>
  );
}

function CredentialsPanel({ credentials, isMobile, onChanged }) {
  const [mode, setMode] = useState(null); // null | 'new' | credential being edited
  const sorted = [...credentials].sort((a, b) => (a.expiration_date || '9999').localeCompare(b.expiration_date || '9999'));
  const add = async (record) => { await api.addCredential({ ...record, notes: record.notes || null }); setMode(null); onChanged(); };
  const save = async (record) => { await api.updateCredential(mode.id, record); setMode(null); onChanged(); };
  const remove = async (id) => { await api.deleteCredential(id); onChanged(); };

  return (
    <Card
      title="Licences and certifications"
      subtitle={`Credentials expiring within ${EXPIRING_SOON_DAYS} days are flagged. A renewal task is created 14 days before expiry.`}
      action={!mode && <button type="button" onClick={() => setMode('new')} style={buttonStyle('secondary')}>Add credential</button>}
    >
      <div>
        {mode === 'new' && <CredentialForm isMobile={isMobile} onSave={add} onCancel={() => setMode(null)} />}
        {sorted.length > 0 && !isMobile && (
          <div style={{ display: 'grid', gridTemplateColumns: CRED_COLUMNS, gap: 16, padding: '0 0 8px', fontSize: 12, color: MUTED, borderBottom: `1px solid ${HAIRLINE}` }}>
            <span>Credential</span><span>Expires</span><span>Status</span><span />
          </div>
        )}
        {sorted.length === 0 && mode !== 'new' && (
          <p style={{ fontSize: 13.5, color: MUTED, margin: 0 }}>No credentials on file.</p>
        )}
        {sorted.map(c => (mode && mode !== 'new' && mode.id === c.id
          ? <CredentialForm key={c.id} initial={c} isMobile={isMobile} onSave={save} onCancel={() => setMode(null)} />
          : <CredentialRow key={c.id} c={c} isMobile={isMobile} onEdit={setMode} onRemove={remove} />
        ))}
      </div>
    </Card>
  );
}

// ---------- page ----------
export default function MyProfilePage() {
  const isMobile = useIsMobile(768);
  const isNarrow = useIsMobile(1024);
  const [profile, setProfile] = useState(null);
  const [credentials, setCredentials] = useState([]);
  const [error, setError] = useState(null);

  // The chosen tab lives in the address (?tab=credentials) so a refresh or
  // a shared link lands on the same tab.
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS.some(t => t.key === searchParams.get('tab')) ? searchParams.get('tab') : 'profile';
  const setTab = (key) => setSearchParams(key === 'profile' ? {} : { tab: key }, { replace: true });

  useEffect(() => {
    let alive = true;
    api.getMyProfile().then(p => { if (alive) setProfile(p); }).catch(() => { if (alive) setError('Your profile could not be loaded. Refresh the page to try again.'); });
    api.getMyCredentials().then(c => { if (alive) setCredentials(c || []); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const reloadCredentials = useCallback(() => api.getMyCredentials().then(c => setCredentials(c || [])).catch(() => {}), []);

  if (error) return <div style={{ padding: 24, fontSize: 14, color: '#B42318' }}>{error}</div>;
  if (!profile) return <div style={{ padding: 24, fontSize: 14, color: MUTED }}>Loading...</div>;

  const displayName = `${profile.preferred_name || profile.first_name} ${profile.last_name}`;
  const tenure = calculateTenure(profile.hire_date);
  const anniversary = daysToAnniversary(profile.hire_date);
  const expired = credentials.filter(c => credentialTone(c).key === 'expired').length;
  const soon = credentials.filter(c => credentialTone(c).key === 'soon').length;
  const counts = { profile: null, credentials: credentials.length };

  const meta = [profile.position, profile.role === 'admin' ? 'Administrator' : 'Staff', profile.provider_name ? `Provider: ${profile.provider_name}` : null].filter(Boolean).join(' · ');
  return (
    <div style={{ background: PAGE_BG, fontFamily: FONT, minHeight: '100%' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? '18px 14px 40px' : '28px 28px 56px' }}>
        <PageHeader title="My profile" subtitle="Your contact details, employment information and credentials." isMobile={isMobile} />

        {/* Who you are, at a glance */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <Avatar name={displayName} size={40} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: INK }}>{displayName}</div>
            {meta && <div style={{ fontSize: 13, color: MUTED }}>{meta}</div>}
          </div>
        </div>

        <StatStrip columns={isNarrow ? 1 : 3} isMobile={isMobile || isNarrow}>
          <Stat first isMobile={isMobile || isNarrow} label="Hire date"
            value={<span style={{ fontSize: 18 }}>{profile.hire_date ? shortDate(profile.hire_date) : 'Not set'}</span>}
            sub={profile.hire_date ? `${tenure ? tenure.replace(/^./, c => c.toUpperCase()) : ''} of service${anniversary === 0 ? '; anniversary today' : `; anniversary in ${anniversary} day${anniversary === 1 ? '' : 's'}`}` : 'An administrator can add it.'}
          />
          <Stat isMobile={isMobile || isNarrow} label="Contact"
            value={<span style={{ fontSize: 15, fontWeight: 500 }}>{profile.email || <span style={{ color: SUBTLE }}>No email on file</span>}</span>}
            sub={profile.phone ? (phoneDigits(profile.phone).length === 10 ? formatPhone(profile.phone) : profile.phone) : 'No phone on file'}
          />
          <Stat isMobile={isMobile || isNarrow} label="Credentials"
            value={<span style={{ fontSize: 18 }}>{credentials.length} on file</span>}
          >
            <div style={{ fontSize: 12.5, marginTop: 4, color: expired ? TONES.danger.fg : soon ? TONES.warning.fg : MUTED }}>
              {expired || soon ? [expired && `${expired} expired`, soon && `${soon} expiring soon`].filter(Boolean).join(', ') : credentials.length ? 'All current' : 'None added yet'}
            </div>
          </Stat>
        </StatStrip>

        <UnderlineTabs
          label="Profile sections"
          active={tab}
          onPick={setTab}
          style={{ marginBottom: 20 }}
          tabs={TABS.map(t => ({ ...t, count: counts[t.key], alert: t.key === 'credentials' && (expired || soon) > 0 ? (expired ? 'danger' : 'warning') : null }))}
        />

        {tab === 'profile' && (
          <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) 360px', gap: 20, alignItems: 'start' }}>
            <ProfileDetails profile={profile} onUpdated={setProfile} isMobile={isMobile} />
            <AdminManagedCard profile={profile} />
          </div>
        )}
        {tab === 'credentials' && <CredentialsPanel credentials={credentials} isMobile={isMobile} onChanged={reloadCredentials} />}
      </div>
    </div>
  );
}
