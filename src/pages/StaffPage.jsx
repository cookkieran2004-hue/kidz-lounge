import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { UserIcon, dateToInputValue, formatSlotLabel, DateField, TimeField } from './SchedulePage';
import { useSearchParams } from 'react-router-dom';
import { MeetingAgendaEditor } from '../MeetingAgenda';
import { useStaffDirectory, useStaffNames } from '../staffDirectory';
import { useAuth } from '../AuthContext';
import { Avatar } from '../Avatar';
import { timeTypeStyle } from '../timeTypes';

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
  const nameFor = useStaffNames();
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
              {nameFor(u)}
              <button type="button" onClick={() => toggle(u)} aria-label={`Remove ${nameFor(u)}`} style={{ border: 'none', background: 'none', cursor: 'pointer', color: BRAND.brassText, fontSize: 14, lineHeight: 1, padding: '0 4px' }}>&times;</button>
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
  const nameFor = useStaffNames();
  const isEditing = !!editingRequest;
  const isChange = !!changeOf;
  // Changing approved PTO/UPTO cancels it right away and files the change
  // as a new request (see POST /time-off/requests in the API).
  const cancelsOriginal = isChange && BALANCE_TYPES.includes(changeOf.request_type);
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

  // Employees get a heads-up -- never a block -- when a PTO/UPTO request
  // would take their balance below zero. That's allowed; it just needs an
  // admin's approval. (Admins get their own warning from the server.)
  const selfService = !adminMode && !editingRequest;
  const [myBalances, setMyBalances] = useState(null);
  useEffect(() => {
    if (!selfService) return undefined;
    let alive = true;
    api.getMyTimeOffBalances()
      .then(b => { if (alive) setMyBalances(Object.fromEntries((b || []).map(x => [x.balance_type, Number(x.balance_hours)]))); })
      .catch(() => {});
    return () => { alive = false; };
  }, [selfService]);
  const projected = (() => {
    if (!selfService || !myBalances || !isBalanceType || !startDate || !endDate || !balanceStartTime || !balanceEndTime) return null;
    const hours = requestHoursOf({ is_balance_type: true, start_date: startDate, end_date: endDate, start_time: balanceStartTime, end_time: balanceEndTime });
    if (!hours) return null;
    // Changing approved PTO/UPTO gives the original's hours back first.
    const refund = cancelsOriginal && changeOf.request_type === requestType ? requestHoursOf(changeOf) : 0;
    const current = Math.round(((myBalances[requestType] ?? 0) + refund) * 100) / 100;
    return { hours, current, refund, after: Math.round((current - hours) * 100) / 100 };
  })();

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
      record.confirm_negative_balance = confirmNegative;
    } else if (adminMode) Object.assign(record, { username: adminFor, confirm_negative_balance: confirmNegative });
    setSaving(true);
    try {
      if (isEditing) await api.editTimeOffRequest(editingRequest.id, record);
      else await api.submitTimeOffRequest(record);
    } catch (err) {
      setSaving(false);
      if (err.status === 409 && err.data?.negativeBalance) setNegativeWarning(err.data.negativeBalance);
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
            <DateField style={inputStyle} value={startDate} onChange={setStartDate} />
          </div>
          <div>
            <label style={labelStyle}>Start Time</label>
            <TimeField style={inputStyle} minHour={6} maxHour={21} value={balanceStartTime} onChange={setBalanceStartTime} />
          </div>
          <div>
            <label style={labelStyle}>End Date</label>
            <DateField style={inputStyle} value={endDate} onChange={setEndDate} />
          </div>
          <div>
            <label style={labelStyle}>End Time</label>
            <TimeField style={inputStyle} minHour={6} maxHour={21} value={balanceEndTime} onChange={setBalanceEndTime} />
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
                <DateField style={inputStyle} value={recurringStartDate} onChange={setRecurringStartDate} />
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Date</label>
              <DateField style={inputStyle} value={oooDate} onChange={setOooDate} />
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Start Time</label>
              <TimeField style={inputStyle} minHour={6} maxHour={21} value={startTime} onChange={setStartTime} />
            </div>
            <div>
              <label style={labelStyle}>End Time</label>
              <TimeField style={inputStyle} minHour={6} maxHour={21} value={endTime} onChange={setEndTime} />
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

      {projected && projected.after < 0 && (
        <div role="status" style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 12.5, color: '#92400E' }}>
          If approved, this leaves you at <b>{projected.after}h {requestType}</b>. You have {projected.current}h
          {projected.refund ? ` (including the ${projected.refund}h returned from the entry you're changing)` : ''} and this uses {projected.hours}h.
          {' '}That's allowed -- an admin just has to approve it.
        </div>
      )}

      {negativeWarning && (
        <div role="alert" style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#92400E', margin: '0 0 4px' }}>
            This will put {negativeWarning.username === me?.username ? 'you' : nameFor(negativeWarning.username)} below zero {negativeWarning.balance_type}
          </p>
          <p style={{ fontSize: 12.5, color: '#92400E', margin: '0 0 10px' }}>
            {negativeWarning.username === me?.username ? 'You have' : 'They have'} {fmtHours(negativeWarning.current_hours)}{isChange ? ' (counting the hours returned from the entry being changed)' : ''} and this uses {fmtHours(negativeWarning.hours_requested)}, which leaves {fmtHours(negativeWarning.resulting_hours)}. Going below zero is allowed with an admin's approval.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => handleSubmit(true)} disabled={saving} style={{ padding: '7px 14px', borderRadius: 6, fontSize: 12.5, fontWeight: 600, border: 'none', background: '#B45309', color: 'white', cursor: 'pointer' }}>
              {saving ? 'Saving...' : isChange ? 'Approve and save anyway' : 'Add anyway'}
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
            : cancelsOriginal
              ? `Submitting cancels your current ${changeOf.request_type} right away -- its hours go back to your balance and it comes off the schedule -- and sends this as a new request for approval. If it's denied, you won't have this time off.`
              : 'Changes to the date, time or type go to an admin for approval. Until then, the current entry stays on the schedule as it is.'}
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, flexDirection: isMobile ? 'column' : 'row' }}>
        <button onClick={() => handleSubmit(false)} disabled={saving || !!negativeWarning} style={{ padding: isMobile ? '11px' : '8px 16px', borderRadius: 6, fontSize: isMobile ? 14.5 : 13, fontWeight: 600, border: 'none', background: BRAND.forest, color: 'white', cursor: 'pointer' }}>
          {saving ? 'Saving...' : isEditing ? 'Save Changes' : isChange ? (changeApplies ? 'Save changes' : cancelsOriginal ? 'Cancel it and submit new request' : 'Submit change for approval') : adminMode ? 'Add time off' : 'Submit Request'}
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
  const nameFor = useStaffNames();
  if (requests.length === 0) {
    return <p style={{ fontSize: 13, color: BRAND.muted, textAlign: 'center', padding: 24 }}>Nothing here yet.</p>;
  }
  return (
    <div>
      {requests.map(req => (
        <div key={req.id} style={{ padding: '12px 4px', borderBottom: `1px solid #f1f2f4`, display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: 8 }}>
          <div>
            {showUsername && <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.forest, marginBottom: 2 }}>{nameFor(req.username)}</div>}
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
              <div style={{ fontSize: 12, color: BRAND.muted, marginTop: 2 }}>With {req.attendees.map(nameFor).join(', ')}</div>
            )}
            {req.created_by && req.created_by !== req.username && (
              <div style={{ fontSize: 12, color: BRAND.muted, marginTop: 2 }}>Added by {nameFor(req.created_by)}</div>
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
  const nameFor = useStaffNames();
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
                Organized by {nameFor(m.username)}
                {(m.attendees || []).length > 1 && <> &middot; with {m.attendees.map(nameFor).join(', ')}</>}
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

// `compact` (the My time dashboard): leaves out the intro and balance cards,
// which that page shows its own way. `openFormToken` opens the new-request
// form whenever it changes; `onChanged` fires after any submit or delete.
export function TimeOffTab({ isMobile, compact, openFormToken, onChanged }) {
  const { user: me } = useAuth();
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
  // A new token from the page (its "+ New request" button) opens the form.
  const [seenFormToken, setSeenFormToken] = useState(openFormToken);
  if (openFormToken !== seenFormToken) { setSeenFormToken(openFormToken); setShowForm(true); }
  const reload = () => { load(); onChanged?.(); };

  const handleDelete = async (id) => { await api.deleteTimeOffRequest(id); reload(); };

  return (
    <div>
      {!compact && (
        <p style={{ fontSize: 12.5, color: BRAND.muted, marginBottom: 16, maxWidth: 480 }}>
          Every kind of time away from the schedule -- vacation, sick time, a lunch break, a standing weekly commitment,
          anything -- starts as a request here and goes to an admin for approval before it appears on the calendar.
        </p>
      )}
      {!compact && <BalanceCards balances={balances} isMobile={isMobile} />}

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
          adminApplies={me?.role === 'admin'}
          initialDate={editDate}
          onDone={() => {
            closeEdit();
            setNotice(me?.role === 'admin'
              ? 'Your change is saved and on the schedule.'
              : BALANCE_TYPES.includes(editing.request_type)
                ? `Your original ${editing.request_type} was cancelled and its hours returned. The new request is waiting for approval.`
                : 'Change submitted. It will replace the current entry once an admin approves it.');
            reload();
          }}
          onCancel={() => { closeEdit(); load(); }}
        />
      ) : showForm ? (
        <RequestForm isMobile={isMobile} onSubmitted={() => { setShowForm(false); reload(); }} onCancel={() => setShowForm(false)} />
      ) : !compact && (
        <button onClick={() => setShowForm(true)} style={{ padding: isMobile ? '12px' : '9px 16px', borderRadius: 6, fontSize: isMobile ? 14.5 : 13, fontWeight: 600, border: 'none', background: BRAND.forest, color: 'white', cursor: 'pointer', marginBottom: 20, width: isMobile ? '100%' : 'auto' }}>
          + New Request
        </button>
      )}

      {compact ? (
        <RequestBoard
          requests={myRequests}
          isMobile={isMobile}
          formOpen={showForm || !!editing}
          onNew={() => { setNotice(null); setShowForm(true); }}
          onDelete={handleDelete}
          onChange={(req) => { setNotice(null); setShowForm(false); setEditing(req); }}
        />
      ) : (
        <>
          <RequestList requests={myRequests || []} isMobile={isMobile} onDelete={handleDelete} onChange={(req) => { setNotice(null); setShowForm(false); setEditing(req); }} />
          <MeetingsImIn isMobile={isMobile} />
        </>
      )}
    </div>
  );
}

