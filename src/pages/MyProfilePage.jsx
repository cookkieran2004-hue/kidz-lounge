import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useIsMobile } from '../useIsMobile';
import { Avatar } from '../Avatar';
import { BRAND, BRAND_SERIF, calculateTenure } from './StaffPage';
import { DateField, dateToInputValue } from './SchedulePage';
import { Card, Pill, INK, MUTED, HAIRLINE, PAGE_BG, FONT } from '../dashboardUi';

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
  if (!c.expiration_date) return { bg: '#F1F0F4', fg: MUTED, text: 'No expiry', key: 'none' };
  const left = daysFromToday(c.expiration_date);
  if (left < 0) return { bg: '#FEE4E2', fg: '#B42318', text: 'Expired', key: 'expired' };
  if (left <= EXPIRING_SOON_DAYS) return { bg: '#FEF0C7', fg: '#93370D', text: left === 0 ? 'Expires today' : `${left} day${left === 1 ? '' : 's'} left`, key: 'soon' };
  return { bg: '#DCFAE6', fg: '#067647', text: 'Valid', key: 'valid' };
}

const fieldStyle = (isMobile) => ({ width: '100%', padding: isMobile ? '10px 12px' : '9px 11px', borderRadius: 9, border: `1px solid ${HAIRLINE}`, fontSize: isMobile ? 15 : 13.5, boxSizing: 'border-box', fontFamily: 'inherit', color: INK, background: 'white' });
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 700, color: '#4B4659', marginBottom: 5 };
const primaryBtn = { padding: '9px 16px', borderRadius: 9, border: 'none', background: BRAND.forest, color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const ghostBtn = { padding: '8px 13px', borderRadius: 9, border: `1px solid ${HAIRLINE}`, background: 'white', color: '#374151', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' };
const tintBtn = { padding: '8px 14px', borderRadius: 9, border: `1px solid ${BRAND.box}`, background: BRAND.tint, color: BRAND.forest, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' };

// ---------- summary ----------
function StatCard({ eyebrow, big, sub, accent = BRAND.forest }) {
  return (
    <Card pad={16} style={{ position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: '0 auto 0 0', width: 4, background: accent }} />
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: accent, marginBottom: 6 }}>{eyebrow}</div>
      <div style={{ fontFamily: BRAND_SERIF, fontSize: 22, fontWeight: 700, color: INK, lineHeight: 1.2, overflowWrap: 'anywhere' }}>{big}</div>
      {sub && <div style={{ fontSize: 12.5, color: MUTED, marginTop: 5 }}>{sub}</div>}
    </Card>
  );
}

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
          <input id="kl-me-legal" style={{ ...fieldStyle(isMobile), background: '#F6F4FA', color: MUTED }} value={[profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(' ')} disabled />
        </div>
        <div>
          <label style={labelStyle} htmlFor="kl-me-preferred">Preferred name</label>
          <input id="kl-me-preferred" style={fieldStyle(isMobile)} value={form.preferred_name} onChange={set('preferred_name')} placeholder={profile.first_name || ''} />
          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 4 }}>What everyone sees on the schedule, tasks and chat.</div>
        </div>
        <div>
          <label style={labelStyle} htmlFor="kl-me-phone">Phone</label>
          <input
            id="kl-me-phone" type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={14}
            aria-invalid={!phoneValid} aria-describedby="kl-me-phone-hint"
            style={{ ...fieldStyle(isMobile), ...(phoneValid ? {} : { borderColor: '#F04438', boxShadow: '0 0 0 3px rgba(240,68,56,0.12)' }) }}
            value={form.phone} onChange={setPhone} placeholder="(555) 555-5555"
          />
          <div id="kl-me-phone-hint" style={{ fontSize: 11.5, marginTop: 4, color: phoneValid ? MUTED : '#B42318' }}>
            {!phoneValid
              ? `Enter all 10 digits (${phoneCount} of 10 so far).`
              : storedPhoneInvalid && form.phone === savedPhone
                ? `Your saved number (${profile.phone}) isn't a full phone number. Please re-enter it.`
                : '10-digit US number, area code first.'}
          </div>
        </div>
        <div>
          <label style={labelStyle} htmlFor="kl-me-email">Email</label>
          <input id="kl-me-email" type="email" style={fieldStyle(isMobile)} value={form.email} onChange={set('email')} placeholder="you@example.com" />
        </div>
      </div>
      {error && <p role="alert" style={{ color: '#B42318', fontSize: 12.5, margin: '0 0 10px' }}>{error}</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 14, borderTop: `1px solid ${HAIRLINE}` }}>
        <button type="button" onClick={handleSave} disabled={saving || !dirty || !phoneValid} style={{ ...primaryBtn, opacity: saving || !dirty || !phoneValid ? 0.5 : 1, cursor: saving || !dirty || !phoneValid ? 'default' : 'pointer' }}>
          {saving ? 'Saving...' : 'Save changes'}
        </button>
        {saved && !dirty && <span role="status" style={{ fontSize: 12.5, color: '#067647', fontWeight: 700 }}>Saved</span>}
        {dirty && !saving && <span style={{ fontSize: 12.5, color: phoneValid ? MUTED : '#B42318' }}>{phoneValid ? 'You have unsaved changes.' : 'Finish the phone number to save.'}</span>}
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
    <Card title="Managed by an admin">
      <dl style={{ margin: 0 }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: `1px solid ${HAIRLINE}` }}>
            <dt style={{ fontSize: 12.5, fontWeight: 700, color: MUTED }}>{label}</dt>
            <dd style={{ margin: 0, fontSize: 13.5, color: INK, textAlign: 'right' }}>{value}</dd>
          </div>
        ))}
      </dl>
      <p style={{ fontSize: 12, color: MUTED, margin: '10px 0 0' }}>Ask an admin if any of these need changing.</p>
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
    <div style={{ border: `1px solid ${BRAND.box}`, borderRadius: 14, padding: 16, background: '#FCFBFE' }}>
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
        <button type="button" onClick={submit} disabled={saving} style={primaryBtn}>{saving ? 'Saving...' : initial ? 'Save' : 'Add credential'}</button>
        <button type="button" onClick={onCancel} disabled={saving} style={ghostBtn}>Cancel</button>
      </div>
    </div>
  );
}

