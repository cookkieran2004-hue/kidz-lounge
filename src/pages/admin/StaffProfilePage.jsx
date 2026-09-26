import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../AuthContext';
import { Avatar } from '../../Avatar';
import { useIsMobile } from '../../useIsMobile';
import { usePendingTimeOff } from '../../PendingTimeOffContext';
import TaskDetailModal from '../../TaskDetailModal';
import { PasswordConfirmModal, UsualScheduleEditor, ScheduleChangesEditor, TimeOffBalanceEditor, generateTempPassword } from '../ManageDataPage';
import { TimeOffManageTab, calculateTenure } from '../StaffPage';
import { CredentialsCard } from './NewStaffModal';
import { roomDisplayText, DateField } from '../SchedulePage';
import {
  BRAND, BRAND_SERIF, INK, BODY, HAIRLINE, PAGE_BG, DANGER, DANGER_BG, FONT,
  cardStyle, btn, inputStyle, labelStyle, pill, hintStyle, sectionTitleStyle,
  displayName, legalName, formatLongDate, dateOnly, staffSavePayload, scheduleNameFor,
} from './adminUi';

const SECTIONS = [
  { key: 'account', label: 'Account and role' },
  { key: 'provider', label: 'Linked provider' },
  { key: 'schedule', label: 'Weekly schedule' },
  { key: 'time-off', label: 'Time off' },
  { key: 'caseload', label: 'Caseload' },
  { key: 'tasks', label: 'Tasks' },
];

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------
function SectionCard({ title, hint, actions, children }) {
  return (
    <section style={cardStyle({ padding: '20px 22px' })}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <h2 style={sectionTitleStyle()}>{title}</h2>
          {hint && <p style={hintStyle()}>{hint}</p>}
        </div>
        {actions && <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>{actions}</div>}
      </div>
      {children}
    </section>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: 12, color: BRAND.muted }}>{label}</p>
      <p style={{ margin: '2px 0 0', fontSize: 14, color: value ? INK : '#A8A2B5' }}>{value || 'Not set'}</p>
    </div>
  );
}