// ---------- My time: requests as cards ----------
const REQUEST_STATUS = {
  approved: { bg: '#DCFAE6', fg: '#067647', label: 'Approved' },
  pending: { bg: '#FEF0C7', fg: '#93370D', label: 'Pending' },
  denied: { bg: '#FEE4E2', fg: '#B42318', label: 'Denied' },
};
const rDate = (s) => new Date(s + 'T00:00:00');
const rDay = (s) => rDate(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const rTime = (t) => (t ? formatSlotLabel(t.slice(0, 5)) : '');
function requestLastDay(r) { return r.is_balance_type ? r.end_date : r.is_recurring ? null : r.ooo_date; }
function requestFirstDay(r) { return r.is_balance_type ? r.start_date : r.is_recurring ? r.recurring_start_date : r.ooo_date; }
// Clock hours between start and end -- how the API counts PTO/UPTO.
function requestHoursOf(r) {
  if (!r.is_balance_type || !r.start_date || !r.end_date || !r.start_time || !r.end_time) return 0;
  return Math.max(0, Math.round(((new Date(`${r.end_date}T${r.end_time}`) - new Date(`${r.start_date}T${r.start_time}`)) / 3600000) * 100) / 100);
}
function requestWhen(r) {
  if (r.is_balance_type) {
    const hours = requestHoursOf(r);
    const span = r.start_date === r.end_date
      ? `${rDay(r.start_date)} · ${rTime(r.start_time)} – ${rTime(r.end_time)}`
      : `${rDay(r.start_date)}, ${rTime(r.start_time)} → ${rDay(r.end_date)}, ${rTime(r.end_time)}`;
    return hours ? `${span} · ${hours}h` : span;
  }
  if (r.is_recurring) return `Every ${WEEKDAY_LABELS[r.weekday]} · ${rTime(r.start_time)} – ${rTime(r.end_time)} · since ${rDay(r.recurring_start_date)}`;
  return `${rDay(r.ooo_date)} · ${rTime(r.start_time)} – ${rTime(r.end_time)}`;
}

function DateTile({ req }) {
  const s = timeTypeStyle(req.request_type);
  const first = requestFirstDay(req);
  const top = req.is_recurring ? 'EVERY' : first ? rDate(first).toLocaleDateString('en-US', { month: 'short' }).toUpperCase() : '';
  const big = req.is_recurring ? WEEKDAY_LABELS[req.weekday].slice(0, 3) : first ? rDate(first).getDate() : '–';
  return (
    <div aria-hidden="true" style={{ width: 52, flexShrink: 0, borderRadius: 12, background: s.bg, border: `1.5px solid ${s.border}`, textAlign: 'center', padding: '7px 0' }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.06em', color: s.text }}>{top}</div>
      <div style={{ fontFamily: BRAND_SERIF, fontSize: req.is_recurring ? 15 : 20, fontWeight: 700, color: s.text, lineHeight: 1.15 }}>{big}</div>
    </div>
  );
}

// One request as a card. Used by My time (your own requests) and by the
// admin time-off screens, which add who it's for, how it changes their
// balance, and the approval actions:
//   who          show the employee's name and avatar
//   balanceNote  { hours, type, current } for a pending PTO/UPTO request
//   onApprove / onDeny / onEdit   admin actions on a pending request
function RequestRow({ req, isMobile, onChange, onDelete, meeting, agendaOpen, onToggleAgenda, who, balanceNote, onApprove, onDeny, onEdit }) {
  const nameFor = useStaffNames();
  const [confirming, setConfirming] = useState(false);
  const s = timeTypeStyle(req.request_type);
  const st = REQUEST_STATUS[req.status] || REQUEST_STATUS.pending;
  const ghost = { padding: '7px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, border: '1px solid #E7E2F3', background: 'white', color: '#374151', cursor: 'pointer' };
  const pill = (bg, fg, text) => <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: bg, color: fg }}>{text}</span>;
  const after = balanceNote ? Math.round((balanceNote.current - balanceNote.hours) * 100) / 100 : null;
  return (
    <div style={{ border: `1px solid ${req.status === 'pending' && onApprove ? '#F5D9A8' : '#EEEAF6'}`, borderRadius: 14, padding: 14, background: 'white', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <DateTile req={req} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {who && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
            <Avatar name={nameFor(who)} size={22} />
            <span style={{ fontSize: 13, fontWeight: 700, color: BRAND.forest }}>{nameFor(who)}</span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14.5, fontWeight: 700, color: '#241A33' }}>{meeting ? 'Meeting' : s.label}</span>
          {pill(st.bg, st.fg, st.label)}
          {req.replaces_request_id && req.status === 'pending' && pill('#FFF4E5', '#B45309', 'Change request')}
          {req.has_pending_change && req.status === 'approved' && pill('#FFF4E5', '#B45309', 'Change pending')}
        </div>
        <div style={{ fontSize: 13, color: '#374151', marginTop: 3 }}>{requestWhen(req)}</div>
        {req.replaces_request_id && req.status === 'pending' && (
          <div style={{ fontSize: 12, color: BRAND.muted, marginTop: 3 }}>{req.original ? <>Replaces: {requestWhen(req.original)}</> : 'The entry it changes has since been removed.'}</div>
        )}
        {balanceNote && (
          <div style={{ fontSize: 12.5, marginTop: 5, color: after < 0 ? '#B42318' : '#374151' }}>
            Uses <b>{balanceNote.hours}h {balanceNote.type}</b> · balance {balanceNote.current}h → <b>{after}h</b>{after < 0 ? ' (below zero)' : ''}
          </div>
        )}
        {meeting && <div style={{ fontSize: 12, color: BRAND.muted, marginTop: 3 }}>Organized by {nameFor(req.username)}</div>}
        {(req.attendees || []).length > 0 && <div style={{ fontSize: 12, color: BRAND.muted, marginTop: 3 }}>With {req.attendees.map(nameFor).join(', ')}</div>}
        {req.created_by && req.created_by !== req.username && <div style={{ fontSize: 12, color: BRAND.muted, marginTop: 3 }}>Added by {nameFor(req.created_by)}</div>}
        {onApprove && req.status === 'pending' && req.requested_at && <div style={{ fontSize: 12, color: BRAND.muted, marginTop: 3 }}>Requested {rDay(String(req.requested_at).slice(0, 10))}</div>}
        {req.notes && <div style={{ fontSize: 12.5, color: '#4B4659', marginTop: 6, padding: '6px 10px', background: '#FAF9FD', borderRadius: 8, borderLeft: `3px solid ${s.border}` }}>{req.notes}</div>}
        {req.status === 'denied' && req.review_note && <div style={{ fontSize: 12.5, color: '#B42318', marginTop: 6 }}>Reason: {req.review_note}</div>}
        {agendaOpen && <div style={{ marginTop: 12 }}><MeetingAgendaEditor requestId={req.id} /></div>}
        {isMobile && <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>{actions()}</div>}
      </div>
      {!isMobile && <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 330 }}>{actions()}</div>}
    </div>
  );

  function actions() {
    if (meeting) {
      return <button type="button" onClick={onToggleAgenda} style={ghost}>{agendaOpen ? 'Hide agenda' : 'Agenda'}</button>;
    }
    if (confirming) {
      return (
        <>
          <span style={{ fontSize: 12.5, color: '#B42318', fontWeight: 600, alignSelf: 'center' }}>Delete this?</span>
          <button type="button" onClick={() => { setConfirming(false); onDelete(req.id); }} style={{ ...ghost, background: '#B42318', borderColor: '#B42318', color: 'white' }}>Delete</button>
          <button type="button" onClick={() => setConfirming(false)} style={ghost}>Keep</button>
        </>
      );
    }
    return (
      <>
        {req.status === 'pending' && onApprove && (
          <>
            <button type="button" onClick={() => onApprove(req.id)} style={{ ...ghost, background: '#067647', borderColor: '#067647', color: 'white' }}>Approve</button>
            <button type="button" onClick={() => onDeny(req.id)} style={ghost}>Deny</button>
          </>
        )}
        {req.status === 'pending' && onEdit && <button type="button" onClick={() => onEdit(req)} style={ghost}>Edit</button>}
        {req.status === 'approved' && !req.has_pending_change && onChange && <button type="button" onClick={() => onChange(req)} style={ghost}>Change</button>}
        {onDelete && <button type="button" onClick={() => setConfirming(true)} style={{ ...ghost, color: '#B42318' }}>Delete</button>}
      </>
    );
  }
}

