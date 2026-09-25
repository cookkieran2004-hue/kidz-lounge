import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { CalendarIcon, UserIcon, dateToInputValue } from './SchedulePage';
import { useSearchParams } from 'react-router-dom';
import { MeetingAgendaEditor } from '../MeetingAgenda';
import { useStaffDirectory, staffName } from '../staffDirectory';
import { useAuth } from '../AuthContext';
import { Avatar } from '../Avatar';

// Building blocks for the pages under the username menu (My profile,
// My time, ADMIN). This file used to be the single "/me" page; the pages
// themselves now live in MyProfilePage.jsx, MyTimePage.jsx and AdminPage.jsx.

// Same lightweight inline-SVG pattern already used throughout the app
// (see SchedulePage.jsx's Icon/ChevronLeft/etc) -- kept local here since
// nothing else needs to share these.
function MiniIcon({ path, size = 14, color = 'currentColor', strokeWidth = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {path}
    </svg>
  );
}
const BriefcaseIcon = (p) => <MiniIcon {...p} path={<><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></>} />;
const BeachIcon = (p) => <MiniIcon {...p} path={<><path d="M2 22c8-2 12-2 20 0" /><path d="M12 12 3 21" /><path d="M12 12c3-6 8-8 12-6-1 5-4 9-9 10" /><path d="M12 12c-1-4 0-8 3-10" /></>} />;
const FirstAidIcon = (p) => <MiniIcon {...p} path={<><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" /><line x1="12" y1="11" x2="12" y2="16" /><line x1="9.5" y1="13.5" x2="14.5" y2="13.5" /></>} />;

// Same "Practice Ledger" visual language as the Patient Chart -- a serif
// for headers, a violet palette -- so this reads as part of the same
// product rather than a bolted-on new page.
export const BRAND = { forest: '#6D28D9', brass: '#7C3AED', brassText: '#5B21B6', tint: '#F5F3FF', muted: '#6B6280', box: '#D6CCEF' };
export const BRAND_SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
const BORDER = '#e2e4e9';

const BALANCE_TYPES = ['PTO', 'UPTO'];
const BALANCE_NEUTRAL_TYPES = ['Lunch', 'Meeting', 'Unavailable', 'Other'];
const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function formatDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${m}/${day}/${y}`;
}
function daysUntil(dateStr) {
  const target = new Date(dateStr + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.floor((target - today) / (24 * 60 * 60 * 1000));
}
export function calculateTenure(hireDate) {
  if (!hireDate) return null;
  const hire = new Date(hireDate + 'T00:00:00');
  const now = new Date();
  const years = now.getFullYear() - hire.getFullYear() - (now < new Date(now.getFullYear(), hire.getMonth(), hire.getDate()) ? 1 : 0);
  return years > 0 ? `${years} year${years === 1 ? '' : 's'}` : 'less than a year';
}

function sectionHeaderStyle() {
  return { fontFamily: BRAND_SERIF, fontSize: 15, fontWeight: 700, color: '#241A33', margin: '0 0 10px' };
}
function cardStyle() {
  return { border: `1.5px solid ${BRAND.box}`, borderRadius: 8, padding: '14px 16px', marginBottom: 20, background: 'white' };
}

function StatusBadge({ status }) {
  const colors = {
    pending: { bg: '#FEF3C7', text: '#92400E' },
    approved: { bg: '#D1FAE5', text: '#065F46' },
    denied: { bg: '#FEE2E2', text: '#991B1B' },
  };
  const c = colors[status] || colors.pending;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: c.bg, color: c.text, textTransform: 'capitalize' }}>
      {status}
    </span>
  );
}

function requestSummary(req) {
  if (req.is_balance_type) {
    const sameDay = req.start_date === req.end_date;
    if (sameDay) {
      return `${req.request_type} \u2014 ${formatDate(req.start_date)}, ${req.start_time?.slice(0, 5)}-${req.end_time?.slice(0, 5)}`;
    }
    return `${req.request_type} \u2014 ${formatDate(req.start_date)} ${req.start_time?.slice(0, 5)} to ${formatDate(req.end_date)} ${req.end_time?.slice(0, 5)}`;
  }
  if (req.is_recurring) {
    return `${req.request_type} \u2014 every ${WEEKDAY_LABELS[req.weekday]}, ${req.start_time?.slice(0, 5)}-${req.end_time?.slice(0, 5)}, starting ${formatDate(req.recurring_start_date)}`;
  }
  return `${req.request_type} \u2014 ${formatDate(req.ooo_date)}, ${req.start_time?.slice(0, 5)}-${req.end_time?.slice(0, 5)}`;
}

export function ProfileBanner({ profile, isMobile }) {
  const tenure = calculateTenure(profile.hire_date);
  const displayName = `${profile.preferred_name || profile.first_name} ${profile.last_name}`;
  return (
    <div style={{ padding: isMobile ? '16px 16px 14px' : '20px 28px 16px', borderBottom: `1.5px solid ${BRAND.box}`, background: '#FCFBFE', display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 16 }}>
      <Avatar name={displayName} size={isMobile ? 44 : 52} />
      <div>
        <h1 style={{ fontFamily: BRAND_SERIF, fontSize: isMobile ? 19 : 24, fontWeight: 700, color: '#241A33', margin: '0 0 4px' }}>
          {displayName}
        </h1>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12.5, color: BRAND.muted }}>
          {profile.position && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><BriefcaseIcon size={13} color={BRAND.muted} />{profile.position}</span>}
          {profile.provider_name && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><UserIcon size={13} color={BRAND.muted} />Linked provider: {profile.provider_name}</span>}
          {tenure && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><CalendarIcon size={13} color={BRAND.muted} />With us for {tenure}</span>}
        </div>
      </div>
    </div>
  );
}

const BALANCE_TYPE_STYLE = {
  PTO: { bg: '#F5F3FF', text: '#3C3489', icon: BeachIcon },
  UPTO: { bg: '#E6F1FB', text: '#0C447C', icon: FirstAidIcon },
};

function BalanceCards({ balances, isMobile }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: 12, marginBottom: 20 }}>
      {balances.map(b => {
        const style = BALANCE_TYPE_STYLE[b.balance_type] || { bg: BRAND.tint, text: '#241A33', icon: UserIcon };
        const TypeIcon = style.icon;
        const negative = b.balance_hours < 0;
        return (
          <div key={b.balance_type} style={{ padding: 14, borderRadius: 8, border: `1.5px solid ${BRAND.box}`, background: negative ? '#FEF2F2' : style.bg }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <TypeIcon size={14} color={negative ? '#991B1B' : style.text} />
              <span style={{ fontSize: 10.5, fontWeight: 700, color: negative ? '#991B1B' : style.text, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{b.balance_type}</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: negative ? '#991B1B' : '#241A33', fontFamily: BRAND_SERIF }}>
              {b.balance_hours} <span style={{ fontSize: 12, fontWeight: 500, fontFamily: 'inherit' }}>hours</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// `adminFor`: set when an admin is adding time off FOR someone -- it's the
// chosen username ('' until one is picked). Those entries are approved on
// the spot by the server, so there's no "request" wording, and PTO/UPTO that
// would go below zero comes back as a warning to confirm instead of an error.
// Meeting "With": pick other staff. Selected people show as removable
// chips; a search box filters the list. The organizer isn't offered.
function AttendeePicker({ selected, onChange, exclude, isMobile, labelStyle }) {
  const directory = useStaffDirectory();
  const [query, setQuery] = useState('');
  const options = directory.filter(s => s.username !== exclude);
  const q = query.trim().toLowerCase();
  const matches = options.filter(s => !selected.includes(s.username) && (!q || s.display_name.toLowerCase().includes(q) || s.username.toLowerCase().includes(q)));
  const toggle = (u) => onChange(selected.includes(u) ? selected.filter(x => x !== u) : [...selected, u]);
  return (
    <div style={{ marginBottom: 12 }}>
      <label htmlFor="kl-meeting-with" style={labelStyle}>With (optional)</label>
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
          {selected.map(u => (
            <span key={u} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, padding: '3px 4px 3px 10px', borderRadius: 999, background: BRAND.tint, border: `1px solid ${BRAND.box}`, color: BRAND.brassText }}>
              {staffName(directory, u)}
              <button type="button" onClick={() => toggle(u)} aria-label={`Remove ${staffName(directory, u)}`} style={{ border: 'none', background: 'none', cursor: 'pointer', color: BRAND.brassText, fontSize: 14, lineHeight: 1, padding: '0 4px' }}>&times;</button>
            </span>
          ))}
        </div>
      )}
      <input
        id="kl-meeting-with"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search staff to add..."
        style={{ width: '100%', padding: isMobile ? '10px 12px' : '7px 10px', borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: isMobile ? 15 : 13, boxSizing: 'border-box' }}
      />
      {(q || selected.length === 0) && matches.length > 0 && (
        <div style={{ maxHeight: 150, overflowY: 'auto', border: `1px solid ${BORDER}`, borderTop: 'none', borderRadius: '0 0 6px 6px', background: 'white' }}>
          {matches.slice(0, 30).map(s => (
            <button key={s.username} type="button" onClick={() => { toggle(s.username); setQuery(''); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', border: 'none', borderBottom: '1px solid #f3f4f6', background: 'white', cursor: 'pointer', fontSize: 13, color: '#374151' }}>
              {s.display_name} <span style={{ color: '#9ca3af', fontSize: 11.5 }}>{s.username}</span>
            </button>
          ))}
        </div>
      )}
      <p style={{ fontSize: 11.5, color: '#9ca3af', margin: '4px 0 0' }}>
        Once approved it goes on their calendars too, with one shared agenda and comment thread.
      </p>
    </div>
  );
}

// `changeOf`: an already-approved entry being changed. The form starts
// from its values and files the change as a new request pointing at it --
// pending admin approval for an employee (`changeApplies` false), applied
// right away for an admin (`changeApplies` true, with the same negative-
// balance warning as adding). A recurring change takes effect from the
// "Starting" date, which begins at today so past weeks stay as they were.
function RequestForm({ onSubmitted, onCancel, isMobile, editingRequest, adminFor, changeOf, changeApplies }) {
  const isEditing = !!editingRequest;
  const isChange = !!changeOf;
  const adminMode = adminFor !== undefined || (isChange && !!changeApplies);
  const seed = editingRequest || changeOf;
  const todayInput = dateToInputValue(new Date());
  const [negativeWarning, setNegativeWarning] = useState(null); // server's negativeBalance details
  const [requestType, setRequestType] = useState(seed?.request_type || 'PTO');
  const [isRecurring, setIsRecurring] = useState(seed?.is_recurring || false);
  const [startDate, setStartDate] = useState(seed?.start_date || '');
  const [endDate, setEndDate] = useState(seed?.end_date || '');
  const [balanceStartTime, setBalanceStartTime] = useState(seed?.is_balance_type ? (seed?.start_time || '').slice(0, 5) : '');
  const [balanceEndTime, setBalanceEndTime] = useState(seed?.is_balance_type ? (seed?.end_time || '').slice(0, 5) : '');
  const [oooDate, setOooDate] = useState(seed?.ooo_date || '');
  const [startTime, setStartTime] = useState(seed?.is_balance_type ? '' : (seed?.start_time || '').slice(0, 5));
  const [endTime, setEndTime] = useState(seed?.is_balance_type ? '' : (seed?.end_time || '').slice(0, 5));
  const [weekday, setWeekday] = useState(seed?.weekday ?? 1);
  const [recurringStartDate, setRecurringStartDate] = useState(isChange && changeOf.is_recurring ? (changeOf.recurring_start_date > todayInput ? changeOf.recurring_start_date : todayInput) : (seed?.recurring_start_date || ''));
  const [notes, setNotes] = useState(seed?.notes || '');
  // Meeting "With": other staff it goes on the calendar of too.
  const [attendees, setAttendees] = useState(seed?.attendees || []);
  const { user: me } = useAuth();
  const organizer = adminFor || changeOf?.username || editingRequest?.username || me?.username;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const isBalanceType = BALANCE_TYPES.includes(requestType);

  useEffect(() => {
    if (isBalanceType && isRecurring) setIsRecurring(false);
  }, [isBalanceType]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (confirmNegative = false) => {
    setError(null);
    setNegativeWarning(null);
    if (adminFor !== undefined && !adminFor) { setError('Choose who this time off is for.'); return; }
    if (requestType === 'Other' && !notes.trim()) { setError('Please specify what this "Other" time is for.'); return; }
    const record = { request_type: requestType, is_recurring: isRecurring, notes };
    if (requestType === 'Meeting') record.attendees = attendees.filter(a => a !== organizer);
    if (isBalanceType) {
      if (!startDate || !balanceStartTime || !endDate || !balanceEndTime) {
        setError('Start date/time and end date/time are all required.'); return;
      }
      Object.assign(record, { start_date: startDate, start_time: balanceStartTime, end_date: endDate, end_time: balanceEndTime });
    } else if (isRecurring) {
      if (!startTime || !endTime || !recurringStartDate) { setError('Start time, end time, and a starting date are required.'); return; }
      Object.assign(record, { weekday, start_time: startTime, end_time: endTime, recurring_start_date: recurringStartDate });
    } else {
      if (!oooDate || !startTime || !endTime) { setError('Date, start time, and end time are required.'); return; }
      Object.assign(record, { ooo_date: oooDate, start_time: startTime, end_time: endTime });
    }
    if (isChange) {
      // Nothing about the schedule changed? Then there's nothing to file.
      const t = (v) => (v || '').slice(0, 5);
      const same = record.request_type === changeOf.request_type && !!record.is_recurring === !!changeOf.is_recurring
        && t(record.start_time) === t(changeOf.start_time) && t(record.end_time) === t(changeOf.end_time)
        && (record.start_date || null) === (changeOf.start_date || null) && (record.end_date || null) === (changeOf.end_date || null)
        && (record.ooo_date || null) === (changeOf.ooo_date || null)
        && (!record.is_recurring || Number(record.weekday) === Number(changeOf.weekday))
        && (record.notes || '').trim() === (changeOf.notes || '').trim()
        && [...(record.attendees || [])].sort().join(',') === [...(changeOf.request_type === 'Meeting' ? (changeOf.attendees || []) : [])].sort().join(',');
      if (same) { setError('Nothing has changed.'); return; }
      Object.assign(record, { replaces_request_id: changeOf.id });
      if (adminMode) record.confirm_negative_balance = confirmNegative;
    } else if (adminMode) Object.assign(record, { username: adminFor, confirm_negative_balance: confirmNegative });
    setSaving(true);
    try {
      if (isEditing) await api.editTimeOffRequest(editingRequest.id, record);
      else await api.submitTimeOffRequest(record);
    } catch (err) {
      setSaving(false);
      if (adminMode && err.status === 409 && err.data?.negativeBalance) setNegativeWarning(err.data.negativeBalance);
      else setError(err.message);
      return;
    }
    setSaving(false);
    onSubmitted(adminFor !== undefined ? adminFor : undefined);
  };
  const fmtHours = (h) => `${Number(h.toFixed(2))} ${Math.abs(h) === 1 ? 'hour' : 'hours'}`;

  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 };
  const inputStyle = { width: '100%', padding: isMobile ? '10px 12px' : '7px 10px', borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: isMobile ? 15 : 13, boxSizing: 'border-box' };

  return (
    <div style={{ padding: isMobile ? 16 : 20, border: `1.5px solid ${BRAND.box}`, borderRadius: 8, marginBottom: 20, background: '#fafafa' }}>
      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Type</label>
        <select style={inputStyle} value={requestType} onChange={e => setRequestType(e.target.value)}>
          <optgroup label="Uses a balance">
            {BALANCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </optgroup>
          <optgroup label="Other schedule blocks">
            {BALANCE_NEUTRAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </optgroup>
        </select>
      </div>

      {isBalanceType ? (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Start Date</label>
            <input type="date" style={inputStyle} value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Start Time</label>
            <input type="time" style={inputStyle} value={balanceStartTime} onChange={e => setBalanceStartTime(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>End Date</label>
            <input type="date" style={inputStyle} value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>End Time</label>
            <input type="time" style={inputStyle} value={balanceEndTime} onChange={e => setBalanceEndTime(e.target.value)} />
          </div>
        </div>
      ) : (
        <>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} />
            Repeats weekly
          </label>
          {isRecurring ? (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Day of week</label>
                <select style={inputStyle} value={weekday} onChange={e => setWeekday(Number(e.target.value))}>
                  {WEEKDAY_LABELS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>{isChange ? 'Change takes effect' : 'Starting'}</label>
                <input type="date" style={inputStyle} value={recurringStartDate} onChange={e => setRecurringStartDate(e.target.value)} />
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Date</label>
              <input type="date" style={inputStyle} value={oooDate} onChange={e => setOooDate(e.target.value)} />
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Start Time</label>
              <input type="time" style={inputStyle} value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>End Time</label>
              <input type="time" style={inputStyle} value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>
        </>
      )}

      {requestType === 'Meeting' && (
        <AttendeePicker selected={attendees} onChange={setAttendees} exclude={organizer} isMobile={isMobile} labelStyle={labelStyle} />
      )}

      <div style={{ marginBottom: 14 }}>
        <label htmlFor="kl-timeoff-notes" style={labelStyle}>
          {requestType === 'Other' ? <>Please specify <span style={{ color: '#b91c1c' }}>*</span></> : 'Notes (optional)'}
        </label>
        <textarea
          id="kl-timeoff-notes"
          style={{ ...inputStyle, minHeight: 50, resize: 'vertical', ...(requestType === 'Other' && !notes.trim() ? { borderColor: '#FCA5A5' } : {}) }}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder={requestType === 'Other' ? 'What is this time for?' : ''}
        />
        <p style={{ fontSize: 11.5, color: '#9ca3af', margin: '3px 0 0' }}>Shown to staff when they open this on the schedule.</p>
      </div>

      {error && <p style={{ color: '#dc2626', fontSize: 12.5, marginBottom: 10 }}>{error}</p>}

      {negativeWarning && (
        <div role="alert" style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#92400E', margin: '0 0 4px' }}>
            This will put {negativeWarning.username} below zero {negativeWarning.balance_type}
          </p>
          <p style={{ fontSize: 12.5, color: '#92400E', margin: '0 0 10px' }}>
            They have {fmtHours(negativeWarning.current_hours)} and this uses {fmtHours(negativeWarning.hours_requested)}, which leaves {fmtHours(negativeWarning.resulting_hours)}.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => handleSubmit(true)} disabled={saving} style={{ padding: '7px 14px', borderRadius: 6, fontSize: 12.5, fontWeight: 600, border: 'none', background: '#B45309', color: 'white', cursor: 'pointer' }}>
              {saving ? 'Adding...' : 'Add anyway'}
            </button>
            <button onClick={() => setNegativeWarning(null)} disabled={saving} style={{ padding: '7px 14px', borderRadius: 6, fontSize: 12.5, fontWeight: 600, border: '1px solid #FCD34D', background: 'white', color: '#92400E', cursor: 'pointer' }}>
              Change it
            </button>
          </div>
        </div>
      )}

      {adminMode && !isChange && !negativeWarning && (
        <p style={{ fontSize: 12, color: BRAND.muted, margin: '0 0 12px' }}>
          Added time off is approved right away: it goes straight on their schedule and PTO/UPTO hours come off their balance.
        </p>
      )}
      {isChange && !negativeWarning && (
        <p style={{ fontSize: 12, color: BRAND.muted, margin: '0 0 12px' }}>
          {changeApplies
            ? 'Your change applies right away: the schedule updates and PTO/UPTO hours are adjusted.'
            : 'Changes to the date, time or type go to an admin for approval. Until then, the current entry stays on the schedule as it is.'}
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, flexDirection: isMobile ? 'column' : 'row' }}>
        <button onClick={() => handleSubmit(false)} disabled={saving || !!negativeWarning} style={{ padding: isMobile ? '11px' : '8px 16px', borderRadius: 6, fontSize: isMobile ? 14.5 : 13, fontWeight: 600, border: 'none', background: BRAND.forest, color: 'white', cursor: 'pointer' }}>
          {saving ? 'Saving...' : isEditing ? 'Save Changes' : isChange ? (changeApplies ? 'Save changes' : 'Submit change for approval') : adminMode ? 'Add time off' : 'Submit Request'}
        </button>
        <button onClick={onCancel} disabled={saving} style={{ padding: isMobile ? '11px' : '8px 16px', borderRadius: 6, fontSize: isMobile ? 14.5 : 13, fontWeight: 600, border: `1px solid ${BORDER}`, background: 'white', color: '#374151', cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// `onChange(req)`: offers "Edit" on approved entries (not while a change
// to them is already waiting). A change request shows the entry it would
// replace, so an approver sees before and after.
function RequestList({ requests, isMobile, showUsername, onApprove, onDeny, onEdit, onDelete, onChange }) {
  const directory = useStaffDirectory();
  if (requests.length === 0) {
    return <p style={{ fontSize: 13, color: BRAND.muted, textAlign: 'center', padding: 24 }}>Nothing here yet.</p>;
  }
  return (
    <div>
      {requests.map(req => (
        <div key={req.id} style={{ padding: '12px 4px', borderBottom: `1px solid #f1f2f4`, display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: 8 }}>
          <div>
            {showUsername && <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.forest, marginBottom: 2 }}>{req.username}</div>}
            {req.replaces_request_id && (
              <div style={{ fontSize: 11, fontWeight: 700, color: '#B45309', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Change request</div>
            )}
            <div style={{ fontSize: 13.5, color: '#241A33' }}>{req.replaces_request_id ? 'New: ' : ''}{requestSummary(req)}</div>
            {req.replaces_request_id && (
              <div style={{ fontSize: 12, color: BRAND.muted, marginTop: 2 }}>
                {req.original ? <>Currently: {requestSummary(req.original)}</> : 'The entry it changes has since been removed.'}
              </div>
            )}
            {req.has_pending_change && req.status === 'approved' && (
              <div style={{ fontSize: 12, color: '#B45309', fontWeight: 600, marginTop: 2 }}>Change pending approval</div>
            )}
            {req.request_type === 'Meeting' && (req.attendees || []).length > 0 && (
              <div style={{ fontSize: 12, color: BRAND.muted, marginTop: 2 }}>With {req.attendees.map(a => staffName(directory, a)).join(', ')}</div>
            )}
            {req.created_by && req.created_by !== req.username && (
              <div style={{ fontSize: 12, color: BRAND.muted, marginTop: 2 }}>Added by {req.created_by}</div>
            )}
            {req.notes && <div style={{ fontSize: 12, color: BRAND.muted, marginTop: 2 }}>{req.notes}</div>}
            {req.status === 'denied' && req.review_note && <div style={{ fontSize: 12, color: '#991B1B', marginTop: 2 }}>Reason: {req.review_note}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <StatusBadge status={req.status} />
            {req.status === 'pending' && onApprove && (
              <>
                <button onClick={() => onApprove(req.id)} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 600, border: 'none', background: '#059669', color: 'white', cursor: 'pointer' }}>Approve</button>
                <button onClick={() => onDeny(req.id)} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 600, border: `1px solid ${BORDER}`, background: 'white', color: '#374151', cursor: 'pointer' }}>Deny</button>
              </>
            )}
            {req.status === 'approved' && onChange && !req.has_pending_change && (
              <button onClick={() => onChange(req)} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 600, border: `1px solid ${BORDER}`, background: 'white', color: '#374151', cursor: 'pointer' }}>Edit</button>
            )}
            {req.status === 'pending' && onEdit && (
              <button onClick={() => onEdit(req)} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 600, border: `1px solid ${BORDER}`, background: 'white', color: '#374151', cursor: 'pointer' }}>Edit</button>
            )}
            {onDelete && (
              <button onClick={() => onDelete(req.id)} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 600, border: `1px solid ${BORDER}`, background: 'white', color: '#991B1B', cursor: 'pointer' }}>Delete</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// Editing an approved entry: the agenda (meetings only, saves right away)
