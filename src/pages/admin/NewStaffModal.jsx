import { useState, useRef } from 'react';
import { api } from '../../api';
import { useAuth } from '../../AuthContext';
import { PasswordConfirmModal, generateTempPassword } from '../ManageDataPage';
import {
  BRAND, BRAND_SERIF, INK, BODY, HAIRLINE, DANGER, FONT, WEEKDAYS,
  cardStyle, btn, inputStyle, labelStyle, hintStyle, overlayStyle, scheduleNameFor,
} from './adminUi';

// ---------------------------------------------------------------------------
// Shown once after creating an account or resetting a password. Only the
// hash is stored, so this is the only time the temporary password is visible.
// ---------------------------------------------------------------------------
export function CredentialsCard({ username, tempPassword, title, personName, children }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(`Username: ${username}\nPassword: ${tempPassword}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div style={cardStyle({ padding: 18, background: '#FCFBFE' })}>
      <p style={{ margin: 0, fontWeight: 700, color: INK, fontSize: 15 }}>{title}</p>
      <p style={{ ...hintStyle(), marginBottom: 12 }}>
        Share these with {personName || username}. They'll set their own password the first time they sign in. This password
        won't be shown again.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', fontSize: 13, alignItems: 'baseline' }}>
        <span style={{ color: BRAND.muted }}>Username</span>
        <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 15, fontWeight: 700, color: INK }}>{username}</span>
        <span style={{ color: BRAND.muted }}>Temporary password</span>
        <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 15, fontWeight: 700, color: INK }}>{tempPassword}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <button type="button" onClick={copy} style={btn('secondary')}>{copied ? 'Copied' : 'Copy both'}</button>
        {children}
      </div>
    </div>
  );
}

// Simple "which days, what hours" picker used before the provider exists.
// (Once they exist, the profile uses the regular schedule editor.)
function WeeklyHoursPicker({ value, onChange }) {
  const toggle = (d) => {
    const next = { ...value };
    if (next[d]) delete next[d]; else next[d] = { start_time: '09:00', end_time: '17:00' };
    onChange(next);
  };
  const setTime = (d, field, v) => onChange({ ...value, [d]: { ...value[d], [field]: v } });
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {WEEKDAYS.map((label, d) => (
          <button
            key={label}
            type="button"
            aria-pressed={!!value[d]}
            onClick={() => toggle(d)}
            style={{
              ...btn('secondary', { padding: '6px 11px', fontSize: 12.5 }),
              ...(value[d] ? { background: BRAND.tint, borderColor: BRAND.box, color: BRAND.brassText } : {}),
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {Object.keys(value).sort().map(d => (
        <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 13, color: BODY }}>
          <span style={{ width: 36, fontWeight: 600 }}>{WEEKDAYS[d]}</span>
          <input type="time" value={value[d].start_time} onChange={e => setTime(d, 'start_time', e.target.value)} style={inputStyle({ width: 120, padding: '6px 8px', fontSize: 13 })} />
          <span style={{ color: BRAND.muted }}>to</span>
          <input type="time" value={value[d].end_time} onChange={e => setTime(d, 'end_time', e.target.value)} style={inputStyle({ width: 120, padding: '6px 8px', fontSize: 13 })} />
        </div>
      ))}
    </div>
  );
}

// Wrapping the control inside the <label> ties the two together, so screen
// readers announce the field name and clicking the label focuses the box.
function Field({ label, required, children, hint }) {
  return (
    <div>
      <label style={{ display: 'block' }}>
        <span style={labelStyle()}>{label}{required && <span aria-hidden="true" style={{ color: DANGER }}> *</span>}</span>
        {children}
      </label>
      {hint && <p style={{ ...hintStyle(), fontSize: 11.5 }}>{hint}</p>}
    </div>
  );
}

function StepHeading({ n, title, sub }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', margin: '22px 0 12px' }}>
      <span style={{ fontFamily: BRAND_SERIF, fontSize: 18, fontWeight: 700, color: BRAND.brass }}>{n}</span>
      <div>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: INK }}>{title}</p>
        {sub && <p style={{ ...hintStyle(), margin: 0 }}>{sub}</p>}
      </div>
    </div>
  );
}

function ScheduleNameLine({ name, clash }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: 13, color: BODY }}>
        On the schedule as{' '}
        <strong style={{ fontFamily: BRAND_SERIF, fontSize: 15, color: name ? INK : BRAND.muted }}>{name || 'their name above'}</strong>
      </p>
      {clash
        ? <p style={{ ...hintStyle(), color: DANGER, fontSize: 12 }}>Another provider already has this name. Add a preferred name above so the two can be told apart.</p>
        : <p style={{ ...hintStyle(), fontSize: 11.5 }}>Always their preferred name (or first name) plus last name, and it updates if their name changes.</p>}
    </div>
  );
}

// A new provider is always created together with their account now, so
// there's no "already on the provider list" choice. The one exception is
// an older provider created before that (no account yet): the Staff page's
// "Create account" button opens this with `initialProvider`, fixed.
const PROVIDER_CHOICES = [
  { key: 'no', label: 'No' },
  { key: 'new', label: 'Yes, add them as a provider' },
];

// After creating a provider we need its exact Name (that's what staff
// accounts link by). Use what the server returned; otherwise look it up.
async function resolveProviderName(created, first, last) {
  if (created?.Name) return created.Name;
  const list = await api.getProviders();
  const matches = list.filter(p =>
    (p.first_name || '').trim().toLowerCase() === first.trim().toLowerCase() &&
    (p.last_name || '').trim().toLowerCase() === last.trim().toLowerCase());
  matches.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
  return matches[0]?.Name || `${first.trim()} ${last.trim()}`;
}

// `initialProvider`: start from a provider who doesn't have an account yet
// (the "Create account" button on the Staff page) -- prefilled and linked.
export default function NewStaffModal({ providers, isMobile, onClose, onCreated, initialProvider = null }) {
  const { user: currentUser } = useAuth();

  const [person, setPerson] = useState({
    first_name: initialProvider?.first_name || '', middle_name: '', last_name: initialProvider?.last_name || '',
    preferred_name: '', position: '', hire_date: '', role: 'staff',
  });
  const setP = (k) => (e) => setPerson(p => ({ ...p, [k]: e.target.value }));

  const [providerChoice, setProviderChoice] = useState(initialProvider ? 'existing' : null); // 'no' | 'new' | 'existing'
  const [prov, setProv] = useState({ specialty: '', credentials: '' });
  const [hours, setHours] = useState({});
  const existingProvider = initialProvider?.Name || '';

  const [tempPassword, setTempPassword] = useState(generateTempPassword);
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(null); // { username, tempPassword, scheduleWarning }

  // A provider created on an earlier attempt (e.g. the admin password was
  // mistyped) is reused rather than created twice.
  const createdProviderName = useRef(null);

  // A provider is always named after their person (preferred name if set).
  const scheduleName = scheduleNameFor(person);
  const providerFirst = (person.preferred_name.trim() || person.first_name.trim());
  const providerLast = person.last_name.trim();

  // Any other provider already using this person's schedule name?
  const nameClash = scheduleName && providers.some(p => p.Name === scheduleName && !(providerChoice === 'existing' && p.Name === existingProvider));
  const renamingExisting = providerChoice === 'existing' && existingProvider && scheduleName && existingProvider !== scheduleName;

  const validate = () => {
    const req = ['first_name', 'middle_name', 'last_name', 'position'];
    if (req.some(k => !person[k].trim())) return 'Enter their first, middle, and last name and their position.';
    if (!providerChoice) return 'Choose whether this person is a provider.';
    if (providerChoice !== 'no' && nameClash) return `Another provider is already named ${scheduleName}. Add a preferred name so the two can be told apart on the schedule.`;
    if (providerChoice === 'existing' && !existingProvider) return 'Choose which provider to link.';
    for (const d of Object.keys(hours)) {
      if (hours[d].end_time <= hours[d].start_time) return `${WEEKDAYS[d]} hours end before they start. Fix the times or turn that day off.`;
    }
    if (!tempPassword.trim()) return 'Enter a temporary password.';
    return null;
  };

  const requestCreate = () => {
    const problem = validate();
    setError(problem);
    if (!problem) setConfirming(true);
  };

  const performCreate = async (adminPassword) => {
    let providerName = '';
    if (providerChoice === 'existing') providerName = existingProvider;
    if (providerChoice === 'new') {
      if (!createdProviderName.current) {
        const created = await api.createProvider({
          first_name: providerFirst, last_name: providerLast,
          specialty: prov.specialty.trim() || undefined, credentials: prov.credentials.trim() || undefined,
        });
        createdProviderName.current = await resolveProviderName(created, providerFirst, providerLast);
      }
      providerName = createdProviderName.current;
    }

    // Throws on a wrong admin password -- the confirm box shows the error
    // and the admin can try again.
    const createdStaff = await api.createStaff({
      first_name: person.first_name.trim(), middle_name: person.middle_name.trim(), last_name: person.last_name.trim(),
      preferred_name: person.preferred_name.trim() || undefined, position: person.position.trim(),
      hire_date: person.hire_date || undefined, role: person.role,
      temporary_password: tempPassword.trim(), provider_name: providerName, admin_password: adminPassword,
    });

    let scheduleWarning = null;
    if (providerChoice === 'new' && Object.keys(hours).length > 0) {
      try {
        await api.setProviderUsualSchedule(providerName, Object.entries(hours).map(([weekday, t]) => ({ weekday: Number(weekday), ...t })));
      } catch (err) {
        scheduleWarning = `The account was created, but their weekly hours didn't save (${err.message}). Set them from the Weekly schedule section of their profile.`;
      }
    }
    setConfirming(false);
    setDone({ username: createdStaff.username, tempPassword: tempPassword.trim(), scheduleWarning });
  };

  const twoCol = isMobile ? '1fr' : '1fr 1fr';
  const threeCol = isMobile ? '1fr' : '1fr 1fr 1fr';

  return (
    <div style={overlayStyle()} onClick={done ? undefined : onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-staff-title"
        onClick={e => e.stopPropagation()}
        style={{ ...cardStyle({ padding: isMobile ? 18 : 26 }), width: '100%', maxWidth: 640, fontFamily: FONT, boxShadow: '0 24px 48px rgba(36,26,51,0.18)' }}
      >
        <h2 id="new-staff-title" style={{ fontFamily: BRAND_SERIF, fontSize: 23, fontWeight: 700, color: INK, margin: 0 }}>
          {done ? 'Account created' : 'Add a staff member'}
        </h2>

        {done ? (
          <div style={{ marginTop: 16 }}>
            {done.scheduleWarning && (
              <p style={{ fontSize: 13, color: DANGER, background: '#FEF3F2', borderRadius: 8, padding: '10px 12px', margin: '0 0 12px' }}>{done.scheduleWarning}</p>
            )}
            <CredentialsCard username={done.username} tempPassword={done.tempPassword} personName={person.preferred_name.trim() || person.first_name.trim()} title="Their sign-in details">
              <button type="button" onClick={() => onCreated(done.username, { openProfile: true })} style={btn('primary')}>Open their profile</button>
              <button type="button" onClick={() => onCreated(done.username, { openProfile: false })} style={btn('ghost')}>Back to staff</button>
            </CredentialsCard>
          </div>
        ) : (
          <>
            <StepHeading n="1" title="About them" />
            <div style={{ display: 'grid', gridTemplateColumns: threeCol, gap: 12 }}>
              <Field label="First name" required><input style={inputStyle()} value={person.first_name} onChange={setP('first_name')} autoFocus /></Field>
              <Field label="Middle name" required><input style={inputStyle()} value={person.middle_name} onChange={setP('middle_name')} /></Field>
              <Field label="Last name" required><input style={inputStyle()} value={person.last_name} onChange={setP('last_name')} /></Field>
            </div>
            <p style={{ ...hintStyle(), fontSize: 11.5 }}>Their username is made from these initials and can't be changed later.</p>
            <div style={{ display: 'grid', gridTemplateColumns: twoCol, gap: 12, marginTop: 12 }}>
              <Field label="Preferred name"><input style={inputStyle()} value={person.preferred_name} onChange={setP('preferred_name')} placeholder="What they go by" /></Field>
              <Field label="Position" required><input style={inputStyle()} value={person.position} onChange={setP('position')} placeholder="Speech therapist" /></Field>
              <Field label="Hire date"><input type="date" style={inputStyle()} value={person.hire_date} onChange={setP('hire_date')} /></Field>
              <Field label="Role" hint="Admins can manage staff accounts and approve time off.">
                <select style={inputStyle()} value={person.role} onChange={setP('role')}>
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                </select>
              </Field>
            </div>

            <StepHeading n="2" title="Are they a provider?" sub="Providers see patients and have their own column on the schedule." />
            {!initialProvider && <div role="radiogroup" aria-label="Are they a provider?" style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8 }}>
              {PROVIDER_CHOICES.map(c => {
                const on = providerChoice === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setProviderChoice(c.key)}
                    style={{
                      ...btn('secondary', { flex: c.key === 'no' ? '0 0 auto' : 1, justifyContent: 'flex-start', padding: '11px 14px', whiteSpace: 'normal', textAlign: 'left' }),
                      ...(on ? { background: BRAND.tint, borderColor: BRAND.forest, color: BRAND.brassText, boxShadow: `inset 0 0 0 1px ${BRAND.forest}` } : {}),
                    }}
                  >
                    <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${on ? BRAND.forest : '#C9C3D6'}`, background: on ? `radial-gradient(${BRAND.forest} 45%, transparent 50%)` : 'white', flexShrink: 0 }} />
                    {c.label}
                  </button>
                );
              })}
            </div>}

            {providerChoice === 'new' && (
              <div style={{ ...cardStyle({ padding: 16, marginTop: 12, background: '#FCFBFE' }) }}>
                <ScheduleNameLine name={scheduleName} clash={nameClash} />
                <div style={{ display: 'grid', gridTemplateColumns: twoCol, gap: 12, marginTop: 14 }}>
                  <Field label="Specialty"><input style={inputStyle()} value={prov.specialty} onChange={e => setProv(p => ({ ...p, specialty: e.target.value }))} placeholder="Speech-language pathology" /></Field>
                  <Field label="Credentials"><input style={inputStyle()} value={prov.credentials} onChange={e => setProv(p => ({ ...p, credentials: e.target.value }))} placeholder="MS, CCC-SLP" /></Field>
                </div>
                <div style={{ marginTop: 14 }}>
                  <p style={labelStyle()}>Usual weekly hours <span style={{ fontWeight: 400, color: BRAND.muted }}>(optional, you can set these later)</span></p>
                  <WeeklyHoursPicker value={hours} onChange={setHours} />
                </div>
              </div>
            )}

            {providerChoice === 'existing' && (
              <div style={{ ...cardStyle({ padding: 16, marginTop: 12, background: '#FCFBFE' }) }}>
                <p style={{ margin: 0, fontSize: 13.5, color: BODY }}>
                  This account will be linked to the provider <strong style={{ color: INK }}>{existingProvider}</strong>
                  {initialProvider?.specialty ? <span style={{ color: BRAND.muted }}> &middot; {initialProvider.specialty}</span> : null}.
                </p>
                {existingProvider && (
                  <div style={{ marginTop: 12 }}>
                    <ScheduleNameLine name={scheduleName} clash={nameClash} />
                    {renamingExisting && !nameClash && (
                      <p style={{ fontSize: 12.5, color: '#93370D', background: '#FFFAEB', borderRadius: 8, padding: '8px 10px', margin: '8px 0 0' }}>
                        {existingProvider} will be renamed to {scheduleName} on the schedule and on every appointment, past and future.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <StepHeading n="3" title="Temporary password" sub="They'll replace it the first time they sign in." />
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={inputStyle({ fontFamily: 'ui-monospace, Menlo, monospace' })} value={tempPassword} onChange={e => setTempPassword(e.target.value)} aria-label="Temporary password" />
              <button type="button" onClick={() => setTempPassword(generateTempPassword())} style={btn('secondary')}>New one</button>
            </div>

            {error && <p role="alert" style={{ color: DANGER, fontSize: 13, margin: '14px 0 0' }}>{error}</p>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 22, paddingTop: 16, borderTop: `1px solid ${HAIRLINE}` }}>
              <button type="button" onClick={onClose} style={btn('secondary')}>Cancel</button>
              <button type="button" onClick={requestCreate} style={btn('primary')}>
                {providerChoice === 'new' ? 'Create account and provider' : 'Create account'}
              </button>
            </div>
          </>
        )}
      </div>

      {confirming && (
        <PasswordConfirmModal
          expectedUsername={currentUser?.username}
          actionLabel={providerChoice === 'new' ? 'Confirm your identity to create this account and provider.' : 'Confirm your identity to create this account.'}
          onConfirm={performCreate}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