// Pill-style tabs with a count on each, shared by My time and the admin lists.
function CountTabs({ tabs, active, onPick, counts, label }) {
  return (
    <div role="tablist" aria-label={label} style={{ display: 'inline-flex', padding: 3, borderRadius: 11, background: '#F3F0FA', gap: 2, flexWrap: 'wrap' }}>
      {tabs.map(t => {
        const on = t.key === active;
        return (
          <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => onPick(t.key)}
            style={{ padding: '7px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, background: on ? 'white' : 'transparent', color: on ? BRAND.forest : BRAND.muted, boxShadow: on ? '0 1px 3px rgba(36,26,51,0.12)' : 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {t.label}
            <span style={{ fontSize: 11, minWidth: 18, padding: '1px 6px', borderRadius: 999, background: on ? (t.key === 'pending' && counts[t.key] ? '#FEF0C7' : BRAND.tint) : 'rgba(255,255,255,0.7)', color: on ? (t.key === 'pending' && counts[t.key] ? '#93370D' : BRAND.forest) : BRAND.muted }}>{counts[t.key]}</span>
          </button>
        );
      })}
    </div>
  );
}

// Splits requests into the lists both boards show, each in a useful order:
// pending and upcoming soonest first, past and denied most recent first.
function groupRequests(list, today) {
  const first = (r) => requestFirstDay(r) || '';
  const ended = (r) => !r.is_recurring && (requestLastDay(r) || '') < today;
  const groups = {
    pending: list.filter(r => r.status === 'pending'),
    upcoming: list.filter(r => r.status === 'approved' && !ended(r)),
    past: list.filter(r => r.status === 'approved' && ended(r)),
    denied: list.filter(r => r.status === 'denied'),
  };
  groups.pending.sort((a, b) => first(a).localeCompare(first(b)));
  groups.upcoming.sort((a, b) => first(a).localeCompare(first(b)));
  groups.past.sort((a, b) => first(b).localeCompare(first(a)));
  groups.denied.sort((a, b) => first(b).localeCompare(first(a)));
  return groups;
}

function RequestBoard({ requests, isMobile, formOpen, onNew, onDelete, onChange }) {
  const [meetings, setMeetings] = useState([]);
  const [openAgenda, setOpenAgenda] = useState(null);
  useEffect(() => {
    let alive = true;
    api.getMyMeetings().then(m => { if (alive) setMeetings(m || []); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const g = groupRequests(requests || [], dateToInputValue(new Date()));
  const groups = {
    upcoming: g.upcoming,
    pending: g.pending,
    past: [...g.past, ...g.denied].sort((a, b) => (requestFirstDay(b) || '').localeCompare(requestFirstDay(a) || '')),
    meetings,
  };
  const tabs = [
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'pending', label: 'Pending' },
    { key: 'past', label: 'Past' },
    ...(meetings.length ? [{ key: 'meetings', label: "Meetings I'm in" }] : []),
  ];
  const [picked, setPicked] = useState(null);
  const tab = picked && groups[picked] ? picked : (groups.pending.length ? 'pending' : 'upcoming');
  const empty = {
    upcoming: 'No approved time off coming up.',
    pending: 'Nothing waiting on approval.',
    past: 'No past requests yet.',
    meetings: 'No meetings.',
  };

  if (requests === null) return <p style={{ fontSize: 13, color: BRAND.muted }}>Loading your requests...</p>;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <CountTabs tabs={tabs} active={tab} onPick={setPicked} label="Requests" counts={Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length]))} />
        {!formOpen && (
          <button type="button" onClick={onNew} style={{ padding: '8px 14px', borderRadius: 9, border: `1px solid ${BRAND.box}`, background: BRAND.tint, color: BRAND.forest, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', width: isMobile ? '100%' : 'auto' }}>
            + New request
          </button>
        )}
      </div>
      <div role="tabpanel" style={{ display: 'grid', gap: 10 }}>
        {groups[tab].length === 0 && (
          <div style={{ textAlign: 'center', padding: '28px 12px', border: '1.5px dashed #E7E2F3', borderRadius: 14, color: BRAND.muted, fontSize: 13 }}>{empty[tab]}</div>
        )}
        {groups[tab].map(r => (
          <RequestRow
            key={`${tab}-${r.id}`}
            req={r}
            isMobile={isMobile}
            meeting={tab === 'meetings'}
            agendaOpen={tab === 'meetings' && openAgenda === r.id}
            onToggleAgenda={() => setOpenAgenda(openAgenda === r.id ? null : r.id)}
            onChange={onChange}
            onDelete={onDelete}
          />
        ))}
      </div>
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
  const nameFor = useStaffNames();
  // Arriving from the schedule's "Edit on <name>'s profile" link (?edit=...)
  // means an approved entry, so start on the Upcoming list.
  const [addressParams] = useSearchParams();
  const [picked, setPicked] = useState(addressParams.get('edit') ? 'upcoming' : null);
  const [adding, setAdding] = useState(false);
  const [addFor, setAddFor] = useState(forUsername || '');
  const [staffOptions, setStaffOptions] = useState([]);
  const [addedNotice, setAddedNotice] = useState(null);
  const [nameQuery, setNameQuery] = useState('');
  const [balancesByUser, setBalancesByUser] = useState({});

  useEffect(() => {
    if (forUsername || !adding || staffOptions.length > 0) return;
    api.getStaff()
      .then(list => setStaffOptions((list || []).filter(s => !s.archived).sort((a, b) => staffOptionLabel(a).localeCompare(staffOptionLabel(b)))))
      .catch(() => setStaffOptions([]));
  }, [forUsername, adding, staffOptions.length]);

  const [requests, setRequests] = useState(null); // null until loaded
  const { editing: changing, setEditing: setChanging, editDate, notFound, close: closeChange } = useEditFromAddress(requests);
  const [denyingId, setDenyingId] = useState(null);
  const [denyNote, setDenyNote] = useState('');
  const [editingRequest, setEditingRequest] = useState(null);

  // Everything at once (every status), so each tab can show its count.
  const fetchRequests = useCallback(async () => {
    const all = await api.getAllTimeOffRequests(null);
    return forUsername ? all.filter(r => r.username === forUsername) : all;
  }, [forUsername]);
  const load = useCallback(() => fetchRequests().then(list => { setRequests(list); onChanged?.(); }), [fetchRequests, onChanged]);

  useEffect(() => {
    let alive = true;
    fetchRequests().then(list => { if (alive) { setRequests(list); onChanged?.(); } });
    return () => { alive = false; };
  }, [fetchRequests, onChanged]);

  // Current balances of everyone with a pending PTO/UPTO request, so each
  // one shows what approving it would leave them with.
  useEffect(() => {
    const users = [...new Set((requests || []).filter(r => r.status === 'pending' && r.is_balance_type).map(r => r.username))];
    if (!users.length) return undefined;
    let alive = true;
    Promise.all(users.map(u => api.getTimeOffBalancesFor(u).then(b => [u, Object.fromEntries((b || []).map(x => [x.balance_type, Number(x.balance_hours)]))]).catch(() => [u, null])))
      .then(entries => { if (alive) setBalancesByUser(Object.fromEntries(entries.filter(([, v]) => v))); });
    return () => { alive = false; };
  }, [requests]);

  const startAdding = () => { setAddedNotice(null); setAddFor(forUsername || ''); setAdding(true); };
  const handleAdded = (username) => {
    setAdding(false);
    setAddedNotice(`Time off added for ${nameFor(username)}. It's approved and on their schedule.`);
    setPicked('upcoming'); // it's approved, so it shows under Upcoming
    load();
    onAdded?.();
  };
  const handleApprove = async (id) => { await api.approveTimeOffRequest(id); load(); onAdded?.(); };
  const handleDenyConfirm = async () => { await api.denyTimeOffRequest(denyingId, denyNote); setDenyingId(null); setDenyNote(''); load(); };
  const handleDelete = async (id) => { await api.deleteTimeOffRequest(id); load(); onAdded?.(); };

  if (changing) {
    return (
      <div style={{ padding: embedded ? 0 : (isMobile ? 16 : '24px 28px 40px') }}>
        <EditTimeOffPanel
          key={changing.id}
          request={changing}
          isMobile={isMobile}
          adminApplies
          initialDate={editDate}
          onDone={() => { closeChange(); setAddedNotice(`Changes saved for ${nameFor(changing.username)}.`); load(); onAdded?.(); }}
          onCancel={() => { closeChange(); load(); }}
        />
      </div>
    );
  }

  if (editingRequest) {
    return (
      <div style={{ padding: embedded ? 0 : (isMobile ? 16 : '24px 28px 40px') }}>
        <p style={sectionHeaderStyle()}>Editing {nameFor(editingRequest.username)}'s request</p>
        <RequestForm
          isMobile={isMobile}
          editingRequest={editingRequest}
          onSubmitted={() => { setEditingRequest(null); load(); }}
          onCancel={() => setEditingRequest(null)}
        />
      </div>
    );
  }

  const q = nameQuery.trim().toLowerCase();
  const visible = (requests || []).filter(r => !q || nameFor(r.username).toLowerCase().includes(q) || r.username.toLowerCase().includes(q));
  const groups = groupRequests(visible, dateToInputValue(new Date()));
  const TABS = [
    { key: 'pending', label: 'Pending' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'past', label: 'Past' },
    { key: 'denied', label: 'Denied' },
  ];
  const tab = picked || (requests && groups.pending.length === 0 ? 'upcoming' : 'pending');
  const EMPTY = {
    pending: q ? 'No pending requests match that name.' : 'All caught up -- nothing waiting on approval.',
    upcoming: 'No approved time off coming up.',
    past: 'No past time off.',
    denied: 'No denied requests.',
  };
  const inputBox = { padding: isMobile ? '10px 12px' : '8px 11px', borderRadius: 9, border: '1px solid #E7E2F3', fontSize: isMobile ? 15 : 13, boxSizing: 'border-box' };

  return (
    <div style={{ padding: embedded ? 0 : (isMobile ? 16 : '24px 28px 40px') }}>
      {adding && (
        <div style={{ border: '1px solid #EEEAF6', borderRadius: 14, padding: 16, marginBottom: 16, background: '#FCFBFE' }}>
          <p style={{ ...sectionHeaderStyle(), marginBottom: 12 }}>Add time off{forUsername ? ` for ${nameFor(forUsername)}` : ''}</p>
          {!forUsername && (
            <div style={{ marginBottom: 12 }}>
              <label htmlFor="kl-add-time-off-for" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Employee</label>
              <select id="kl-add-time-off-for" value={addFor} onChange={e => setAddFor(e.target.value)} style={{ ...inputBox, width: '100%', maxWidth: 360 }}>
                <option value="">Choose an employee...</option>
                {staffOptions.map(s => <option key={s.username} value={s.username}>{staffOptionLabel(s)}</option>)}
              </select>
            </div>
          )}
          <RequestForm isMobile={isMobile} adminFor={addFor} onSubmitted={handleAdded} onCancel={() => setAdding(false)} />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <CountTabs tabs={TABS} active={tab} onPick={setPicked} label="Time off" counts={Object.fromEntries(TABS.map(t => [t.key, groups[t.key].length]))} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', width: isMobile ? '100%' : 'auto' }}>
          {!forUsername && (
            <input type="search" value={nameQuery} onChange={e => setNameQuery(e.target.value)} placeholder="Filter by name" aria-label="Filter by name" style={{ ...inputBox, width: isMobile ? '100%' : 180 }} />
          )}
          {!adding && (
            <button type="button" onClick={startAdding} style={{ padding: '8px 14px', borderRadius: 9, border: `1px solid ${BRAND.box}`, background: BRAND.tint, color: BRAND.forest, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', width: isMobile ? '100%' : 'auto' }}>
              + Add time off
            </button>
          )}
        </div>
      </div>

      {addedNotice && <p role="status" style={{ fontSize: 12.5, color: '#067647', fontWeight: 600, margin: '0 0 12px' }}>{addedNotice}</p>}
      {notFound && (
        <p style={{ fontSize: 12.5, color: '#92400E', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: '8px 12px' }}>
          That entry wasn't found here. It may have been changed or removed.
        </p>
      )}

      {requests === null ? (
        <p style={{ fontSize: 13, color: BRAND.muted }}>Loading time off...</p>
      ) : (
        <div role="tabpanel" style={{ display: 'grid', gap: 10 }}>
          {groups[tab].length === 0 && (
            <div style={{ textAlign: 'center', padding: '28px 12px', border: '1.5px dashed #E7E2F3', borderRadius: 14, color: BRAND.muted, fontSize: 13 }}>{EMPTY[tab]}</div>
          )}
          {groups[tab].map(r => {
            const bal = r.status === 'pending' && r.is_balance_type ? balancesByUser[r.username] : null;
            return (
              <RequestRow
                key={`${tab}-${r.id}`}
                req={r}
                isMobile={isMobile}
                who={forUsername ? null : r.username}
                balanceNote={bal && bal[r.request_type] !== undefined ? { hours: requestHoursOf(r), type: r.request_type, current: bal[r.request_type] } : null}
                onApprove={handleApprove}
                onDeny={(id) => setDenyingId(id)}
                onEdit={(req) => setEditingRequest(req)}
                onChange={(req) => { setAddedNotice(null); setChanging(req); }}
                onDelete={handleDelete}
              />
            );
          })}
        </div>
      )}

      {denyingId && (
        <div role="presentation" style={{ position: 'fixed', inset: 0, background: 'rgba(36,26,51,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 16 }} onClick={() => setDenyingId(null)}>
          <div role="dialog" aria-modal="true" aria-label="Deny request" style={{ background: 'white', borderRadius: 16, padding: 22, maxWidth: 420, width: '100%', boxShadow: '0 24px 60px rgba(36,26,51,0.3)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontFamily: BRAND_SERIF, fontSize: 19, fontWeight: 700, color: '#241A33', margin: '0 0 6px' }}>Deny this request?</h3>
            {(() => { const r = (requests || []).find(x => x.id === denyingId); return r ? <p style={{ fontSize: 13, color: BRAND.muted, margin: '0 0 12px' }}>{nameFor(r.username)} · {r.request_type} · {requestWhen(r)}</p> : null; })()}
            <textarea placeholder="Reason (optional, shown to the employee)" value={denyNote} onChange={e => setDenyNote(e.target.value)} style={{ width: '100%', minHeight: 80, padding: 10, borderRadius: 10, border: '1px solid #E7E2F3', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 14, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setDenyingId(null)} style={{ padding: '8px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600, border: '1px solid #E7E2F3', background: 'white', cursor: 'pointer' }}>Cancel</button>
              <button type="button" onClick={handleDenyConfirm} style={{ padding: '8px 14px', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', background: '#B42318', color: 'white', cursor: 'pointer' }}>Deny request</button>
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
    // Show the new time right away: the picker builds its next value from
    // what's shown, so picking an hour then a minute before the save
    // returns would otherwise save the old hour.
    if (!closed) setHours(prev => prev.map(h => (h.weekday === weekday ? { ...h, open_time: openTime, close_time: closeTime } : h)));
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
                  <TimeField style={inputStyle} floating minHour={6} maxHour={21} ariaLabel={`${label} opens`} value={day.open_time?.slice(0, 5)} onChange={v => handleSaveDay(weekday, v, day.close_time?.slice(0, 5), false)} />
                  <span style={{ fontSize: 12, color: BRAND.muted }}>to</span>
                  <TimeField style={inputStyle} floating minHour={6} maxHour={21} ariaLabel={`${label} closes`} value={day.close_time?.slice(0, 5)} onChange={v => handleSaveDay(weekday, day.open_time?.slice(0, 5), v, false)} />
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
        <DateField style={inputStyle} floating value={newClosureDate} onChange={setNewClosureDate} ariaLabel="Closure date" />
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