// and the date/time/type (a change -- approval needed unless an admin is
// the one editing). `initialDate` picks the week for "This week only".
function EditTimeOffPanel({ request, isMobile, adminApplies, initialDate, onDone, onCancel }) {
  const sectionTitle = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: BRAND.muted, margin: '0 0 8px' };
  return (
    <div style={{ padding: isMobile ? 14 : 18, border: `1.5px solid ${BRAND.box}`, borderRadius: 10, marginBottom: 20, background: 'white' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
        <div>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#241A33', margin: 0 }}>Edit time off</p>
          <p style={{ fontSize: 12.5, color: BRAND.muted, margin: '2px 0 0' }}>{requestSummary(request)}</p>
        </div>
        <button onClick={onCancel} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 600, border: `1px solid ${BORDER}`, background: 'white', color: '#374151', cursor: 'pointer', flexShrink: 0 }}>Close</button>
      </div>
      {request.request_type === 'Meeting' && (
        <div style={{ marginBottom: 20 }}>
          <p style={sectionTitle}>Agenda</p>
          <MeetingAgendaEditor requestId={request.id} initialDate={initialDate} />
        </div>
      )}
      <p style={sectionTitle}>{request.request_type === 'Meeting' ? 'Date, time, type & people' : 'Date, time & type'}</p>
      <RequestForm isMobile={isMobile} changeOf={request} changeApplies={adminApplies} onSubmitted={onDone} onCancel={onCancel} />
    </div>
  );
}