function CredentialRow({ c, isMobile, onEdit, onRemove }) {
  const [confirming, setConfirming] = useState(false);
  const tone = credentialTone(c);
  const left = c.expiration_date ? daysFromToday(c.expiration_date) : null;
  const actions = confirming ? (
    <>
      <span style={{ fontSize: 12.5, color: '#B42318', fontWeight: 600, alignSelf: 'center' }}>Remove this?</span>
      <button type="button" onClick={() => { setConfirming(false); onRemove(c.id); }} style={{ ...ghostBtn, background: '#B42318', borderColor: '#B42318', color: 'white' }}>Remove</button>
      <button type="button" onClick={() => setConfirming(false)} style={ghostBtn}>Keep</button>
    </>
  ) : (
    <>
      <button type="button" onClick={() => onEdit(c)} style={ghostBtn}>Edit</button>
      <button type="button" onClick={() => setConfirming(true)} style={{ ...ghostBtn, color: '#B42318' }}>Remove</button>
    </>
  );
  return (
    <div style={{ border: `1px solid ${tone.key === 'expired' ? '#F7C5C0' : tone.key === 'soon' ? '#F5D9A8' : '#EEEAF6'}`, borderRadius: 14, padding: 14, background: 'white', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <div aria-hidden="true" style={{ width: 52, flexShrink: 0, borderRadius: 12, background: tone.bg, textAlign: 'center', padding: '7px 0' }}>
        <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.06em', color: tone.fg }}>{c.expiration_date ? toDate(c.expiration_date).toLocaleDateString('en-US', { month: 'short' }).toUpperCase() : '—'}</div>
        <div style={{ fontFamily: BRAND_SERIF, fontSize: 17, fontWeight: 700, color: tone.fg, lineHeight: 1.15 }}>{c.expiration_date ? toDate(c.expiration_date).getFullYear() : ''}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14.5, fontWeight: 700, color: INK }}>{c.credential_name}</span>
          <Pill bg={tone.bg} color={tone.fg}>{tone.text}</Pill>
        </div>
        {c.expiration_date && (
          <div style={{ fontSize: 13, color: '#374151', marginTop: 3 }}>
            {left < 0 ? 'Expired' : 'Expires'} {longDate(c.expiration_date)}
          </div>
        )}
        {c.notes && <div style={{ fontSize: 12.5, color: '#4B4659', marginTop: 6, padding: '6px 10px', background: PAGE_BG, borderRadius: 8, borderLeft: `3px solid ${tone.fg}` }}>{c.notes}</div>}
        {isMobile && <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>{actions}</div>}
      </div>
      {!isMobile && <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>{actions}</div>}
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
    <Card title="Licences and certifications" action={!mode && <button type="button" onClick={() => setMode('new')} style={tintBtn}>+ Add credential</button>}>
      <p style={{ fontSize: 12.5, color: MUTED, margin: '-4px 0 14px' }}>
        Anything expiring within {EXPIRING_SOON_DAYS} days is flagged here, and you'll get a renewal task 14 days before it expires.
      </p>
      <div style={{ display: 'grid', gap: 10 }}>
        {mode === 'new' && <CredentialForm isMobile={isMobile} onSave={add} onCancel={() => setMode(null)} />}
        {sorted.length === 0 && mode !== 'new' && (
          <div style={{ textAlign: 'center', padding: '28px 12px', border: `1.5px dashed ${HAIRLINE}`, borderRadius: 14, color: MUTED, fontSize: 13 }}>
            No credentials on file yet.
          </div>
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

  return (
    <div style={{ background: PAGE_BG, fontFamily: FONT, minHeight: '100%' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? '18px 14px 40px' : '28px 28px 56px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 14 : 18, marginBottom: 22 }}>
          <Avatar name={displayName} size={isMobile ? 56 : 72} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: BRAND.forest, letterSpacing: '0.04em', marginBottom: 2 }}>MY PROFILE</div>
            <h1 style={{ fontFamily: BRAND_SERIF, fontSize: isMobile ? 26 : 32, fontWeight: 700, color: INK, margin: 0 }}>{displayName}</h1>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
              {profile.position && <span style={{ fontSize: 13.5, color: MUTED }}>{profile.position}</span>}
              <Pill bg={BRAND.tint} color={BRAND.forest}>{profile.role === 'admin' ? 'Admin' : 'Staff'}</Pill>
              {profile.provider_name && <Pill bg="#E0EDFB" color="#0C447C">Provider: {profile.provider_name}</Pill>}
            </div>
          </div>
        </div>

        {/* Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : isNarrow ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))', gap: 14, marginBottom: 22 }}>
          <StatCard
            eyebrow="WITH THE PRACTICE"
            big={tenure ? tenure.replace(/^./, c => c.toUpperCase()) : 'Hire date not set'}
            sub={profile.hire_date ? (anniversary === 0 ? `Since ${shortDate(profile.hire_date)} · Happy work anniversary!` : `Since ${shortDate(profile.hire_date)} · anniversary in ${anniversary} day${anniversary === 1 ? '' : 's'}`) : 'Ask an admin to add it.'}
          />
          <StatCard
            eyebrow="CONTACT"
            accent="#2F6FB5"
            big={profile.email || 'No email yet'}
            sub={profile.phone ? (phoneDigits(profile.phone).length === 10 ? formatPhone(profile.phone) : profile.phone) : 'No phone yet'}
          />
          <StatCard
            eyebrow="CREDENTIALS"
            accent={expired ? '#B42318' : soon ? '#B54708' : '#067647'}
            big={`${credentials.length} on file`}
            sub={expired || soon ? [expired && `${expired} expired`, soon && `${soon} expiring soon`].filter(Boolean).join(' · ') : credentials.length ? 'All up to date' : 'Add your licences and certifications'}
          />
        </div>

        {/* Tabs */}
        <div role="tablist" aria-label="Profile sections" style={{ display: 'inline-flex', padding: 3, borderRadius: 11, background: '#F3F0FA', gap: 2, marginBottom: 16 }}>
          {TABS.map(t => {
            const on = t.key === tab;
            const warn = t.key === 'credentials' && (expired || soon);
            return (
              <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => setTab(t.key)}
                style={{ padding: '8px 14px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: on ? 'white' : 'transparent', color: on ? BRAND.forest : MUTED, boxShadow: on ? '0 1px 3px rgba(36,26,51,0.12)' : 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {t.label}
                {counts[t.key] !== null && (
                  <span style={{ fontSize: 11, minWidth: 18, padding: '1px 6px', borderRadius: 999, background: warn ? '#FEF0C7' : on ? BRAND.tint : 'rgba(255,255,255,0.7)', color: warn ? '#93370D' : on ? BRAND.forest : MUTED }}>{counts[t.key]}</span>
                )}
              </button>
            );
          })}
        </div>

        {tab === 'profile' && (
          <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) 360px', gap: 18, alignItems: 'start' }}>
            <ProfileDetails profile={profile} onUpdated={setProfile} isMobile={isMobile} />
            <AdminManagedCard profile={profile} />
          </div>
        )}
        {tab === 'credentials' && <CredentialsPanel credentials={credentials} isMobile={isMobile} onChanged={reloadCredentials} />}
      </div>
    </div>
  );
}