function EmptyState({ title, body, action }) {
  return (
    <div style={{ padding: '22px 16px', textAlign: 'center', background: PAGE_BG, borderRadius: 10 }}>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: INK }}>{title}</p>
      {body && <p style={{ margin: '6px auto 0', fontSize: 13, color: BRAND.muted, maxWidth: 380 }}>{body}</p>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

function Notice({ kind = 'success', children }) {
  const ok = kind === 'success';
  return (
    <p role="status" style={{ fontSize: 13, margin: '0 0 14px', padding: '9px 12px', borderRadius: 8, background: ok ? '#ECFDF3' : DANGER_BG, color: ok ? '#067647' : DANGER }}>
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Account and role
// ---------------------------------------------------------------------------
function AccountSection({ staff, providers, isSelf, isMobile, onSaved }) {
  const { user: currentUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [resetPw, setResetPw] = useState(null);       // temp password being prepared
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [pending, setPending] = useState(null);       // 'save' | 'reset' | 'archive'
  const [issued, setIssued] = useState(null);         // { username, tempPassword }
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  const startEdit = () => {
    setForm({
      first_name: staff.first_name || '', middle_name: staff.middle_name || '', last_name: staff.last_name || '',
      preferred_name: staff.preferred_name || '', position: staff.position || '', hire_date: dateOnly(staff.hire_date), role: staff.role,
    });
    setEditing(true); setNotice(null); setError(null);
  };
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  // Would this edit give their provider a name another provider already has?
  const newScheduleName = form ? scheduleNameFor(form) : '';
  const renames = !!(staff.provider_name && newScheduleName && newScheduleName !== staff.provider_name);
  const clashes = renames && providers.some(p => p.Name === newScheduleName);

  const requestSave = () => {
    if (!form.first_name.trim() || !form.last_name.trim() || !form.position.trim()) {
      setError('First name, last name, and position can\'t be empty.');
      return;
    }
    if (clashes) {
      setError(`Another provider is already named ${newScheduleName}. Use a different preferred name so the two can be told apart on the schedule.`);
      return;
    }
    setError(null); setPending('save');
  };

  const perform = async (adminPassword) => {
    if (pending === 'save') {
      await api.updateStaff(staff.id, staffSavePayload(staff, form, adminPassword));
      setEditing(false); setNotice('Account saved');
    } else if (pending === 'reset') {
      const updated = await api.updateStaff(staff.id, { ...staffSavePayload(staff, {}, adminPassword), reset_temporary_password: resetPw });
      setIssued({ username: updated?.username || staff.username, tempPassword: resetPw });
      setResetPw(null);
    } else if (pending === 'archive') {
      await api.updateStaff(staff.id, { archived: !staff.archived, admin_password: adminPassword });
      setConfirmArchive(false);
      setNotice(staff.archived ? 'Account restored. They can sign in again.' : 'Account archived. They can no longer sign in.');
    }
    setPending(null);
    onSaved();
  };

  const col = isMobile ? '1fr' : '1fr 1fr';

  return (
    <SectionCard
      title="Account and role"
      actions={!editing && <button type="button" onClick={startEdit} style={btn('secondary')}>Edit</button>}
    >
      {notice && <Notice>{notice}</Notice>}
      {issued && (
        <div style={{ marginBottom: 16 }}>
          <CredentialsCard username={issued.username} tempPassword={issued.tempPassword} personName={staff.preferred_name || staff.first_name} title="Password reset">
            <button type="button" onClick={() => setIssued(null)} style={btn('ghost')}>Done</button>
          </CredentialsCard>
        </div>
      )}

      {!editing ? (
        <div style={{ display: 'grid', gridTemplateColumns: col, gap: '14px 24px' }}>
          <Detail label="Legal name" value={legalName(staff)} />
          <Detail label="Preferred name" value={staff.preferred_name} />
          <Detail label="Position" value={staff.position} />
          <Detail label="Hire date" value={formatLongDate(staff.hire_date)} />
          <Detail label="Role" value={staff.role === 'admin' ? 'Admin' : 'Staff'} />
          <div>
            <p style={{ margin: 0, fontSize: 12, color: BRAND.muted }}>Username</p>
            <p style={{ margin: '2px 0 0', fontSize: 14, color: INK, fontFamily: 'ui-monospace, Menlo, monospace' }}>{staff.username}</p>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 12 }}>
            <label style={{ display: 'block' }}><span style={labelStyle()}>First name</span><input style={inputStyle()} value={form.first_name} onChange={set('first_name')} /></label>
            <label style={{ display: 'block' }}><span style={labelStyle()}>Middle name</span><input style={inputStyle()} value={form.middle_name} onChange={set('middle_name')} /></label>
            <label style={{ display: 'block' }}><span style={labelStyle()}>Last name</span><input style={inputStyle()} value={form.last_name} onChange={set('last_name')} /></label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: col, gap: 12, marginTop: 12 }}>
            <label style={{ display: 'block' }}><span style={labelStyle()}>Preferred name</span><input style={inputStyle()} value={form.preferred_name} onChange={set('preferred_name')} placeholder="Leave empty to use their first name" /></label>
            <label style={{ display: 'block' }}><span style={labelStyle()}>Position</span><input style={inputStyle()} value={form.position} onChange={set('position')} /></label>
            <div><label htmlFor="kl-profile-hire-date" style={labelStyle()}>Hire date</label><DateField id="kl-profile-hire-date" yearNav clearable style={inputStyle()} value={form.hire_date || ''} onChange={v => setForm(f => ({ ...f, hire_date: v }))} /></div>
            <div>
              <label style={{ display: 'block' }}>
                <span style={labelStyle()}>Role</span>
                <select style={inputStyle()} value={form.role} onChange={set('role')} disabled={isSelf}>
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              {isSelf && <p style={{ ...hintStyle(), fontSize: 11.5 }}>You can't change your own role.</p>}
            </div>
          </div>
          {renames && (
            <p style={{ fontSize: 12.5, color: clashes ? DANGER : '#93370D', background: clashes ? DANGER_BG : '#FFFAEB', borderRadius: 8, padding: '9px 12px', margin: '14px 0 0' }}>
              {clashes
                ? <>Another provider is already named <strong>{newScheduleName}</strong>. Use a different preferred name so the two can be told apart on the schedule.</>
                : <>Saving renames their provider from {staff.provider_name} to <strong>{newScheduleName}</strong> on the schedule and on every appointment, past and future.</>}
            </p>
          )}
          {error && <p role="alert" style={{ color: DANGER, fontSize: 13, margin: '12px 0 0' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" onClick={() => { setEditing(false); setError(null); }} style={btn('secondary')}>Cancel</button>
            <button type="button" onClick={requestSave} style={btn('primary')}>Save changes</button>
          </div>
        </div>
      )}

      {!editing && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${HAIRLINE}` }}>
          {resetPw !== null ? (
            <div>
              <p style={labelStyle()}>New temporary password</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input style={inputStyle({ fontFamily: 'ui-monospace, Menlo, monospace', flex: 1, minWidth: 180 })} value={resetPw} onChange={e => setResetPw(e.target.value)} aria-label="New temporary password" />
                <button type="button" onClick={() => setResetPw(generateTempPassword())} style={btn('secondary')}>New one</button>
              </div>
              <p style={hintStyle()}>They'll have to choose their own password again the next time they sign in.</p>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button type="button" onClick={() => setResetPw(null)} style={btn('secondary')}>Cancel</button>
                <button type="button" disabled={!resetPw.trim()} onClick={() => setPending('reset')} style={btn('primary')}>Reset password</button>
              </div>
            </div>
          ) : confirmArchive ? (
            <div style={{ padding: 14, borderRadius: 10, background: staff.archived ? '#ECFDF3' : DANGER_BG }}>
              <p style={{ margin: '0 0 10px', fontSize: 13.5, color: staff.archived ? '#067647' : DANGER }}>
                {staff.archived
                  ? 'Restore this account? They\'ll be able to sign in again.'
                  : 'Archive this account? They won\'t be able to sign in. Their history stays, and you can restore them later.'}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => setConfirmArchive(false)} style={btn('secondary')}>Cancel</button>
                <button type="button" onClick={() => setPending('archive')} style={btn(staff.archived ? 'primary' : 'danger')}>
                  {staff.archived ? 'Restore account' : 'Archive account'}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => { setResetPw(generateTempPassword()); setNotice(null); }} style={btn('secondary')}>Reset password</button>
              {!isSelf && (
                <button type="button" onClick={() => { setConfirmArchive(true); setNotice(null); }} style={btn(staff.archived ? 'secondary' : 'danger')}>
                  {staff.archived ? 'Restore account' : 'Archive account'}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {pending && (
        <PasswordConfirmModal
          expectedUsername={currentUser?.username}
          actionLabel={{
            save: 'Confirm your identity to save these changes.',
            reset: `Confirm your identity to reset ${displayName(staff)}'s password.`,
            archive: `Confirm your identity to ${staff.archived ? 'restore' : 'archive'} this account.`,
          }[pending]}
          onConfirm={perform}
          onCancel={() => setPending(null)}
        />
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Linked provider
// A provider belongs to exactly one account, permanently, and is always
// named after that person (the backend renames it whenever the account is
// saved). So this section only: shows it, edits specialty/credentials,
// fixes an old name that doesn't match yet, and -- for someone with no
// provider -- creates one or links a provider that has no account.
// ---------------------------------------------------------------------------
function ProviderSection({ staff, providers, allStaff, isMobile, onChanged }) {
  const { user: currentUser } = useAuth();
  const provider = providers.find(p => p.Name === staff.provider_name) || null;
  const want = scheduleNameFor(staff);
  const [mode, setMode] = useState(null); // 'details' | 'link' | 'create'
  const [details, setDetails] = useState({ specialty: '', credentials: '' });
  const [linkTo, setLinkTo] = useState('');
  const [newProv, setNewProv] = useState({ specialty: '', credentials: '' });
  const [pending, setPending] = useState(null); // { kind: 'link' | 'sync', providerName }
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  const linkedNames = new Set(allStaff.filter(s => s.provider_name).map(s => s.provider_name));
  const linkable = providers.filter(p => !p.archived && !linkedNames.has(p.Name));
  const nameTakenByOther = (name) => providers.some(p => p.Name === name && p.Name !== staff.provider_name && p.Name !== linkTo);

  const saveDetails = async () => {
    setSaving(true); setError(null);
    try {
      await api.updateProvider(provider.id, { specialty: details.specialty.trim(), credentials: details.credentials.trim() });
      setMode(null); setNotice('Provider details saved');
      onChanged();
    } catch (err) { setError(err.message); }
    setSaving(false);
  };

  const create = async () => {
    if (!want) { setError('Add a first and last name in Account and role first.'); return; }
    if (nameTakenByOther(want)) { setError(`Another provider is already named ${want}. Give ${staff.first_name} a preferred name in Account and role first.`); return; }
    setSaving(true); setError(null);
    try {
      const created = await api.createProvider({
        first_name: (staff.preferred_name || staff.first_name).trim(), last_name: staff.last_name.trim(),
        specialty: newProv.specialty.trim() || undefined, credentials: newProv.credentials.trim() || undefined,
      });
      setPending({ kind: 'link', providerName: created?.Name || want }); // linking still needs the admin password
    } catch (err) { setError(err.message); }
    setSaving(false);
  };

  const perform = async (adminPassword) => {
    // Saving the account (with the link) is what renames the provider to
    // match -- the backend does it in the same transaction.
    const providerName = pending.kind === 'link' ? pending.providerName : staff.provider_name;
    const saved = await api.updateStaff(staff.id, staffSavePayload(staff, { provider_name: providerName }, adminPassword));
    setNotice(pending.kind === 'sync' ? `Renamed to ${saved?.provider_name || want} on the schedule` : `Linked. On the schedule as ${saved?.provider_name || want}`);
    setPending(null); setMode(null);
    onChanged();
  };

  const twoCol = isMobile ? '1fr' : '1fr 1fr';

  return (
    <SectionCard
      title="Linked provider"
      hint="Their provider is how they appear on the schedule. It's always named after them and stays with this account."
    >
      {notice && <Notice>{notice}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}

      {provider && mode === null && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, borderRadius: 10, background: PAGE_BG }}>
            <Avatar name={provider.Name} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontFamily: BRAND_SERIF, fontSize: 17, fontWeight: 700, color: INK }}>{provider.Name}</p>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: BRAND.muted }}>
                {[provider.specialty, provider.credentials].filter(Boolean).join(' · ') || 'No specialty or credentials on file'}
              </p>
            </div>
          </div>

          {want && want !== provider.Name && (
            <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 10, background: '#FFFAEB' }}>
              <p style={{ margin: 0, fontSize: 13.5, color: '#93370D' }}>
                This name doesn't match {displayName(staff)} yet. It should be <strong>{want}</strong>.
              </p>
              <p style={{ margin: '4px 0 10px', fontSize: 12.5, color: '#93370D' }}>Updating renames the provider on the schedule and on every appointment, past and future.</p>
              <button type="button" onClick={() => { setNotice(null); setError(null); setPending({ kind: 'sync' }); }} style={btn('secondary')}>Update to {want}</button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => { setDetails({ specialty: provider.specialty || '', credentials: provider.credentials || '' }); setMode('details'); setNotice(null); }} style={btn('secondary')}>Edit specialty and credentials</button>
          </div>
          <p style={{ ...hintStyle(), marginTop: 10 }}>To change the name, edit their name or preferred name in Account and role.</p>
        </>
      )}

      {staff.provider_name && !provider && mode === null && (
        <Notice kind="error">This account is linked to "{staff.provider_name}", but no provider with that name exists anymore. Create or link one below.</Notice>
      )}

      {!provider && mode === null && (
        <EmptyState
          title={staff.provider_name ? 'Fix the provider link' : 'Not a provider'}
          body={`If ${staff.preferred_name || staff.first_name || 'this person'} sees patients, give them a provider so they appear on the schedule. They'll appear as ${want || 'their name'}.`}
          action={
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => { setNewProv({ specialty: '', credentials: '' }); setError(null); setMode('create'); }} style={btn('primary')}>Make them a provider</button>
              {linkable.length > 0 && <button type="button" onClick={() => { setLinkTo(''); setError(null); setMode('link'); }} style={btn('secondary')}>Link a provider without an account</button>}
            </div>
          }
        />
      )}

      {mode === 'details' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: twoCol, gap: 12 }}>
            <label style={{ display: 'block' }}><span style={labelStyle()}>Specialty</span><input style={inputStyle()} value={details.specialty} onChange={e => setDetails(d => ({ ...d, specialty: e.target.value }))} placeholder="Speech-language pathology" /></label>
            <label style={{ display: 'block' }}><span style={labelStyle()}>Credentials</span><input style={inputStyle()} value={details.credentials} onChange={e => setDetails(d => ({ ...d, credentials: e.target.value }))} placeholder="MS, CCC-SLP" /></label>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
            <button type="button" onClick={() => setMode(null)} style={btn('secondary')}>Cancel</button>
            <button type="button" onClick={saveDetails} disabled={saving} style={btn('primary')}>{saving ? 'Saving...' : 'Save details'}</button>
          </div>
        </div>
      )}

      {mode === 'link' && (
        <div>
          <label style={labelStyle()} htmlFor="kl-link-provider">Provider</label>
          <select id="kl-link-provider" style={inputStyle()} value={linkTo} onChange={e => setLinkTo(e.target.value)}>
            <option value="">Choose a provider</option>
            {linkable.map(p => <option key={p.id} value={p.Name}>{p.Name}{p.specialty ? ` · ${p.specialty}` : ''}</option>)}
          </select>
          <p style={hintStyle()}>Only providers without an account are listed. The link is permanent.</p>
          {linkTo && want && linkTo !== want && (
            <p style={{ fontSize: 12.5, color: nameTakenByOther(want) ? DANGER : '#93370D', background: nameTakenByOther(want) ? DANGER_BG : '#FFFAEB', borderRadius: 8, padding: '8px 10px', margin: '10px 0 0' }}>
              {nameTakenByOther(want)
                ? `Another provider is already named ${want}. Give ${staff.first_name} a preferred name in Account and role first.`
                : `${linkTo} will be renamed to ${want} on the schedule and on every appointment, past and future.`}
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
            <button type="button" onClick={() => setMode(null)} style={btn('secondary')}>Cancel</button>
            <button type="button" disabled={!linkTo || (linkTo !== want && nameTakenByOther(want))} onClick={() => setPending({ kind: 'link', providerName: linkTo })} style={btn('primary')}>Link provider</button>
          </div>
        </div>
      )}

      {mode === 'create' && (
        <div>
          <p style={{ margin: '0 0 12px', fontSize: 13.5, color: BODY }}>
            On the schedule as <strong style={{ fontFamily: BRAND_SERIF, fontSize: 15, color: INK }}>{want}</strong>
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: twoCol, gap: 12 }}>
            <label style={{ display: 'block' }}><span style={labelStyle()}>Specialty</span><input style={inputStyle()} value={newProv.specialty} onChange={e => setNewProv(p => ({ ...p, specialty: e.target.value }))} placeholder="Speech-language pathology" /></label>
            <label style={{ display: 'block' }}><span style={labelStyle()}>Credentials</span><input style={inputStyle()} value={newProv.credentials} onChange={e => setNewProv(p => ({ ...p, credentials: e.target.value }))} placeholder="MS, CCC-SLP" /></label>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
            <button type="button" onClick={() => setMode(null)} style={btn('secondary')}>Cancel</button>
            <button type="button" onClick={create} disabled={saving} style={btn('primary')}>{saving ? 'Creating...' : 'Create provider'}</button>
          </div>
        </div>
      )}

      {pending && (
        <PasswordConfirmModal
          expectedUsername={currentUser?.username}
          actionLabel={pending.kind === 'sync' ? `Confirm your identity to rename this provider to ${want}.` : `Confirm your identity to link this account to its provider.`}
          onConfirm={perform}
          onCancel={() => { setPending(null); if (mode === 'create') { setMode(null); onChanged(); } }}
        />
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Weekly schedule
// ---------------------------------------------------------------------------
function ScheduleSection({ staff, providerExists, goTo }) {
  return (
    <SectionCard title="Weekly schedule" hint={providerExists ? `Contracted hours for ${staff.provider_name}. Unchecked days mean they aren't contracted that day, and the schedule shades any time outside these hours.` : undefined}>
      {providerExists ? (
        <>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: INK, margin: '0 0 2px' }}>Standing hours</h3>
          <p style={{ fontSize: 12, color: BRAND.muted, margin: '0 0 10px' }}>Used on any date a scheduled change below doesn't cover.</p>
          <UsualScheduleEditor key={staff.provider_name} providerName={staff.provider_name} embedded />
          <h3 style={{ fontSize: 14, fontWeight: 700, color: INK, margin: '24px 0 2px' }}>Scheduled changes</h3>
          <p style={{ fontSize: 12, color: BRAND.muted, margin: '0 0 10px' }}>
            New hours from a start date, permanent or temporary (with an end date). If changes overlap, the one that started most recently applies.
          </p>
          <ScheduleChangesEditor key={`changes:${staff.provider_name}`} providerName={staff.provider_name} />
        </>
      ) : (
        <EmptyState
          title="No provider linked"
          body="Weekly hours belong to a provider record. Link or create one first."
          action={<button type="button" onClick={() => goTo('provider')} style={btn('secondary')}>Go to Linked provider</button>}
        />
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Time off
// ---------------------------------------------------------------------------
function TimeOffSection({ staff, isMobile, onChanged }) {
  // Bumped after time off is added here, so the balances above re-load
  // and show the hours that just came off.
  const [balanceVersion, setBalanceVersion] = useState(0);
  return (
    <SectionCard title="Time off" hint="Balances, and every request. Use Adjust to correct a balance directly, for example to give someone their real starting balance.">
      <TimeOffBalanceEditor key={`${staff.username}:${balanceVersion}`} username={staff.username} embedded />
      <div style={{ marginTop: 22 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: INK, margin: '0 0 8px' }}>Time off and requests</h3>
        <TimeOffManageTab isMobile={isMobile} embedded forUsername={staff.username} onChanged={onChanged} onAdded={() => setBalanceVersion(v => v + 1)} />
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Caseload (next two weeks of appointments)
// ---------------------------------------------------------------------------
function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function formatTime(t) {
  const [h, m] = t.slice(0, 5).split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function CaseloadSection({ staff, providerExists, goTo }) {
  const [appts, setAppts] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!providerExists) return;
    let alive = true;
    const start = new Date();
    const end = new Date(); end.setDate(end.getDate() + 13);
    api.getAppointmentsRange(staff.provider_name, isoDate(start), isoDate(end))
      .then(rows => { if (alive) setAppts((rows || []).filter(a => a.appointment_status !== 'Canceled')); })
      .catch(err => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [staff.provider_name, providerExists]);

  const byDay = useMemo(() => {
    const g = {};
    (appts || []).forEach(a => { (g[a.appointment_date] ||= []).push(a); });
    Object.values(g).forEach(list => list.sort((a, b) => a.appointment_time.localeCompare(b.appointment_time)));
    return Object.entries(g).sort(([a], [b]) => a.localeCompare(b));
  }, [appts]);

  const patientCount = useMemo(() => new Set((appts || []).map(a => a.patient_name).filter(Boolean)).size, [appts]);

  if (!providerExists) {
    return (
      <SectionCard title="Caseload">
        <EmptyState title="No provider linked" body="Appointments are booked under a provider. Link one to see this person's caseload." action={<button type="button" onClick={() => goTo('provider')} style={btn('secondary')}>Go to Linked provider</button>} />
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Caseload" hint="Appointments for the next two weeks, canceled ones left out.">
      {error && <Notice kind="error">The caseload couldn't be loaded ({error}).</Notice>}
      {!appts && !error && <p style={{ fontSize: 13.5, color: BRAND.muted }}>Loading...</p>}
      {appts && (
        <>
          <div style={{ display: 'flex', gap: 28, marginBottom: 18 }}>
            <div><p style={{ margin: 0, fontFamily: BRAND_SERIF, fontSize: 26, fontWeight: 700, color: INK }}>{appts.length}</p><p style={{ margin: 0, fontSize: 12.5, color: BRAND.muted }}>appointments</p></div>
            <div><p style={{ margin: 0, fontFamily: BRAND_SERIF, fontSize: 26, fontWeight: 700, color: INK }}>{patientCount}</p><p style={{ margin: 0, fontSize: 12.5, color: BRAND.muted }}>patients</p></div>
          </div>
          {byDay.length === 0 && <EmptyState title="Nothing booked in the next two weeks" />}
          {byDay.map(([date, list]) => (
            <div key={date} style={{ marginBottom: 14 }}>
              <p style={{ margin: '0 0 6px', fontSize: 12.5, fontWeight: 700, color: BRAND.brassText }}>
                {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </p>
              <div style={{ border: `1px solid ${HAIRLINE}`, borderRadius: 10, overflow: 'hidden' }}>
                {list.map((a, i) => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '9px 12px', borderTop: i ? `1px solid ${HAIRLINE}` : 'none', fontSize: 13.5 }}>
                    <span style={{ width: 70, color: BODY, fontWeight: 600, flexShrink: 0 }}>{formatTime(a.appointment_time)}</span>
                    {a.patient_name
                      ? <Link to={`/patients/${encodeURIComponent(a.patient_name)}`} style={{ flex: 1, color: INK, textDecoration: 'none', fontWeight: 500 }}>{a.patient_name}</Link>
                      : <span style={{ flex: 1, color: BRAND.muted }}>No patient</span>}
                    <span style={{ fontSize: 12.5, color: BRAND.muted }}>{a.treatment_area ? roomDisplayText(a.treatment_area) : 'No room'}</span>
                    <span style={pill('neutral')}>{a.appointment_status}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
function TasksSection({ staff }) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState(null);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [adding, setAdding] = useState(false);
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    try {
      const board = await api.getTaskBoard();
      setTasks((board || []).filter(t => t.assigned_to === staff.username));
    } catch (err) { setError(err.message); }
  }, [staff.username]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!title.trim()) return;
    setAdding(true);
    try {
      await api.createTask({ title: title.trim(), due_date: due || undefined, assigned_to: staff.username });
      setTitle(''); setDue('');
      await load();
    } catch (err) { setError(err.message); }
    setAdding(false);
  };

  const toggleDone = async (task) => {
    await api.updateTask(task.id, { status: task.status === 'done' ? 'open' : 'done' });
    await load();
  };

  const today = isoDate(new Date());
  const open = (tasks || []).filter(t => t.status !== 'done').sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
  const doneRecently = (tasks || []).filter(t => t.status === 'done').slice(0, 5);

  const renderRow = (t, i) => {
    const overdue = t.status !== 'done' && t.due_date && dateOnly(t.due_date) < today;
    return (
      <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderTop: i ? `1px solid ${HAIRLINE}` : 'none' }}>
        <input type="checkbox" checked={t.status === 'done'} onChange={() => toggleDone(t)} aria-label={`Mark "${t.title}" ${t.status === 'done' ? 'not done' : 'done'}`} style={{ width: 16, height: 16, cursor: 'pointer' }} />
        <button type="button" onClick={() => setDetail(t)} style={{ flex: 1, textAlign: 'left', border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, color: t.status === 'done' ? BRAND.muted : INK, textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>
          {t.title}
        </button>
        {t.due_date && (
          <span style={{ fontSize: 12, fontWeight: 600, color: overdue ? DANGER : BRAND.muted, whiteSpace: 'nowrap' }}>
            {overdue ? 'Overdue · ' : 'Due '}{formatLongDate(t.due_date)}
          </span>
        )}
      </div>
    );
  };

  return (
    <SectionCard title="Tasks" hint={`Tasks assigned to ${displayName(staff)}.`}>
      {error && <Notice kind="error">{error}</Notice>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <input style={inputStyle({ flex: 1, minWidth: 200 })} value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }} placeholder={`Assign a task to ${staff.preferred_name || staff.first_name || staff.username}`} aria-label="New task title" />
        <DateField floating clearable placeholder="Due date" style={inputStyle({ width: 'auto' })} value={due} onChange={setDue} ariaLabel="Due date (optional)" />
        <button type="button" onClick={add} disabled={adding || !title.trim()} style={btn('primary')}>{adding ? 'Adding...' : 'Assign'}</button>
      </div>
      {!tasks && !error && <p style={{ fontSize: 13.5, color: BRAND.muted }}>Loading...</p>}
      {tasks && open.length === 0 && <EmptyState title="No open tasks" body="Anything you assign above shows up here and on their task list." />}
      {open.length > 0 && <div style={{ border: `1px solid ${HAIRLINE}`, borderRadius: 10, overflow: 'hidden' }}>{open.map(renderRow)}</div>}
      {doneRecently.length > 0 && (
        <>
          <p style={{ fontSize: 12.5, fontWeight: 700, color: BRAND.muted, margin: '18px 0 6px' }}>Recently completed</p>
          <div style={{ border: `1px solid ${HAIRLINE}`, borderRadius: 10, overflow: 'hidden' }}>{doneRecently.map(renderRow)}</div>
        </>
      )}
      {detail && (
        <TaskDetailModal
          task={detail}
          currentUser={user}
          onClose={() => setDetail(null)}
          onToggleDone={async (t) => { await toggleDone(t); setDetail(null); }}
          onTaskChanged={() => load()}
        />
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------
export default function StaffProfilePage() {
  const { username } = useParams();
  const { user } = useAuth();
  const isMobile = useIsMobile(768);
  const { refreshPending } = usePendingTimeOff();
  const [searchParams, setSearchParams] = useSearchParams();
  const section = SECTIONS.some(s => s.key === searchParams.get('section')) ? searchParams.get('section') : 'account';
  const goTo = (key) => setSearchParams(key === 'account' ? {} : { section: key }, { replace: true });

  const [allStaff, setAllStaff] = useState(null);
  const [providers, setProviders] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [s, p, pending] = await Promise.all([api.getStaff(), api.getProviders(true), api.getAllTimeOffRequests('pending').catch(() => [])]);
      setAllStaff(s); setProviders(p);
      setPendingCount(pending.filter(r => r.username === username).length);
    } catch (err) { setError(err.message); }
  }, [username]);
  useEffect(() => { load(); }, [load]);

  // Approving/denying here updates this page's badge and the nav badge.
  const onTimeOffChanged = useCallback(() => {
    refreshPending();
    api.getAllTimeOffRequests('pending').then(p => setPendingCount(p.filter(r => r.username === username).length)).catch(() => {});
  }, [refreshPending, username]);

  const back = (
    <Link to="/admin" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: BRAND.brassText, textDecoration: 'none' }}>
      <span aria-hidden="true">&larr;</span> All staff
    </Link>
  );

  if (error) return <div style={{ padding: 28, fontFamily: FONT }}>{back}<p role="alert" style={{ color: DANGER, fontSize: 14 }}>This profile couldn't be loaded ({error}). Refresh the page to try again.</p></div>;
  if (!allStaff) return <div style={{ padding: 28, fontFamily: FONT, color: BRAND.muted, fontSize: 14 }}>Loading...</div>;

  const staff = allStaff.find(s => s.username === username);
  if (!staff) {
    return (
      <div style={{ padding: 28, fontFamily: FONT }}>
        {back}
        <p style={{ fontSize: 15, color: INK, marginTop: 20 }}>There's no staff account with the username "{username}".</p>
      </div>
    );
  }

  const providerExists = !!staff.provider_name && providers.some(p => p.Name === staff.provider_name);
  const tenure = calculateTenure(staff.hire_date);
  const subtitle = [staff.position, staff.role === 'admin' ? 'Admin' : 'Staff', tenure && `With us for ${tenure}`].filter(Boolean).join(' · ');

  const nav = SECTIONS.map(s => {
    const active = s.key === section;
    const badge = s.key === 'time-off' ? pendingCount : 0;
    return (
      <button
        key={s.key}
        type="button"
        onClick={() => goTo(s.key)}
        aria-current={active ? 'page' : undefined}
        className="kl-profile-nav"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          padding: isMobile ? '8px 12px' : '9px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
          fontFamily: 'inherit', fontSize: 13.5, textAlign: 'left', whiteSpace: 'nowrap',
          fontWeight: active ? 700 : 500, color: active ? BRAND.brassText : BODY,
          background: active ? BRAND.tint : 'transparent',
        }}
      >
        {s.label}
        {badge > 0 && <span style={pill('alert')}>{badge}</span>}
      </button>
    );
  });

  return (
    <div style={{ fontFamily: FONT, background: PAGE_BG, minHeight: 'calc(100vh - 52px)' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: isMobile ? '14px 14px 40px' : '22px 28px 56px' }}>
        {back}

        <header style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 14 : 18, margin: '14px 0 22px' }}>
          <Avatar name={displayName(staff)} size={isMobile ? 52 : 64} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ fontFamily: BRAND_SERIF, fontSize: isMobile ? 23 : 30, fontWeight: 700, color: INK, margin: 0, lineHeight: 1.15 }}>{displayName(staff)}</h1>
              {staff.archived && <span style={pill('neutral')}>Archived</span>}
              {!staff.archived && staff.must_reset_password && <span style={pill('warn')}>Hasn't signed in yet</span>}
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 13.5, color: BRAND.muted }}>{subtitle}</p>
          </div>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : '210px minmax(0,1fr)', gap: isMobile ? 12 : 24, alignItems: 'start' }}>
          <nav aria-label="Profile sections" style={isMobile
            ? { display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 4, margin: '0 -14px', padding: '0 14px 4px' }
            : { display: 'flex', flexDirection: 'column', gap: 2, position: 'sticky', top: 16 }}
          >
            {nav}
          </nav>

          <div style={{ minWidth: 0 }}>
            {section === 'account' && <AccountSection staff={staff} providers={providers} isSelf={staff.username === user?.username} isMobile={isMobile} onSaved={load} />}
            {section === 'provider' && <ProviderSection staff={staff} providers={providers} allStaff={allStaff} isMobile={isMobile} onChanged={load} />}
            {section === 'schedule' && <ScheduleSection staff={staff} providerExists={providerExists} goTo={goTo} />}
            {section === 'time-off' && <TimeOffSection staff={staff} isMobile={isMobile} onChanged={onTimeOffChanged} />}
            {section === 'caseload' && <CaseloadSection staff={staff} providerExists={providerExists} goTo={goTo} />}
            {section === 'tasks' && <TasksSection staff={staff} />}
          </div>
        </div>
      </div>
    </div>
  );
}