// Opens the entry named in the address (?edit=<id>&date=<yyyy-mm-dd>),
// which is where the schedule's "Edit in My time" link lands. Clears those
// two parameters again once the panel is closed.
function useEditFromAddress(requests) {
  const [searchParams, setSearchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  const editDate = searchParams.get('date') || undefined;
  const [picked, setPicked] = useState(null); // opened with an Edit button
  const fromAddress = editId && requests ? requests.find(r => String(r.id) === String(editId)) || null : null;
  const notFound = !!editId && requests !== null && !fromAddress;
  const editing = picked || fromAddress;
  const setEditing = setPicked;
  const close = () => {
    setPicked(null);
    if (editId) {
      const next = new URLSearchParams(searchParams);
      next.delete('edit'); next.delete('date');
      setSearchParams(next, { replace: true });
    }
  };
  return { editing, setEditing, editDate: editing && String(editing.id) === String(editId) ? editDate : undefined, notFound, close };
}

// Meetings someone else organized that I'm in. Read the details, and edit
// the shared agenda (anyone in the meeting can); only the organizer or an
// admin can change the date/time or cancel it.
function MeetingsImIn({ isMobile }) {
  const [meetings, setMeetings] = useState(null);
  const [openId, setOpenId] = useState(null);
  const directory = useStaffDirectory();
  useEffect(() => {
    api.getMyMeetings().then(m => setMeetings(m || [])).catch(() => setMeetings([]));
  }, []);
  if (!meetings || meetings.length === 0) return null;
  return (
    <div style={{ marginTop: 28 }}>
      <p style={sectionHeaderStyle()}>Meetings I'm in</p>
      {meetings.map(m => (
        <div key={m.id} style={{ padding: '12px 4px', borderBottom: '1px solid #f1f2f4' }}>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: 8 }}>
            <div>
              <div style={{ fontSize: 13.5, color: '#241A33' }}>{requestSummary(m)}</div>
              <div style={{ fontSize: 12, color: BRAND.muted, marginTop: 2 }}>
                Organized by {staffName(directory, m.username)}
                {(m.attendees || []).length > 1 && <> &middot; with {m.attendees.map(a => staffName(directory, a)).join(', ')}</>}
              </div>
              {m.notes && <div style={{ fontSize: 12, color: BRAND.muted, marginTop: 2 }}>{m.notes}</div>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <StatusBadge status={m.status} />
              <button onClick={() => setOpenId(openId === m.id ? null : m.id)} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 600, border: `1px solid ${BORDER}`, background: 'white', color: '#374151', cursor: 'pointer' }}>
                {openId === m.id ? 'Hide agenda' : 'Agenda'}
              </button>
            </div>
          </div>
          {openId === m.id && (
            <div style={{ marginTop: 12 }}>
              <MeetingAgendaEditor requestId={m.id} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function TimeOffTab({ isMobile }) {
  const [balances, setBalances] = useState([]);
  const [myRequests, setMyRequests] = useState(null); // null until loaded
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState(null);
  const { editing, setEditing, editDate, notFound, close: closeEdit } = useEditFromAddress(myRequests);

  const load = useCallback(async () => {
    const [b, mine] = await Promise.all([api.getMyTimeOffBalances(), api.getMyTimeOffRequests()]);
    setBalances(b);
    setMyRequests(mine);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id) => { await api.deleteTimeOffRequest(id); load(); };

  return (
    <div>
      <p style={{ fontSize: 12.5, color: BRAND.muted, marginBottom: 16, maxWidth: 480 }}>
        Every kind of time away from the schedule -- vacation, sick time, a lunch break, a standing weekly commitment,
        anything -- starts as a request here and goes to an admin for approval before it appears on the calendar.
      </p>
      <BalanceCards balances={balances} isMobile={isMobile} />

      {notFound && (
        <p style={{ fontSize: 12.5, color: '#92400E', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: '8px 12px' }}>
          That entry isn't in your time off any more. It may have been changed or removed.
        </p>
      )}
      {notice && <p role="status" style={{ fontSize: 12.5, color: '#067647', fontWeight: 600 }}>{notice}</p>}

      {editing ? (
        <EditTimeOffPanel
          key={editing.id}
          request={editing}
          isMobile={isMobile}
          adminApplies={false}
          initialDate={editDate}
          onDone={() => { closeEdit(); setNotice('Change submitted. It will replace the current entry once an admin approves it.'); load(); }}
          onCancel={() => { closeEdit(); load(); }}
        />
      ) : showForm ? (
        <RequestForm isMobile={isMobile} onSubmitted={() => { setShowForm(false); load(); }} onCancel={() => setShowForm(false)} />
      ) : (
        <button onClick={() => setShowForm(true)} style={{ padding: isMobile ? '12px' : '9px 16px', borderRadius: 6, fontSize: isMobile ? 14.5 : 13, fontWeight: 600, border: 'none', background: BRAND.forest, color: 'white', cursor: 'pointer', marginBottom: 20, width: isMobile ? '100%' : 'auto' }}>
          + New Request
        </button>
      )}

      <RequestList requests={myRequests || []} isMobile={isMobile} onDelete={handleDelete} onChange={(req) => { setNotice(null); setShowForm(false); setEditing(req); }} />

      <MeetingsImIn isMobile={isMobile} />
    </div>
  );
}

// `forUsername` narrows the list to one person (used on the admin staff
// profile); without it this is the practice-wide approvals queue.
// "+ Add time off" lets the admin enter time off for someone directly --
// fixed to `forUsername` on a profile, or with an employee picker here.
// `onAdded` fires after one is added (the profile uses it to refresh the
// balances shown above the list).
function staffOptionLabel(s) {
  const first = s.preferred_name || s.first_name;
  return first && s.last_name ? `${first} ${s.last_name} (${s.username})` : s.username;
}

export function TimeOffManageTab({ isMobile, embedded, onChanged, forUsername, onAdded }) {
  // Arriving from the schedule's "Edit on <name>'s profile" link (?edit=...)
  // means an approved entry, so start on the Approved list.
  const [addressParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(addressParams.get('edit') ? 'approved' : 'pending');
  const [adding, setAdding] = useState(false);
  const [addFor, setAddFor] = useState(forUsername || '');
  const [staffOptions, setStaffOptions] = useState([]);
  const [addedNotice, setAddedNotice] = useState(null);

  useEffect(() => {
    if (forUsername || !adding || staffOptions.length > 0) return;
    api.getStaff()
      .then(list => setStaffOptions((list || []).filter(s => !s.archived).sort((a, b) => staffOptionLabel(a).localeCompare(staffOptionLabel(b)))))
      .catch(() => setStaffOptions([]));
  }, [forUsername, adding, staffOptions.length]);

  const startAdding = () => { setAddedNotice(null); setAddFor(forUsername || ''); setAdding(true); };
  const handleAdded = (username) => {
    setAdding(false);
    setAddedNotice(`Time off added for ${username}. It's approved and on their schedule.`);
    // It's approved, so it would be invisible under the default Pending filter.
    if (statusFilter === 'pending' || statusFilter === 'denied') setStatusFilter('approved');
    else load();
    onAdded?.();
  };
  const [requests, setRequests] = useState(null); // null until loaded
  const { editing: changing, setEditing: setChanging, editDate, notFound, close: closeChange } = useEditFromAddress(requests);
  const [denyingId, setDenyingId] = useState(null);
  const [denyNote, setDenyNote] = useState('');
  const [editingRequest, setEditingRequest] = useState(null);

  const load = useCallback(async () => {
    const all = await api.getAllTimeOffRequests(statusFilter === 'all' ? null : statusFilter);
    setRequests(forUsername ? all.filter(r => r.username === forUsername) : all);
    onChanged?.();
  }, [statusFilter, onChanged, forUsername]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (id) => { await api.approveTimeOffRequest(id); load(); };
  const handleDenyConfirm = async () => { await api.denyTimeOffRequest(denyingId, denyNote); setDenyingId(null); setDenyNote(''); load(); };
  const handleDelete = async (id) => { await api.deleteTimeOffRequest(id); load(); };

  const FILTERS = [
    { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'denied', label: 'Denied' },
    { key: 'all', label: 'All' },
  ];

  if (changing) {
    return (
      <div style={{ padding: embedded ? 0 : (isMobile ? 16 : '24px 28px 40px') }}>
        <EditTimeOffPanel
          key={changing.id}
          request={changing}
          isMobile={isMobile}
          adminApplies
          initialDate={editDate}
          onDone={() => { closeChange(); setAddedNotice(`Changes saved for ${changing.username}.`); load(); onAdded?.(); }}
          onCancel={() => { closeChange(); load(); }}
        />
      </div>
    );
  }

  if (editingRequest) {
    return (
      <div style={{ padding: embedded ? 0 : (isMobile ? 16 : '24px 28px 40px') }}>
        <p style={sectionHeaderStyle()}>Editing {editingRequest.username}'s request</p>
        <RequestForm
          isMobile={isMobile}
          editingRequest={editingRequest}
          onSubmitted={() => { setEditingRequest(null); load(); }}
          onCancel={() => setEditingRequest(null)}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: embedded ? 0 : (isMobile ? 16 : '24px 28px 40px') }}>
      {adding ? (
        <div>
          {!forUsername && (
            <div style={{ marginBottom: 10 }}>
              <label htmlFor="kl-add-time-off-for" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Employee</label>
              <select
                id="kl-add-time-off-for"
                value={addFor}
                onChange={e => setAddFor(e.target.value)}
                style={{ width: '100%', maxWidth: 360, padding: isMobile ? '10px 12px' : '7px 10px', borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: isMobile ? 15 : 13, boxSizing: 'border-box' }}
              >
                <option value="">Choose an employee...</option>
                {staffOptions.map(s => <option key={s.username} value={s.username}>{staffOptionLabel(s)}</option>)}
              </select>
            </div>
          )}
          <RequestForm isMobile={isMobile} adminFor={addFor} onSubmitted={handleAdded} onCancel={() => setAdding(false)} />
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <button onClick={startAdding} style={{ padding: isMobile ? '11px 14px' : '8px 14px', borderRadius: 6, fontSize: isMobile ? 14.5 : 13, fontWeight: 600, border: 'none', background: BRAND.forest, color: 'white', cursor: 'pointer' }}>
            + Add time off
          </button>
          {addedNotice && <span role="status" style={{ fontSize: 12.5, color: '#067647', fontWeight: 600 }}>{addedNotice}</span>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: `1.5px solid ${BORDER}` }}>
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setStatusFilter(f.key)} style={{ padding: '9px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: statusFilter === f.key ? 700 : 500, color: statusFilter === f.key ? BRAND.forest : BRAND.muted, borderBottom: statusFilter === f.key ? `2px solid ${BRAND.forest}` : '2px solid transparent', marginBottom: -2 }}>
            {f.label}
          </button>
        ))}
      </div>

      {notFound && (
        <p style={{ fontSize: 12.5, color: '#92400E', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: '8px 12px' }}>
          That entry wasn't found here. It may have been changed or removed.
        </p>
      )}
      <RequestList
        requests={requests || []}
        isMobile={isMobile}
        showUsername={!forUsername}
        onApprove={handleApprove}
        onDeny={(id) => setDenyingId(id)}
        onEdit={(req) => setEditingRequest(req)}
        onDelete={handleDelete}
        onChange={(req) => { setAddedNotice(null); setChanging(req); }}
      />

      {denyingId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 16 }} onClick={() => setDenyingId(null)}>
          <div style={{ background: 'white', borderRadius: 10, padding: 20, maxWidth: 400, width: '100%' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Deny this request?</h3>
            <textarea placeholder="Reason (optional, shown to the employee)" value={denyNote} onChange={e => setDenyNote(e.target.value)} style={{ width: '100%', minHeight: 70, padding: 10, borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 13, boxSizing: 'border-box', marginBottom: 12, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setDenyingId(null)} style={{ padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, border: `1px solid ${BORDER}`, background: 'white', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleDenyConfirm} style={{ padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, border: 'none', background: '#dc2626', color: 'white', cursor: 'pointer' }}>Deny</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function OfficeHoursTab({ isMobile, embedded }) {
  const [hours, setHours] = useState([]);
  const [closures, setClosures] = useState([]);
  const [newClosureDate, setNewClosureDate] = useState('');
  const [newClosureReason, setNewClosureReason] = useState('');
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const [h, c] = await Promise.all([api.getOfficeHours(), api.getOfficeClosures()]);
    setHours(h);
    setClosures(c);
  }, []);

  useEffect(() => { load(); }, [load]);

  const hoursByWeekday = Object.fromEntries(hours.map(h => [h.weekday, h]));

  const handleSaveDay = async (weekday, openTime, closeTime, closed) => {
    setError(null);
    try {
      await api.setOfficeHours({ weekday, open_time: openTime, close_time: closeTime, closed });
    } catch (err) {
      setError(err.message); return;
    }
    load();
  };

  const handleAddClosure = async () => {
    if (!newClosureDate) { setError('Pick a date first.'); return; }
    setError(null);
    try {
      await api.addOfficeClosure(newClosureDate, newClosureReason || null);
    } catch (err) {
      setError(err.message); return;
    }
    setNewClosureDate(''); setNewClosureReason('');
    load();
  };

  const handleRemoveClosure = async (id) => { await api.deleteOfficeClosure(id); load(); };

  const inputStyle = { padding: isMobile ? '9px 10px' : '6px 9px', borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: isMobile ? 14.5 : 13, boxSizing: 'border-box' };

  return (
    <div style={{ padding: embedded ? 0 : (isMobile ? 16 : '24px 28px 40px') }}>
      <p style={sectionHeaderStyle()}>Weekly hours</p>
      <p style={{ fontSize: 12.5, color: BRAND.muted, marginBottom: 14, maxWidth: 520 }}>
        A day with no hours set is treated as closed. These hours are what a provider's contracted schedule gets
        measured against -- any gap between office hours and a provider's usual schedule becomes an automatic
        Unavailable block for them.
      </p>
      <div style={cardStyle()}>
        {WEEKDAY_LABELS.map((label, weekday) => {
          const day = hoursByWeekday[weekday];
          const closed = !day;
          return (
            <div key={weekday} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: weekday < 6 ? '1px solid #f1f2f4' : 'none', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
              <span style={{ fontSize: 13, width: 90, color: '#241A33', flexShrink: 0 }}>{label}</span>
              {closed ? (
                <span style={{ fontSize: 12.5, color: BRAND.muted, fontStyle: 'italic' }}>Closed</span>
              ) : (
                <>
                  <input type="time" style={inputStyle} defaultValue={day.open_time?.slice(0, 5)} onBlur={e => handleSaveDay(weekday, e.target.value, day.close_time?.slice(0, 5), false)} />
                  <span style={{ fontSize: 12, color: BRAND.muted }}>to</span>
                  <input type="time" style={inputStyle} defaultValue={day.close_time?.slice(0, 5)} onBlur={e => handleSaveDay(weekday, day.open_time?.slice(0, 5), e.target.value, false)} />
                </>
              )}
              <button
                onClick={() => closed ? handleSaveDay(weekday, '09:00', '17:00', false) : handleSaveDay(weekday, null, null, true)}
                style={{ marginLeft: 'auto', padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: `1px solid ${BORDER}`, background: 'white', color: '#374151', cursor: 'pointer' }}
              >
                {closed ? 'Set hours' : 'Mark closed'}
              </button>
            </div>
          );
        })}
      </div>

      <p style={sectionHeaderStyle()}>Closure dates</p>
      <p style={{ fontSize: 12.5, color: BRAND.muted, marginBottom: 14, maxWidth: 520 }}>
        A specific date the office is fully closed -- creates an all-day Unavailable block for every provider.
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input type="date" style={inputStyle} value={newClosureDate} onChange={e => setNewClosureDate(e.target.value)} />
        <input placeholder="Reason (optional)" style={{ ...inputStyle, flex: 1, minWidth: 160 }} value={newClosureReason} onChange={e => setNewClosureReason(e.target.value)} />
        <button onClick={handleAddClosure} style={{ padding: isMobile ? '9px 14px' : '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, border: 'none', background: BRAND.forest, color: 'white', cursor: 'pointer' }}>
          Add closure
        </button>
      </div>
      {error && <p style={{ color: '#dc2626', fontSize: 12.5, marginBottom: 10 }}>{error}</p>}
      <div style={cardStyle()}>
        {closures.length === 0 ? (
          <p style={{ fontSize: 13, color: BRAND.muted, margin: 0 }}>No closure dates on file.</p>
        ) : (
          closures.map((c, i) => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < closures.length - 1 ? '1px solid #f1f2f4' : 'none' }}>
              <span style={{ fontSize: 13, color: '#241A33' }}>{formatDate(c.closure_date)}{c.reason ? ` \u2014 ${c.reason}` : ''}</span>
              <button onClick={() => handleRemoveClosure(c.id)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: `1px solid ${BORDER}`, background: 'white', color: '#991B1B', cursor: 'pointer' }}>Remove</button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function CredentialsTab({ isMobile }) {
  const [credentials, setCredentials] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [expiration, setExpiration] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => setCredentials(await api.getMyCredentials()), []);
  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!name.trim() || !expiration) { setError('Name and expiration date are required.'); return; }
    setSaving(true); setError(null);
    try {
      await api.addCredential({ credential_name: name.trim(), expiration_date: expiration, notes: notes || null });
    } catch (err) {
      setSaving(false); setError(err.message); return;
    }
    setSaving(false); setShowForm(false); setName(''); setExpiration(''); setNotes('');
    load();
  };

  const handleDelete = async (id) => { await api.deleteCredential(id); load(); };

  const inputStyle = { width: '100%', padding: isMobile ? '10px 12px' : '7px 10px', borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: isMobile ? 15 : 13, boxSizing: 'border-box' };

  return (
    <div>
      {showForm ? (
        <div style={{ padding: isMobile ? 16 : 20, border: `1.5px solid ${BRAND.box}`, borderRadius: 8, marginBottom: 20, background: '#fafafa' }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Credential Name</label>
            <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. CCC-SLP License, CPR Certification" />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Expiration Date</label>
            <input type="date" style={inputStyle} value={expiration} onChange={e => setExpiration(e.target.value)} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Notes (optional)</label>
            <input style={inputStyle} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Renew via ASHA" />
          </div>
          {error && <p style={{ color: '#dc2626', fontSize: 12.5, marginBottom: 10 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleAdd} disabled={saving} style={{ padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600, border: 'none', background: BRAND.forest, color: 'white', cursor: 'pointer' }}>
              {saving ? 'Saving...' : 'Add Credential'}
            </button>
            <button onClick={() => setShowForm(false)} disabled={saving} style={{ padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600, border: `1px solid ${BORDER}`, background: 'white', color: '#374151', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)} style={{ padding: isMobile ? '12px' : '9px 16px', borderRadius: 6, fontSize: isMobile ? 14.5 : 13, fontWeight: 600, border: 'none', background: BRAND.forest, color: 'white', cursor: 'pointer', marginBottom: 20, width: isMobile ? '100%' : 'auto' }}>
          + Add Credential
        </button>
      )}

      {credentials.length === 0 ? (
        <p style={{ fontSize: 13, color: BRAND.muted, textAlign: 'center', padding: 24 }}>No credentials on file yet.</p>
      ) : (
        credentials.map(c => {
          const remaining = daysUntil(c.expiration_date);
          const urgent = remaining <= 14;
          return (
            <div key={c.id} style={{ padding: '12px 4px', borderBottom: '1px solid #f1f2f4', display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: 8 }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#241A33' }}>{c.credential_name}</div>
                <div style={{ fontSize: 12, color: urgent ? '#991B1B' : BRAND.muted, marginTop: 2 }}>
                  Expires {formatDate(c.expiration_date)}{urgent && remaining >= 0 ? ` \u2014 ${remaining} day${remaining === 1 ? '' : 's'} left` : ''}{remaining < 0 ? ' \u2014 expired' : ''}
                </div>
                {c.notes && <div style={{ fontSize: 12, color: BRAND.muted, marginTop: 2 }}>{c.notes}</div>}
              </div>
              <button onClick={() => handleDelete(c.id)} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: `1px solid ${BORDER}`, background: 'white', color: '#991B1B', cursor: 'pointer' }}>Remove</button>
            </div>
          );
        })
      )}
    </div>
  );
}

export function ProfileTab({ profile, onUpdated, isMobile }) {
  const [phone, setPhone] = useState(profile.phone || '');
  const [email, setEmail] = useState(profile.email || '');
  const [preferredName, setPreferredName] = useState(profile.preferred_name || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true); setSaved(false);
    const updated = await api.updateMyProfile({ phone, email, preferred_name: preferredName });
    setSaving(false); setSaved(true);
    onUpdated(updated);
  };

  const inputStyle = { width: '100%', padding: isMobile ? '10px 12px' : '7px 10px', borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: isMobile ? 15 : 13, boxSizing: 'border-box' };
  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 };

  return (
    <div style={cardStyle()}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Legal Name</label>
          <input style={{ ...inputStyle, background: '#f3f4f6', color: BRAND.muted }} value={`${profile.first_name} ${profile.last_name}`} disabled />
        </div>
        <div>
          <label style={labelStyle}>Preferred Name</label>
          <input style={inputStyle} value={preferredName} onChange={e => setPreferredName(e.target.value)} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={labelStyle}>Phone</label>
          <input style={inputStyle} value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 555-5555" />
        </div>
        <div>
          <label style={labelStyle}>Email</label>
          <input type="email" style={inputStyle} value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
        </div>
      </div>
      <p style={{ fontSize: 12, color: BRAND.muted, marginBottom: 14 }}>
        Position, role, and provider link are managed by an admin. Contact an admin to change those.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={handleSave} disabled={saving} style={{ padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600, border: 'none', background: BRAND.forest, color: 'white', cursor: 'pointer' }}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        {saved && <span style={{ fontSize: 12.5, color: '#059669', fontWeight: 600 }}>Saved</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared layout pieces for the pages reached from the username menu
// (My profile, My time, ADMIN).
// ---------------------------------------------------------------------------

// Simple title strip for pages that don't use the full ProfileBanner.
export function PageHeader({ title, subtitle, isMobile }) {
  return (
    <div style={{ padding: isMobile ? '16px 16px 14px' : '20px 28px 16px', borderBottom: `1.5px solid ${BRAND.box}`, background: '#FCFBFE' }}>
      <h1 style={{ fontFamily: BRAND_SERIF, fontSize: isMobile ? 19 : 24, fontWeight: 700, color: '#241A33', margin: 0 }}>{title}</h1>
      {subtitle && <p style={{ fontSize: 12.5, color: BRAND.muted, margin: '4px 0 0' }}>{subtitle}</p>}
    </div>
  );
}

// Row of tabs under a page header. `tabs` is [{ key, label, badge? }].
export function TabStrip({ tabs, active, onChange, isMobile }) {
  return (
    <div role="tablist" style={{ display: 'flex', gap: isMobile ? 2 : 4, padding: isMobile ? '0 12px' : '0 28px', borderBottom: `1.5px solid ${BRAND.box}`, overflowX: 'auto' }}>
      {tabs.map(t => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.key)}
            style={{
              padding: isMobile ? '10px 10px' : '11px 14px', border: 'none', background: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              fontSize: isMobile ? 13 : 13.5, fontWeight: isActive ? 700 : 500,
              color: isActive ? BRAND.brassText : BRAND.muted,
              borderBottom: isActive ? `2.5px solid ${BRAND.forest}` : '2.5px solid transparent',
              marginBottom: -2, display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {t.label}
            {t.badge > 0 && <CountBadge count={t.badge} />}
          </button>
        );
      })}
    </div>
  );
}

export function CountBadge({ count }) {
  return (
    <span style={{ background: '#dc2626', color: 'white', fontSize: 10.5, fontWeight: 700, borderRadius: 999, minWidth: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', lineHeight: 1 }}>
      {count}
    </span>
  );
}

// Content area wrapper so every page has the same padding and width.
export function PageBody({ children, isMobile }) {
  return <div style={{ padding: isMobile ? 16 : '24px 28px 40px' }}>{children}</div>;
}

export const PAGE_WRAP_STYLE = { fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', maxWidth: 960, margin: '0 auto' };
