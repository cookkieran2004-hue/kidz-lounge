import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { Avatar } from '../Avatar';
import { WarningIcon, SyringeIcon, refreshPatientAlerts } from '../patientAlerts';
import { DateField, TimeField } from './SchedulePage';
import { timeTypeStyle, monthlyAccrual } from '../timeTypes';

// ---------- Patient field option lists ----------
const SERVICES_OPTIONS = ['PT', 'OT', 'ST', 'SI'];
const PROGRAM_OPTIONS = ['EI', 'BCBS/Anthem', 'CIGNA', 'CPSE', 'CSE', 'GHI', 'P', 'PP', 'NONE'];
const RELATIONSHIP_OPTIONS = ['Father', 'Mother', 'Grandmother', 'Grandfather', 'Legal Guardian', 'Caregiver'];
const PATIENT_STATUS_OPTIONS = ['On Program', 'Awaiting Approval', 'Awaiting Family Paperwork', 'Awaiting Supervision Form', 'Off Program', 'Awaiting EI HUB'];
const IFSP_TYPE_OPTIONS = [
  'Initial (6mo PR)',
  'First Review (12mo PR)',
  'First Annual (6/18mo PR)',
  'Second Review (24/12 mo PR)',
  'Second Annual (30/6 mo PR)',
  'Third Review (36/12mo PR)',
];

// Program is stored as a comma-separated string in the existing text column
// (no schema change) so multiple selections like "EI, CIGNA" fit right in
// alongside pre-existing single-value data from the CSV import.
export function splitMultiValue(value) {
  if (!value) return [];
  return value.split(',').map(s => s.trim()).filter(Boolean);
}
function joinMultiValue(arr) {
  return arr.filter(Boolean).join(', ');
}

export function programColor(programValue) {
  const map = {
    EI: '#3b82f6', 'BCBS/Anthem': '#059669', CIGNA: '#059669', CPSE: '#8b5cf6', CSE: '#8b5cf6',
    GHI: '#059669', P: '#059669', PP: '#059669', NONE: '#6b7280',
  };
  const first = splitMultiValue(programValue)[0];
  return map[first] || '#6b7280';
}
export function serviceColor(serviceValue) {
  const map = { PT: '#059669', OT: '#f59e0b', ST: '#ec4899', SI: '#0ea5e9' };
  return map[serviceValue] || '#6b7280';
}

function addDaysToDateStr(dateStr, days) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDateMMDDYYYY(dateStr) {
  if (!dateStr) return '\u2014';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!match) return dateStr;
  const [, year, month, day] = match;
  return `${month}.${day}.${year}`;
}

// ---------- Patient filtering: presets + search + column filter ----------
const INSURANCE_PROGRAM_VALUES = ['BCBS/Anthem', 'BCBS/Anthen', 'PP', 'P', 'GHI', 'CIGNA'];

export const PATIENT_PRESETS = [
  { key: 'all', label: 'All' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'ei', label: 'Early Intervention' },
];

export const PATIENT_FILTER_COLUMNS = [
  { key: 'Name', label: 'Name' },
  { key: 'mrn', label: 'MRN' },
  { key: 'Program', label: 'Program' },
  { key: 'Status', label: 'Status' },
  { key: 'Parent_Name', label: 'Parent Name' },
  { key: 'Relationship_To_Patient', label: 'Relationship' },
  { key: 'Parent_Phone', label: 'Parent Phone' },
  { key: 'Parent_Email', label: 'Parent Email' },
  { key: 'SC_Admin_Name', label: 'SC / Admin' },
  { key: 'SC_Admin_Phone', label: 'SC / Admin Phone' },
  { key: 'SC_Admin_Email', label: 'SC / Admin Email' },
  { key: 'Services', label: 'Services' },
  { key: 'Mandate', label: 'Mandate' },
  { key: 'Case_Manager', label: 'Case Manager' },
  { key: 'ID_Number', label: 'ID #' },
  { key: 'Date_of_Birth', label: 'Date of Birth' },
  { key: 'IFSP_Type', label: 'IFSP Type' },
  { key: 'IFSP_Start_Date', label: 'IFSP Start Date' },
  { key: 'IFSP_End_Date', label: 'IFSP End Date' },
  { key: 'RX_Date', label: 'RX Date' },
  { key: 'RX_Expiration', label: 'RX Expiration' },
  { key: 'Report_Date', label: 'Report Date' },
  { key: 'Picture_Consent', label: 'Picture Consent' },
  { key: 'Allergies', label: 'Allergies' },
  { key: 'Immunizations', label: 'Immunizations' },
  { key: 'Scheduling_Notes', label: 'Notes' },
  { key: 'Google_Link', label: 'Google Link' },
];

function patientFieldToString(patient, key) {
  const val = patient[key];
  if (val === null || val === undefined) return '';
  if (key === 'Picture_Consent') return val === true ? 'yes' : val === false ? 'no' : '';
  return String(val);
}

export function matchesPreset(patient, presetKey) {
  const programValues = splitMultiValue(patient.Program).map(v => v.toLowerCase());
  switch (presetKey) {
    case 'insurance':
      return INSURANCE_PROGRAM_VALUES.some(v => programValues.includes(v.toLowerCase()));
    case 'ei':
      return programValues.includes('ei');
    case 'all':
    default:
      return true;
  }
}

// Filters by the real staff link (case_manager_username), not the legacy
// display text -- an empty selection means "any case manager."
export function matchesCaseManager(patient, username) {
  if (!username) return true;
  return (patient.case_manager_username || '') === username;
}

// "On program" is the default, everyday view -- anything not explicitly
// marked Off Program counts, same rule used everywhere else in the app
// (patient search, compliance tasks).
export function matchesOnProgram(patient, showAll) {
  if (showAll) return true;
  return patient.Status !== 'Off Program';
}

export function matchesSearchText(patient, text) {
  const needle = text.trim().toLowerCase();
  if (!needle) return true;
  return PATIENT_FILTER_COLUMNS.some(col => patientFieldToString(patient, col.key).toLowerCase().includes(needle));
}

export function matchesColumnFilter(patient, column, value) {
  if (!column || !value.trim()) return true;
  return patientFieldToString(patient, column).toLowerCase().includes(value.trim().toLowerCase());
}

// ---------- shared styles (kept local to this page) ----------
export function pageWrap() {
  return { padding: 24, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', maxWidth: 900, margin: '0 auto' };
}
export function pillTabsWrap() {
  return { display: 'inline-flex', gap: 4, background: '#f1f2f4', borderRadius: 8, padding: 3, marginBottom: 20 };
}
export function pillTabStyle(active) {
  return {
    border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 600,
    background: active ? 'white' : 'transparent',
    color: active ? '#111827' : '#6b7280',
    boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
  };
}
export function primaryBtnStyle() {
  return { padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: '#111827', color: 'white' };
}
export function rowStyle() {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 14px', borderRadius: 8, border: '1px solid #e2e4e9', marginBottom: 8, background: 'white',
  };
}
export function smallBtnStyle(danger) {
  return {
    padding: '5px 10px', borderRadius: 6, fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
    border: '1px solid ' + (danger ? '#fecaca' : '#e2e4e9'),
    background: danger ? '#fef2f2' : 'white',
    color: danger ? '#dc2626' : '#374151',
    marginLeft: 8,
  };
}
export function presetTabsWrap() {
  return { display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10, borderBottom: '1px solid #e2e4e9', paddingBottom: 10 };
}
export function presetTabStyle(active) {
  return {
    border: 'none', borderRadius: 999, padding: '5px 12px', fontSize: 12.5, cursor: 'pointer', fontWeight: 600,
    background: active ? '#111827' : '#f1f2f4',
    color: active ? 'white' : '#6b7280',
  };
}
export function filterBarStyle() {
  return { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' };
}
export function filterInputStyle(width) {
  return { padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e4e9', fontSize: 13, width, boxSizing: 'border-box' };
}
function modalOverlayStyle() {
  return { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 };
}
function modalBoxStyle() {
  return {
    background: 'white', borderRadius: 12, padding: 20, width: '100%', maxWidth: 460,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    boxShadow: '0 20px 40px rgba(0,0,0,0.15)', maxHeight: '85vh', overflowY: 'auto',
  };
}
function labelStyle() {
  return { display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginTop: 12, marginBottom: 4 };
}
function inputStyle() {
  return { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e4e9', fontSize: 13.5, boxSizing: 'border-box' };
}
function modalBtnStyle(primary, danger) {
  return {
    padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
    border: primary || danger ? 'none' : '1px solid #e2e4e9',
    background: danger ? '#dc2626' : primary ? '#111827' : 'white',
    color: danger || primary ? 'white' : '#374151',
  };
}

// ---------- Provider modal (create / edit / delete) ----------
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Lets an admin set a provider's contracted hours per weekday. Saving
// computes the gap against office hours and creates new Unavailable
// blocks for anything not already covered -- it never touches or deletes
// existing blocks, including ones hand-edited afterward.
export function UsualScheduleEditor({ providerName, embedded }) {
  const [schedule, setSchedule] = useState(null);
  const [days, setDays] = useState({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getProviderUsualSchedule(providerName).then(rows => {
      setSchedule(rows);
      setDays(Object.fromEntries(rows.map(r => [r.weekday, { start_time: r.start_time.slice(0, 5), end_time: r.end_time.slice(0, 5) }])));
    });
  }, [providerName]);

  const toggleDay = (weekday) => {
    setDays(d => {
      const next = { ...d };
      if (next[weekday]) delete next[weekday];
      else next[weekday] = { start_time: '09:00', end_time: '17:00' };
      return next;
    });
  };

  const updateDayTime = (weekday, field, value) => {
    setDays(d => ({ ...d, [weekday]: { ...d[weekday], [field]: value } }));
  };

  const handleSave = async () => {
    setSaving(true); setError(null); setResult(null);
    const scheduleArray = Object.entries(days).map(([weekday, times]) => ({ weekday: Number(weekday), start_time: times.start_time, end_time: times.end_time }));
    try {
      await api.setProviderUsualSchedule(providerName, scheduleArray);
      setResult(true);
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  };

  if (schedule === null) return null;

  return (
    <div style={embedded ? undefined : { marginTop: 16, paddingTop: 12, borderTop: '1px solid #e2e4e9' }}>
      {!embedded && <label style={labelStyle()}>Usual (Contracted) Schedule</label>}
      {!embedded && <p style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 0, marginBottom: 10 }}>
        Days not checked mean this provider isn't contracted at all that day. Non-contracted hours are shown
        directly on the schedule, computed live from this -- nothing else needs to be kept in sync.
      </p>}
      {WEEKDAY_SHORT.map((label, weekday) => {
        const day = days[weekday];
        return (
          <div key={weekday} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, width: 90, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!day} onChange={() => toggleDay(weekday)} />
              <span style={{ fontSize: 13 }}>{label}</span>
            </label>
            {day && (
              <>
                <TimeField floating minHour={6} maxHour={21} ariaLabel={`${label} start`} style={{ ...inputStyle(), width: 'auto' }} value={day.start_time} onChange={v => updateDayTime(weekday, 'start_time', v)} />
                <span style={{ fontSize: 12, color: '#9ca3af' }}>to</span>
                <TimeField floating minHour={6} maxHour={21} ariaLabel={`${label} end`} style={{ ...inputStyle(), width: 'auto' }} value={day.end_time} onChange={v => updateDayTime(weekday, 'end_time', v)} />
              </>
            )}
          </div>
        );
      })}
      {error && <p style={{ color: '#dc2626', fontSize: 12.5, marginTop: 6 }}>{error}</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
        <button type="button" onClick={handleSave} disabled={saving} style={modalBtnStyle()}>{saving ? 'Saving...' : 'Save Schedule'}</button>
        {result && <span style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>Saved</span>}
      </div>
    </div>
  );
}

// ---------- Scheduled changes to contracted hours ----------
// A change has a start date, an optional end date (temporary, e.g. summer
// hours) and its own weekly hours. On any date, the change that started
// most recently among those covering it applies; with none, the standing
// hours (UsualScheduleEditor) do. The schedule's gray shading and
// "outside contracted hours" conflicts follow whichever applies each day.
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatLongDate(dateStr) {
  return dateStr ? new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
}
function formatHour(t) {
  const [h, m] = (t || '').slice(0, 5).split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function changeStatus(c, today) {
  if (c.start_date > today) return { key: 'upcoming', label: 'Upcoming', color: '#1D4ED8', bg: '#EFF6FF' };
  if (c.end_date && c.end_date < today) return { key: 'ended', label: 'Ended', color: '#6b7280', bg: '#F3F4F6' };
  return { key: 'active', label: 'In effect now', color: '#067647', bg: '#ECFDF3' };
}

// Checkbox + start/end time per weekday. `days` is { weekday: { start_time, end_time } }.
function WeeklyHoursRows({ days, onChange }) {
  const toggle = (wd) => {
    const next = { ...days };
    if (next[wd]) delete next[wd]; else next[wd] = { start_time: '09:00', end_time: '17:00' };
    onChange(next);
  };
  const setTime = (wd, field, value) => onChange({ ...days, [wd]: { ...days[wd], [field]: value } });
  return (
    <div>
      {WEEKDAY_SHORT.map((label, wd) => (
        <div key={wd} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, width: 90, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!days[wd]} onChange={() => toggle(wd)} />
            <span style={{ fontSize: 13 }}>{label}</span>
          </label>
          {days[wd] && (
            <>
              <TimeField floating minHour={6} maxHour={21} ariaLabel={`${WEEKDAY_LONG[wd]} start`} style={{ ...inputStyle(), width: 'auto' }} value={days[wd].start_time} onChange={v => setTime(wd, 'start_time', v)} />
              <span style={{ fontSize: 12, color: '#9ca3af' }}>to</span>
              <TimeField floating minHour={6} maxHour={21} ariaLabel={`${WEEKDAY_LONG[wd]} end`} style={{ ...inputStyle(), width: 'auto' }} value={days[wd].end_time} onChange={v => setTime(wd, 'end_time', v)} />
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function scheduleToDays(schedule) {
  return Object.fromEntries((schedule || []).map(r => [Number(r.weekday), { start_time: (r.start_time || '').slice(0, 5), end_time: (r.end_time || '').slice(0, 5) }]));
}

function ScheduleChangeForm({ providerName, existing, onDone, onCancel }) {
  const today = localToday();
  const [startDate, setStartDate] = useState(existing?.start_date || '');
  const [hasEnd, setHasEnd] = useState(!!existing?.end_date);
  const [endDate, setEndDate] = useState(existing?.end_date || '');
  const [days, setDays] = useState(existing ? scheduleToDays(existing.schedule) : null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // A new change starts from the standing hours, so only the differences need typing.
  useEffect(() => {
    if (existing) return;
    api.getProviderUsualSchedule(providerName).then(rows => setDays(scheduleToDays(rows))).catch(() => setDays({}));
  }, [existing, providerName]);

  const save = async () => {
    setError(null);
    if (!startDate) { setError('Choose the date the new hours start.'); return; }
    if (hasEnd && !endDate) { setError('Choose the last day of the temporary hours, or untick "Ends on".'); return; }
    if (hasEnd && endDate < startDate) { setError('The end date is before the start date.'); return; }
    for (const [wd, t] of Object.entries(days || {})) {
      if (!t.start_time || !t.end_time || t.end_time <= t.start_time) { setError(`${WEEKDAY_LONG[wd]}: the end time must be after the start time.`); return; }
    }
    const record = {
      start_date: startDate,
      end_date: hasEnd ? endDate : null,
      schedule: Object.entries(days || {}).map(([wd, t]) => ({ weekday: Number(wd), start_time: t.start_time, end_time: t.end_time })),
    };
    setSaving(true);
    try {
      const res = existing ? await api.updateScheduleChange(existing.id, record) : await api.createScheduleChange(providerName, record);
      onDone(res.changes);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div style={{ border: '1.5px solid #D6CCEF', borderRadius: 10, padding: 14, background: '#FCFBFE', marginBottom: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end', marginBottom: 12 }}>
        <div>
          <label htmlFor="kl-change-start" style={labelStyle()}>New hours start</label>
          <DateField id="kl-change-start" floating style={{ ...inputStyle(), width: 'auto', minWidth: 170 }} value={startDate} min={existing ? undefined : today} onChange={setStartDate} />
        </div>
        <div>
          <label style={{ ...labelStyle(), display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={hasEnd} onChange={e => setHasEnd(e.target.checked)} />
            Ends on (temporary)
          </label>
          <DateField ariaLabel="Last day of these hours" floating disabled={!hasEnd} style={{ ...inputStyle(), width: 'auto', minWidth: 170 }} value={endDate} min={startDate || undefined} onChange={setEndDate} />
        </div>
      </div>
      <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 8px' }}>
        {hasEnd
          ? 'After the end date, the hours go back to whatever applied before.'
          : 'Permanent: these hours apply from the start date on (until another change).'}
        {' '}Unchecked days mean not contracted that day.
      </p>
      {days === null ? <p style={{ fontSize: 12.5, color: '#9ca3af' }}>Loading...</p> : <WeeklyHoursRows days={days} onChange={setDays} />}
      {error && <p role="alert" style={{ color: '#dc2626', fontSize: 12.5, margin: '8px 0 0' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="button" onClick={save} disabled={saving || days === null} style={modalBtnStyle(true)}>{saving ? 'Saving...' : existing ? 'Save change' : 'Schedule change'}</button>
        <button type="button" onClick={onCancel} disabled={saving} style={modalBtnStyle()}>Cancel</button>
      </div>
    </div>
  );
}

export function ScheduleChangesEditor({ providerName }) {
  const [changes, setChanges] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // 'new' | change object
  const [showPast, setShowPast] = useState(false);
  const today = localToday();

  useEffect(() => {
    api.getScheduleChanges(providerName).then(setChanges).catch(err => { setError(err.message); setChanges([]); });
  }, [providerName]);

  const remove = async (c) => {
    const when = c.end_date ? `${formatLongDate(c.start_date)} \u2013 ${formatLongDate(c.end_date)}` : `from ${formatLongDate(c.start_date)}`;
    if (!window.confirm(`Delete the hours change ${when}? The schedule will use whatever hours applied without it.`)) return;
    try { setChanges((await api.deleteScheduleChange(c.id)).changes); } catch (err) { setError(err.message); }
  };

  if (changes === null) return <p style={{ fontSize: 12.5, color: '#9ca3af' }}>Loading...</p>;
  const current = changes.filter(c => changeStatus(c, today).key !== 'ended');
  const past = changes.filter(c => changeStatus(c, today).key === 'ended').reverse();

  const card = (c) => {
    const status = changeStatus(c, today);
    return (
      <div key={c.id} style={{ border: '1px solid #E7E2F3', borderRadius: 10, padding: '10px 12px', marginBottom: 8, background: 'white' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 13.5, color: '#241A33' }}>
            {c.end_date ? `${formatLongDate(c.start_date)} \u2013 ${formatLongDate(c.end_date)}` : `From ${formatLongDate(c.start_date)}`}
          </strong>
          <span style={{ fontSize: 11, color: '#6b7280' }}>{c.end_date ? 'Temporary' : 'Permanent'}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: status.color, background: status.bg, borderRadius: 999, padding: '2px 8px' }}>{status.label}</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button type="button" onClick={() => setEditing(c)} style={smallBtnStyle(false)}>Edit</button>
            <button type="button" onClick={() => remove(c)} style={smallBtnStyle(true)}>Delete</button>
          </span>
        </div>
        <div style={{ fontSize: 12.5, color: '#4b5563', marginTop: 4 }}>
          {c.schedule.length === 0
            ? 'Not contracted any day'
            : c.schedule.map(d => `${WEEKDAY_SHORT[d.weekday]} ${formatHour(d.start_time)}\u2013${formatHour(d.end_time)}`).join(' \u00b7 ')}
        </div>
      </div>
    );
  };

  return (
    <div>
      {error && <p role="alert" style={{ color: '#dc2626', fontSize: 12.5 }}>{error}</p>}
      {current.map(c => (editing && editing !== 'new' && editing.id === c.id
        ? <ScheduleChangeForm key={c.id} providerName={providerName} existing={c} onDone={(list) => { setChanges(list); setEditing(null); }} onCancel={() => setEditing(null)} />
        : card(c)))}
      {current.length === 0 && editing !== 'new' && <p style={{ fontSize: 12.5, color: '#9ca3af', margin: '0 0 10px' }}>No changes scheduled. The standing hours apply.</p>}
      {editing === 'new' ? (
        <ScheduleChangeForm providerName={providerName} onDone={(list) => { setChanges(list); setEditing(null); }} onCancel={() => setEditing(null)} />
      ) : (
        <button type="button" onClick={() => setEditing('new')} style={modalBtnStyle()}>+ Schedule a change</button>
      )}
      {past.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button type="button" onClick={() => setShowPast(v => !v)} style={{ border: 'none', background: 'none', color: '#6D28D9', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
            {showPast ? 'Hide' : 'Show'} {past.length} past {past.length === 1 ? 'change' : 'changes'}
          </button>
          {showPast && <div style={{ marginTop: 8 }}>{past.map(c => (editing && editing !== 'new' && editing.id === c.id
            ? <ScheduleChangeForm key={c.id} providerName={providerName} existing={c} onDone={(list) => { setChanges(list); setEditing(null); }} onCancel={() => setEditing(null)} />
            : card(c)))}</div>}
        </div>
      )}
    </div>
  );
}

export function ProviderModal({ existing, onClose, onSaved }) {
  const [firstName, setFirstName] = useState(existing ? (existing.first_name || '') : '');
  const [lastName, setLastName] = useState(existing ? (existing.last_name || '') : '');
  const [specialty, setSpecialty] = useState(existing ? (existing.specialty || '') : '');
  const [credentials, setCredentials] = useState(existing ? (existing.credentials || '') : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [linkedCount, setLinkedCount] = useState(null);
  const [linkedStaff, setLinkedStaff] = useState(null);

  const handleSave = async () => {
    if (!existing && (!firstName.trim() || !lastName.trim())) {
      setError('First name and last name are required.');
      return;
    }
    setSaving(true); setError(null);
    const payload = {
      first_name: firstName.trim() || undefined, last_name: lastName.trim() || undefined,
      specialty: specialty.trim() || undefined, credentials: credentials.trim() || undefined,
    };
    try {
      if (existing) await api.updateProvider(existing.id, payload);
      else await api.createProvider(payload);
    } catch (err) {
      setSaving(false); setError(err.message); return;
    }
    setSaving(false);
    onSaved();
  };

  const handleDelete = async (force = false) => {
    setSaving(true); setError(null);
    try {
      await api.deleteProvider(existing.id, force);
    } catch (err) {
      setSaving(false);
      if (err.status === 409 && err.data?.blocked) {
        setLinkedCount(err.data.linkedCount);
        return;
      }
      if (err.status === 409 && err.data?.linkedStaff) {
        setLinkedStaff(err.data.linkedStaff);
        return;
      }
      setError(err.message);
      return;
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div style={modalOverlayStyle()} onClick={onClose}>
      <div style={modalBoxStyle()} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 17, fontWeight: 700, marginTop: 0, marginBottom: 4, color: '#111827' }}>
          {existing ? 'Edit Provider' : 'Add Provider'}
        </h2>
        {existing && (
          <p style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 0, marginBottom: 16 }}>
            Currently on file: <strong>{existing.Name}</strong>
            {(!existing.first_name || !existing.last_name) && ' -- fill in the structured fields below to update it.'}
          </p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle()}>First Name {!existing && '*'}</label>
            <input style={inputStyle()} value={firstName} onChange={e => setFirstName(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle()}>Last Name {!existing && '*'}</label>
            <input style={inputStyle()} value={lastName} onChange={e => setLastName(e.target.value)} />
          </div>
        </div>
        {!existing && (
          <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 4, marginBottom: 0 }}>
            Renaming an existing provider later will automatically update their name on all existing appointments and out-of-office entries.
          </p>
        )}

        <label style={labelStyle()}>Specialty</label>
        <input style={inputStyle()} value={specialty} onChange={e => setSpecialty(e.target.value)} placeholder="e.g. Speech-Language Pathology" />

        <label style={labelStyle()}>Credentials</label>
        <input style={inputStyle()} value={credentials} onChange={e => setCredentials(e.target.value)} placeholder="e.g. MS, CCC-SLP" />

        {existing && <UsualScheduleEditor providerName={existing.Name} />}

        {error && <p style={{ color: '#dc2626', fontSize: 13 }}>{error}</p>}

        {confirmingDelete ? (
          <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca' }}>
            {linkedStaff !== null ? (
              <>
                <p style={{ fontSize: 13, color: '#991b1b', margin: '0 0 10px 0', fontWeight: 500 }}>
                  This provider is linked to {linkedStaff.length === 1 ? 'a staff account' : `${linkedStaff.length} staff accounts`} ({linkedStaff.join(', ')}).
                  Deleting will unlink {linkedStaff.length === 1 ? 'that account' : 'those accounts'} from this provider, which affects their schedule access and document signing.
                </p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => { setConfirmingDelete(false); setLinkedStaff(null); }} disabled={saving} style={modalBtnStyle()}>Cancel</button>
                  <button onClick={() => handleDelete(true)} disabled={saving} style={modalBtnStyle(false, true)}>
                    {saving ? 'Deleting...' : 'Delete Anyway'}
                  </button>
                </div>
              </>
            ) : linkedCount !== null ? (
              <>
                <p style={{ fontSize: 13, color: '#991b1b', margin: '0 0 10px 0', fontWeight: 500 }}>
                  This provider has {linkedCount} appointment{linkedCount === 1 ? '' : 's'} on record and can't be deleted --
                  that would permanently disconnect real appointment history from a provider record. If they're no longer
                  seeing patients, just leave them out of new scheduling going forward.
                </p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => { setConfirmingDelete(false); setLinkedCount(null); }} disabled={saving} style={modalBtnStyle(false, true)}>Got it</button>
                </div>
              </>
            ) : (
              <>
                <p style={{ fontSize: 13, color: '#991b1b', margin: '0 0 10px 0', fontWeight: 500 }}>
                  Delete this provider? This can't be undone.
                </p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => setConfirmingDelete(false)} disabled={saving} style={modalBtnStyle()}>Cancel</button>
                  <button onClick={() => handleDelete(false)} disabled={saving} style={modalBtnStyle(false, true)}>
                    {saving ? 'Deleting...' : 'Yes, Delete'}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
            {existing ? (
              <button onClick={() => setConfirmingDelete(true)} disabled={saving} style={modalBtnStyle(false, true)}>Delete</button>
            ) : <div />}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onClose} style={modalBtnStyle()}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={modalBtnStyle(true)}>
                {saving ? 'Saving...' : existing ? 'Save' : 'Add'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Patient modal (create / edit / delete) ----------
function blankPatientForm() {
  return {
    Name: '', Date_of_Birth: '', Services: [], Program: [], Mandate: '',
    Parent_Name: '', Relationship_To_Patient: '', Parent_Phone: '', Parent_Email: '',
    Status: '', SC_Admin_Name: '', SC_Admin_Phone: '', SC_Admin_Email: '',
    Scheduling_Notes: '', Case_Manager: '', case_manager_username: '', ID_Number: '',
    RX_Date: '', RX_Expiration: '', IFSP_Start_Date: '', IFSP_End_Date: '', IFSP_Type: '', Report_Date: '',
    Picture_Consent: '', Google_Link: '', Allergies: '', Immunizations: '',
  };
}

function patientToForm(p) {
  const form = blankPatientForm();
  Object.keys(form).forEach(key => {
    if (key === 'Picture_Consent') {
      form[key] = p[key] === true ? 'yes' : p[key] === false ? 'no' : '';
    } else if (key === 'Services' || key === 'Program') {
      form[key] = splitMultiValue(p[key]);
    } else {
      form[key] = p[key] ?? '';
    }
  });
  return form;
}

function formToPayload(form) {
  const payload = { ...form };
  payload.Picture_Consent = form.Picture_Consent === 'yes' ? true : form.Picture_Consent === 'no' ? false : null;
  payload.Services = joinMultiValue(form.Services);
  payload.Program = joinMultiValue(form.Program);
  return payload;
}

// ---------- EMR-style visual language, scoped to the Patient form ----------
const EMR_PRIMARY = '#6D28D9';
const EMR_ACCENT = '#0EA5E9';
const EMR_BORDER = '#E2E8F0';
const EMR_MUTED = '#64748B';
const EMR_INK = '#0F172A';
const EMR_SURFACE = '#F8FAFC';

function emrOverlayStyle() {
  return { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 20 };
}
function emrModalBoxStyle() {
  return {
    background: 'white', borderRadius: 14, width: '100%', maxWidth: 760, maxHeight: '92vh', overflowY: 'auto',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    boxShadow: '0 30px 70px rgba(15, 23, 42, 0.22)', border: `1px solid ${EMR_BORDER}`,
  };
}
function emrLabelStyle() {
  return { display: 'block', fontSize: 11, fontWeight: 600, color: EMR_MUTED, marginBottom: 5, letterSpacing: '0.01em' };
}
function emrInputStyle() {
  return {
    width: '100%', padding: '9px 11px', borderRadius: 8, fontSize: 13.5, boxSizing: 'border-box',
    border: `1.5px solid ${EMR_BORDER}`, background: '#FDFDFE', outline: 'none', color: EMR_INK,
    fontFamily: 'inherit',
  };
}
function emrFieldGrid(cols) {
  return { display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 14, marginBottom: 14 };
}
function emrBtnStyle(primary, danger) {
  return {
    padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
    border: primary ? 'none' : danger ? `1.5px solid #FCA5A5` : `1.5px solid ${EMR_BORDER}`,
    background: primary ? EMR_PRIMARY : danger ? '#FEF2F2' : 'white',
    color: primary ? 'white' : danger ? '#DC2626' : '#334155',
  };
}
function emrLockedFieldStyle() {
  return {
    width: '100%', padding: '9px 11px', borderRadius: 8, fontSize: 13.5, boxSizing: 'border-box',
    border: `1.5px dashed ${EMR_BORDER}`, background: EMR_SURFACE, color: '#334155',
    display: 'flex', alignItems: 'center', gap: 6,
  };
}

function EMRSectionHeading({ index, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: index === 0 ? '0 0 14px' : '26px 0 14px' }}>
      <span style={{
        width: 20, height: 20, borderRadius: 6, background: EMR_PRIMARY, color: 'white', fontSize: 10.5, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {index}
      </span>
      <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#334155' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: EMR_BORDER }} />
    </div>
  );
}

function MultiSelectChips({ options, selected, onToggle }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
      {options.map(opt => {
        const isSelected = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            style={{
              padding: '6px 13px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              border: `1.5px solid ${isSelected ? EMR_PRIMARY : EMR_BORDER}`,
              background: isSelected ? EMR_PRIMARY : 'white',
              color: isSelected ? 'white' : '#475569',
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}
          >
            {isSelected && <span style={{ fontSize: 11, lineHeight: 1 }}>&#10003;</span>}
            {opt}
          </button>
        );
      })}
    </div>
  );
}

export function PatientModal({ existing, onClose, onSaved }) {
  const { user: currentUser } = useAuth();
  const [form, setForm] = useState(existing ? patientToForm(existing) : blankPatientForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [linkedCount, setLinkedCount] = useState(null);
  const [confirmingPassword, setConfirmingPassword] = useState(false);
  const [staffDirectory, setStaffDirectory] = useState([]);

  useEffect(() => {
    api.getStaffDirectory().then(setStaffDirectory).catch(() => {});
  }, []);

  const setField = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const toggleMultiField = (key, value) => {
    setForm(f => {
      const current = f[key];
      const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
      return { ...f, [key]: next };
    });
  };

  // RX Expiration auto-populates to 364 days after RX Date; Report Date
  // auto-populates to 21 days before IFSP End Date. Both stay fully editable
  // afterward -- they're smart defaults, not locked calculations.
  const setRXDate = (value) => {
    setForm(f => ({ ...f, RX_Date: value, RX_Expiration: value ? addDaysToDateStr(value, 364) : f.RX_Expiration }));
  };
  const setIFSPEndDate = (value) => {
    setForm(f => ({ ...f, IFSP_End_Date: value, Report_Date: value ? addDaysToDateStr(value, -21) : f.Report_Date }));
  };

  const handleSave = async () => {
    if (!form.Name.trim()) { setError('Name is required.'); return; }
    // Only editing an EXISTING patient requires password confirmation --
    // creating a brand-new one does not.
    if (existing) {
      setError(null);
      setConfirmingPassword(true);
      return;
    }
    setSaving(true); setError(null);
    const payload = formToPayload(form);
    let saved;
    try {
      saved = await api.createPatient(payload);
    } catch (err) {
      setSaving(false); setError(err.message); return;
    }
    setSaving(false);
    refreshPatientAlerts();
    onSaved(saved);
  };

  const performEditSave = async (adminPassword) => {
    const payload = { ...formToPayload(form), admin_password: adminPassword };
    const saved = await api.updatePatient(existing.id, payload);
    setConfirmingPassword(false);
    refreshPatientAlerts();
    onSaved(saved);
  };

  const handleDelete = async () => {
    setSaving(true); setError(null);
    try {
      await api.deletePatient(existing.id);
    } catch (err) {
      setSaving(false);
      if (err.status === 409 && err.data?.blocked) {
        setLinkedCount(err.data.linkedCount);
        return;
      }
      setError(err.message);
      return;
    }
    setSaving(false);
    onSaved();
  };

  // Deletion is blocked outright once a patient has appointment history --
  // this is the alternative: reuses the exact same password-confirmed save
  // flow as any other edit, just with Status pre-set to Off Program.
  const handleSetOffProgram = () => {
    setForm(f => ({ ...f, Status: 'Off Program' }));
    setConfirmingDelete(false);
    setLinkedCount(null);
    setConfirmingPassword(true);
  };

  return (
    <div style={emrOverlayStyle()} onClick={onClose}>
      <div style={emrModalBoxStyle()} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '20px 28px', borderBottom: `1px solid ${EMR_BORDER}`, position: 'sticky', top: 0, background: 'white', zIndex: 2, borderRadius: '14px 14px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: `linear-gradient(135deg, ${EMR_PRIMARY}, ${EMR_ACCENT})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ color: 'white', fontSize: 15, fontWeight: 700 }}>+</span>
            </div>
            <div>
              <h2 style={{ fontSize: 16.5, fontWeight: 700, margin: 0, color: EMR_INK }}>
                {existing ? 'Edit Patient Record' : 'New Patient Record'}
              </h2>
              {existing ? (
                <p style={{ fontSize: 11.5, color: EMR_MUTED, margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: EMR_PRIMARY }}>MRN {existing.mrn || '\u2014'}</span>
                  <span>&middot; Renaming updates appointments automatically</span>
                </p>
              ) : (
                <p style={{ fontSize: 11.5, color: EMR_MUTED, margin: '2px 0 0' }}>
                  A unique MRN will be assigned automatically once saved.
                </p>
              )}
            </div>
          </div>
        </div>

        <div style={{ padding: '20px 28px 26px' }}>
          <EMRSectionHeading index={1} label="Patient Information" />
          <label style={emrLabelStyle()}>Patient Name *</label>
          <input style={{ ...emrInputStyle(), marginBottom: 14 }} value={form.Name} onChange={e => setField('Name', e.target.value)} placeholder="Full name" />

          <label style={emrLabelStyle()}>Date of Birth</label>
          <DateField yearNav clearable style={{ ...emrInputStyle(), marginBottom: 14, maxWidth: 220 }} ariaLabel="Date of Birth" value={form.Date_of_Birth} onChange={v => setField('Date_of_Birth', v)} />

          <label style={emrLabelStyle()}>Services</label>
          <div style={{ marginBottom: 14 }}>
            <MultiSelectChips options={SERVICES_OPTIONS} selected={form.Services} onToggle={v => toggleMultiField('Services', v)} />
          </div>

          <label style={emrLabelStyle()}>Program</label>
          <div style={{ marginBottom: 14 }}>
            <MultiSelectChips options={PROGRAM_OPTIONS} selected={form.Program} onToggle={v => toggleMultiField('Program', v)} />
          </div>

          <label style={emrLabelStyle()}>Status</label>
          <select style={{ ...emrInputStyle(), marginBottom: 14, maxWidth: 320 }} value={form.Status} onChange={e => setField('Status', e.target.value)}>
            <option value="">-- select --</option>
            {PATIENT_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <label style={emrLabelStyle()}>Mandate</label>
          <input style={emrInputStyle()} value={form.Mandate} onChange={e => setField('Mandate', e.target.value)} />

          <EMRSectionHeading index={2} label="Parent / Guardian" />
          <div style={emrFieldGrid(2)}>
            <div>
              <label style={emrLabelStyle()}>Parent Name</label>
              <input style={emrInputStyle()} value={form.Parent_Name} onChange={e => setField('Parent_Name', e.target.value)} />
            </div>
            <div>
              <label style={emrLabelStyle()}>Relationship to Patient</label>
              <select style={emrInputStyle()} value={form.Relationship_To_Patient} onChange={e => setField('Relationship_To_Patient', e.target.value)}>
                <option value="">-- select --</option>
                {RELATIONSHIP_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label style={emrLabelStyle()}>Parent Phone #</label>
              <input style={emrInputStyle()} value={form.Parent_Phone} onChange={e => setField('Parent_Phone', e.target.value)} />
            </div>
            <div>
              <label style={emrLabelStyle()}>Parent Email</label>
              <input style={emrInputStyle()} value={form.Parent_Email} onChange={e => setField('Parent_Email', e.target.value)} />
            </div>
          </div>

          <EMRSectionHeading index={3} label="Care Coordination" />
          <div style={emrFieldGrid(3)}>
            <div>
              <label style={emrLabelStyle()}>SC / Admin Name</label>
              <input style={emrInputStyle()} value={form.SC_Admin_Name} onChange={e => setField('SC_Admin_Name', e.target.value)} />
            </div>
            <div>
              <label style={emrLabelStyle()}>SC / Admin Phone #</label>
              <input style={emrInputStyle()} value={form.SC_Admin_Phone} onChange={e => setField('SC_Admin_Phone', e.target.value)} />
            </div>
            <div>
              <label style={emrLabelStyle()}>SC / Admin Email</label>
              <input style={emrInputStyle()} value={form.SC_Admin_Email} onChange={e => setField('SC_Admin_Email', e.target.value)} />
            </div>
          </div>

          <label style={emrLabelStyle()}>Notes</label>
          <textarea
            style={{ ...emrInputStyle(), minHeight: 64, resize: 'vertical', marginBottom: 14 }}
            value={form.Scheduling_Notes}
            onChange={e => setField('Scheduling_Notes', e.target.value)}
          />

          <div style={emrFieldGrid(2)}>
            <div>
              <label style={emrLabelStyle()}>Case Manager</label>
              <select
                style={emrInputStyle()}
                value={form.case_manager_username || (form.Case_Manager === 'Not Needed' ? '__NOT_NEEDED__' : '')}
                onChange={e => {
                  const val = e.target.value;
                  if (val === '__NOT_NEEDED__') {
                    setForm(f => ({ ...f, case_manager_username: '', Case_Manager: 'Not Needed' }));
                  } else if (val === '') {
                    setForm(f => ({ ...f, case_manager_username: '', Case_Manager: '' }));
                  } else {
                    const staff = staffDirectory.find(s => s.username === val);
                    setForm(f => ({ ...f, case_manager_username: val, Case_Manager: staff ? staff.display_name : '' }));
                  }
                }}
              >
                <option value="">-- Not Assigned --</option>
                <option value="__NOT_NEEDED__">Not Needed</option>
                {staffDirectory.map(s => <option key={s.username} value={s.username}>{s.display_name}</option>)}
              </select>
            </div>
            <div>
              <label style={emrLabelStyle()}>ID #</label>
              <input style={emrInputStyle()} value={form.ID_Number} onChange={e => setField('ID_Number', e.target.value)} />
            </div>
          </div>

          <EMRSectionHeading index={4} label="Prescription (RX)" />
          <div style={emrFieldGrid(2)}>
            <div>
              <label style={emrLabelStyle()}>RX Date</label>
              <DateField yearNav clearable style={emrInputStyle()} ariaLabel="RX Date" value={form.RX_Date} onChange={setRXDate} />
            </div>
            <div>
              <label style={emrLabelStyle()}>RX Expiration</label>
              <div style={emrLockedFieldStyle()}>
                <span style={{ fontSize: 12 }}>&#128274;</span>
                {formatDateMMDDYYYY(form.RX_Expiration)}
              </div>
              <p style={{ fontSize: 10.5, color: EMR_MUTED, margin: '4px 0 0' }}>Calculated automatically: 364 days after RX Date.</p>
            </div>
          </div>

          <EMRSectionHeading index={5} label="IFSP" />
          <div style={emrFieldGrid(2)}>
            <div>
              <label style={emrLabelStyle()}>IFSP Start Date</label>
              <DateField yearNav clearable style={emrInputStyle()} ariaLabel="IFSP Start Date" value={form.IFSP_Start_Date} onChange={v => setField('IFSP_Start_Date', v)} />
            </div>
            <div>
              <label style={emrLabelStyle()}>IFSP End Date</label>
              <DateField yearNav clearable style={emrInputStyle()} ariaLabel="IFSP End Date" value={form.IFSP_End_Date} onChange={setIFSPEndDate} />
            </div>
          </div>
          <label style={emrLabelStyle()}>IFSP Type</label>
          <select style={{ ...emrInputStyle(), marginBottom: 14 }} value={form.IFSP_Type} onChange={e => setField('IFSP_Type', e.target.value)}>
            <option value="">-- select --</option>
            {IFSP_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <label style={emrLabelStyle()}>Report Date</label>
          <div style={{ ...emrLockedFieldStyle(), maxWidth: 220 }}>
            <span style={{ fontSize: 12 }}>&#128274;</span>
            {formatDateMMDDYYYY(form.Report_Date)}
          </div>
          <p style={{ fontSize: 10.5, color: EMR_MUTED, margin: '4px 0 0' }}>Calculated automatically: 21 days before IFSP End Date.</p>

          <EMRSectionHeading index={6} label="Consent & Documentation" />
          <div style={emrFieldGrid(2)}>
            <div>
              <label style={emrLabelStyle()}>Picture Consent</label>
              <select style={emrInputStyle()} value={form.Picture_Consent} onChange={e => setField('Picture_Consent', e.target.value)}>
                <option value="">-- unspecified --</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            <div>
              <label style={emrLabelStyle()}>Google Link</label>
              <input style={emrInputStyle()} value={form.Google_Link} onChange={e => setField('Google_Link', e.target.value)} placeholder="https://..." />
            </div>
          </div>

          <EMRSectionHeading index={7} label="Allergies & Immunizations" />
          <p style={{ fontSize: 11.5, color: EMR_MUTED, margin: '-4px 0 10px' }}>
            Anything entered here shows as a yellow alert on the patient chart and on their schedule appointments. Leave blank if none.
          </p>
          <div style={emrFieldGrid(2)}>
            <div>
              <label htmlFor="kl-patient-allergies" style={{ ...emrLabelStyle(), display: 'flex', alignItems: 'center', gap: 5 }}>
                <WarningIcon size={13} color="#A16207" /> Allergies
              </label>
              <textarea id="kl-patient-allergies" style={{ ...emrInputStyle(), minHeight: 60, resize: 'vertical' }} value={form.Allergies} onChange={e => setField('Allergies', e.target.value)} placeholder="e.g. Peanuts (EpiPen in backpack)" />
            </div>
            <div>
              <label htmlFor="kl-patient-immunizations" style={{ ...emrLabelStyle(), display: 'flex', alignItems: 'center', gap: 5 }}>
                <SyringeIcon size={13} color="#A16207" /> Immunizations
              </label>
              <textarea id="kl-patient-immunizations" style={{ ...emrInputStyle(), minHeight: 60, resize: 'vertical' }} value={form.Immunizations} onChange={e => setField('Immunizations', e.target.value)} placeholder="e.g. Not up to date: MMR" />
            </div>
          </div>

          {error && <p style={{ color: '#dc2626', fontSize: 13, marginTop: 14 }}>{error}</p>}

          {confirmingDelete ? (
            <div style={{ marginTop: 20, padding: 14, borderRadius: 10, background: '#FEF2F2', border: '1.5px solid #FCA5A5' }}>
              {linkedCount !== null ? (
                <>
                  <p style={{ fontSize: 13, color: '#991b1b', margin: '0 0 10px 0', fontWeight: 500 }}>
                    This patient has {linkedCount} appointment{linkedCount === 1 ? '' : 's'} on record and can't be deleted --
                    that would permanently erase their treatment history. Set their status to Off Program instead to keep
                    their record while marking them as no longer active.
                  </p>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={() => { setConfirmingDelete(false); setLinkedCount(null); }} disabled={saving} style={emrBtnStyle()}>Cancel</button>
                    <button onClick={handleSetOffProgram} disabled={saving} style={emrBtnStyle(false, true)}>
                      Set to Off Program
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 13, color: '#991b1b', margin: '0 0 10px 0', fontWeight: 500 }}>
                    Delete this patient? This can't be undone.
                  </p>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={() => setConfirmingDelete(false)} disabled={saving} style={emrBtnStyle()}>Cancel</button>
                    <button onClick={handleDelete} disabled={saving} style={emrBtnStyle(false, true)}>
                      {saving ? 'Deleting...' : 'Yes, Delete'}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 22, paddingTop: 18, borderTop: `1px solid ${EMR_BORDER}` }}>
              {existing ? (
                <button onClick={() => setConfirmingDelete(true)} disabled={saving} style={emrBtnStyle(false, true)}>Delete</button>
              ) : <div />}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={onClose} style={emrBtnStyle()}>Cancel</button>
                <button onClick={handleSave} disabled={saving} style={emrBtnStyle(true)}>
                  {saving ? 'Saving...' : existing ? 'Save' : 'Add Patient'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {confirmingPassword && (
        <PasswordConfirmModal
          expectedUsername={currentUser?.username}
          actionLabel="Confirm your identity to save these changes to this patient's record."
          onConfirm={performEditSave}
          onCancel={() => setConfirmingPassword(false)}
        />
      )}
    </div>
  );
}


// ---------- Staff modal (admin only: create / edit role / reset password / delete) ----------
export function generateTempPassword() {
  // Simple readable temp password: two words + a number. Not meant to be
  // memorable long-term -- the staff member sets their own real password
  // immediately after their first login.
  const words = ['maple', 'coral', 'ember', 'birch', 'cedar', 'plaza', 'amber', 'delta', 'quartz', 'ridge'];
  const w1 = words[Math.floor(Math.random() * words.length)];
  const w2 = words[Math.floor(Math.random() * words.length)];
  const n = Math.floor(1000 + Math.random() * 9000);
  return `${w1}-${w2}-${n}`;
}

// Shared security confirmation used before any sensitive save (staff
// account changes, patient edits). Requires the CURRENT user to type their
// own username (client-side check) and password; the actual verification
// happens server-side as part of the real save request, since the backend
// already knows who's asking (via the JWT) and just needs the password.
export function PasswordConfirmModal({ expectedUsername, actionLabel, onConfirm, onCancel }) {
  const BRAND_PURPLE = '#7c3aed';
  const BRAND_PURPLE_DARK = '#6d28d9';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState(null);
  const [focusedField, setFocusedField] = useState(null);
  const [btnHover, setBtnHover] = useState(false);

  const handleConfirm = async () => {
    if (username.trim() !== expectedUsername) {
      setError('That username does not match your account. Enter your own username to confirm.');
      return;
    }
    if (!password) {
      setError('Password is required.');
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      await onConfirm(password);
    } catch (err) {
      setError(err.message);
    }
    setVerifying(false);
  };

  const inputStyle = (focused) => ({
    width: '100%', padding: '10px 12px', borderRadius: 10, fontSize: 14, boxSizing: 'border-box',
    border: `1.5px solid ${focused ? BRAND_PURPLE : '#e2e4e9'}`,
    outline: 'none',
    boxShadow: focused ? '0 0 0 3px rgba(124, 58, 237, 0.12)' : 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  });
  const labelStyle2 = () => ({ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginTop: 14, marginBottom: 5 });

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10050, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(15, 10, 30, 0.45)', padding: 20,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          position: 'relative', overflow: 'hidden', background: 'white', borderRadius: 20, padding: '32px 28px 28px',
          width: '100%', maxWidth: 360, boxShadow: '0 20px 50px rgba(109, 40, 217, 0.18), 0 2px 8px rgba(0,0,0,0.06)',
          border: '1px solid #f1eafe',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ position: 'absolute', top: '-15%', right: '-10%', width: 180, height: 180, borderRadius: '50%', background: BRAND_PURPLE, opacity: 0.08, filter: 'blur(60px)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10,
            background: `linear-gradient(135deg, ${BRAND_PURPLE}, ${BRAND_PURPLE_DARK})`, boxShadow: '0 4px 14px rgba(124, 58, 237, 0.3)',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: '0 0 3px' }}>Confirm It's You</h2>
          <p style={{ fontSize: 12.5, color: '#9ca3af', margin: 0, maxWidth: 280 }}>
            {actionLabel || 'Enter your username and password to confirm this change.'}
          </p>
        </div>

        <div style={{ position: 'relative', marginTop: 6 }}>
          <label style={labelStyle2()}>Username</label>
          <input
            style={inputStyle(focusedField === 'username')}
            value={username}
            onChange={e => setUsername(e.target.value)}
            onFocus={() => setFocusedField('username')}
            onBlur={() => setFocusedField(null)}
            autoFocus
          />

          <label style={labelStyle2()}>Password</label>
          <input
            style={inputStyle(focusedField === 'password')}
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onFocus={() => setFocusedField('password')}
            onBlur={() => setFocusedField(null)}
            onKeyDown={e => { if (e.key === 'Enter') handleConfirm(); }}
          />

          {error && <p style={{ color: '#dc2626', fontSize: 13, marginTop: 12, marginBottom: 0 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <button
              onClick={onCancel}
              style={{
                flex: 1, padding: '11px 14px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                border: '1.5px solid #e2e4e9', background: 'white', color: '#374151',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={verifying}
              onMouseEnter={() => setBtnHover(true)}
              onMouseLeave={() => setBtnHover(false)}
              style={{
                flex: 1, padding: '11px 14px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                cursor: verifying ? 'default' : 'pointer', border: 'none', color: 'white',
                background: btnHover && !verifying
                  ? `linear-gradient(135deg, ${BRAND_PURPLE_DARK}, ${BRAND_PURPLE_DARK})`
                  : `linear-gradient(135deg, ${BRAND_PURPLE}, ${BRAND_PURPLE_DARK})`,
                boxShadow: '0 4px 14px rgba(124, 58, 237, 0.28)',
                transition: 'background 0.15s, transform 0.1s',
                transform: btnHover && !verifying ? 'translateY(-1px)' : 'none',
                opacity: verifying ? 0.75 : 1,
              }}
            >
              {verifying ? 'Verifying...' : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Lets an admin directly correct a staff member's PTO balances -- mainly
// for giving someone their real starting balance, since a brand-new
// account (or one that existed before this system) starts at zero. Each
// row saves independently, right away, rather than bundling into the
// bigger password-confirmed staff-edit save below -- correcting a balance
// isn't the same kind of sensitive change as editing role or position.
// Balances as cards (same look as My time), each adjustable in place --
// e.g. to give someone their real starting balance.
export function TimeOffBalanceEditor({ username, embedded }) {
  const [balances, setBalances] = useState(null);
  const [editingType, setEditingType] = useState(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedType, setSavedType] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    api.getTimeOffBalancesFor(username).then(b => { if (alive) setBalances(b); }).catch(() => { if (alive) setBalances([]); });
    return () => { alive = false; };
  }, [username]);

  const startEdit = (b) => { setEditingType(b.balance_type); setDraft(String(b.balance_hours)); setSavedType(null); setError(null); };
  const handleSave = async (type) => {
    const value = parseFloat(draft);
    if (Number.isNaN(value)) { setError('Enter a number of hours.'); return; }
    setSaving(true);
    try {
      await api.setTimeOffBalance(username, type, value);
      setBalances(list => list.map(b => (b.balance_type === type ? { ...b, balance_hours: value } : b)));
      setEditingType(null); setSavedType(type);
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  };

  if (!balances) return null;
  const serif = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';

  return (
    <div style={embedded ? undefined : { marginTop: 16, paddingTop: 12, borderTop: '1px solid #e2e4e9' }}>
      {!embedded && <label style={labelStyle()}>Time Off Balances</label>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
        {balances.map(b => {
          const s = timeTypeStyle(b.balance_type);
          const hours = Number(b.balance_hours);
          const isEditing = editingType === b.balance_type;
          return (
            <div key={b.balance_type} style={{ position: 'relative', overflow: 'hidden', border: '1px solid #E7E2F3', borderRadius: 14, padding: '14px 14px 12px 18px', background: 'white', boxShadow: '0 1px 2px rgba(36,26,51,0.04)' }}>
              <div style={{ position: 'absolute', inset: '0 auto 0 0', width: 4, background: s.border }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: s.accent }}>{b.balance_type === 'PTO' ? 'PAID TIME OFF' : b.balance_type === 'UPTO' ? 'UNPAID TIME OFF' : b.balance_type}</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: s.bg, color: s.text }}>+{monthlyAccrual(b.balance_type)}h / month</span>
              </div>
              {isEditing ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  <input
                    type="number" step="0.25" autoFocus aria-label={`${b.balance_type} hours`}
                    value={draft} onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSave(b.balance_type); if (e.key === 'Escape') setEditingType(null); }}
                    style={{ ...inputStyle(), width: 96 }}
                  />
                  <span style={{ fontSize: 12, color: '#6b7280' }}>hours</span>
                  <button type="button" onClick={() => handleSave(b.balance_type)} disabled={saving} style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: '#6D28D9', color: 'white', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>{saving ? 'Saving...' : 'Save'}</button>
                  <button type="button" onClick={() => setEditingType(null)} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #E7E2F3', background: 'white', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>Cancel</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontFamily: serif, fontSize: 30, fontWeight: 700, color: hours < 0 ? '#B42318' : '#241A33', lineHeight: 1.15 }}>{hours}</span>
                  <span style={{ fontSize: 12.5, color: '#6B6280' }}>hours</span>
                  <span style={{ fontSize: 12, color: '#6B6280' }}>· ≈ {(hours / 8).toFixed(1)} days</span>
                  <button type="button" onClick={() => startEdit(b)} style={{ marginLeft: 'auto', padding: '5px 10px', borderRadius: 8, border: '1px solid #E7E2F3', background: 'white', color: '#374151', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>Adjust</button>
                </div>
              )}
              {savedType === b.balance_type && !isEditing && <div role="status" style={{ fontSize: 12, color: '#067647', fontWeight: 600, marginTop: 4 }}>Saved</div>}
              {isEditing && error && <div role="alert" style={{ fontSize: 12, color: '#B42318', marginTop: 4 }}>{error}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function StaffModal({ existing, providers, onClose, onSaved }) {
  const { user: currentUser } = useAuth();
  const [firstName, setFirstName] = useState(existing ? (existing.first_name || '') : '');
  const [middleName, setMiddleName] = useState(existing ? (existing.middle_name || '') : '');
  const [lastName, setLastName] = useState(existing ? (existing.last_name || '') : '');
  const [preferredName, setPreferredName] = useState(existing ? (existing.preferred_name || '') : '');
  const [position, setPosition] = useState(existing ? (existing.position || '') : '');
  const [hireDate, setHireDate] = useState(existing ? (existing.hire_date || '') : '');
  const [role, setRole] = useState(existing ? existing.role : 'staff');
  const [providerName, setProviderName] = useState(existing ? (existing.provider_name || '') : '');
  const [tempPassword, setTempPassword] = useState(existing ? '' : generateTempPassword());
  const [resettingPassword, setResettingPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // 'save' | 'archive' | null -- which action is awaiting password confirmation
  const [createdCreds, setCreatedCreds] = useState(null); // shown once, right after creating a new account
  const [copied, setCopied] = useState(false);

  const requestSave = () => {
    if (!existing && (!firstName.trim() || !middleName.trim() || !lastName.trim() || !position.trim() || !tempPassword)) {
      setError('First name, middle name, last name, position, and a temporary password are all required for a new account.');
      return;
    }
    if (existing && resettingPassword && !tempPassword) {
      setError('Enter a new temporary password.');
      return;
    }
    setError(null);
    setPendingAction('save');
  };

  const performSave = async (adminPassword) => {
    if (existing) {
      const payload = {
        role, provider_name: providerName || '', admin_password: adminPassword,
        first_name: firstName.trim() || undefined, middle_name: middleName.trim() || undefined,
        last_name: lastName.trim() || undefined, preferred_name: preferredName.trim() || undefined,
        position: position.trim() || undefined, hire_date: hireDate || '',
      };
      if (resettingPassword) payload.reset_temporary_password = tempPassword;
      const updated = await api.updateStaff(existing.id, payload);
      setPendingAction(null);
      if (resettingPassword) {
        setCreatedCreds({ username: updated.username, tempPassword });
        return;
      }
      onSaved();
    } else {
      const created = await api.createStaff({
        first_name: firstName.trim(), middle_name: middleName.trim(), last_name: lastName.trim(),
        preferred_name: preferredName.trim() || undefined, position: position.trim(), hire_date: hireDate || undefined,
        temporary_password: tempPassword, role, provider_name: providerName || '', admin_password: adminPassword,
      });
      setPendingAction(null);
      setCreatedCreds({ username: created.username, tempPassword });
    }
  };

  const requestArchiveToggle = () => setPendingAction('archive');

  const performArchiveToggle = async (adminPassword) => {
    await api.updateStaff(existing.id, { archived: !existing.archived, admin_password: adminPassword });
    setPendingAction(null);
    onSaved();
  };

  // After creating an account (or resetting a password), show the credentials
  // once so they can be handed to the staff member -- they aren't retrievable
  // again after this, since only the hash is stored.
  if (createdCreds) {
    const handleCopy = () => {
      const text = `Username: ${createdCreds.username}\nPassword: ${createdCreds.tempPassword}`;
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    };
    return (
      <div style={modalOverlayStyle()} onClick={onSaved}>
        <div style={modalBoxStyle()} onClick={e => e.stopPropagation()}>
          <h2 style={{ fontSize: 17, fontWeight: 700, marginTop: 0, marginBottom: 8, color: '#111827' }}>
            {existing ? 'Password Reset' : 'Account Created'}
          </h2>
          <p style={{ fontSize: 13, color: '#374151' }}>
            Share these credentials with {createdCreds.username}. They'll be required to set their own
            password the first time they sign in.
          </p>
          <div style={{ background: '#f9fafb', border: '1px solid #e2e4e9', borderRadius: 8, padding: 12, marginTop: 8 }}>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Username</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 8, fontFamily: 'monospace' }}>{createdCreds.username}</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Temporary Password</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', fontFamily: 'monospace' }}>{createdCreds.tempPassword}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
            <button onClick={handleCopy} style={modalBtnStyle()}>
              {copied ? 'Copied!' : 'Copy to Clipboard'}
            </button>
            <button onClick={onSaved} style={modalBtnStyle(true)}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={modalOverlayStyle()} onClick={onClose}>
      <div style={modalBoxStyle()} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 17, fontWeight: 700, marginTop: 0, marginBottom: 4, color: '#111827' }}>
          {existing ? 'Edit Staff Account' : 'Add Staff Account'}
        </h2>
        {existing?.archived && (
          <p style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', margin: '0 0 12px' }}>This account is archived and cannot sign in.</p>
        )}

        {existing && (
          <>
            <label style={labelStyle()}>Username</label>
            <div style={{ ...inputStyle(), background: '#f9fafb', color: '#6b7280', fontFamily: 'monospace', marginBottom: 14 }}>
              {existing.username}
            </div>
          </>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle()}>First Name {!existing && '*'}</label>
            <input style={inputStyle()} value={firstName} onChange={e => setFirstName(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle()}>Middle Name {!existing && '*'}</label>
            <input style={inputStyle()} value={middleName} onChange={e => setMiddleName(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle()}>Last Name {!existing && '*'}</label>
            <input style={inputStyle()} value={lastName} onChange={e => setLastName(e.target.value)} />
          </div>
        </div>
        {!existing && (
          <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 4, marginBottom: 0 }}>
            Used to generate this account's username automatically (e.g. Kieran James Cook &rarr; KJC135). Not editable afterward.
          </p>
        )}

        <label style={labelStyle()}>Preferred Name (optional)</label>
        <input style={inputStyle()} value={preferredName} onChange={e => setPreferredName(e.target.value)} placeholder="What they go by day-to-day" />

        <label style={labelStyle()}>Position {!existing && '*'}</label>
        <input style={inputStyle()} value={position} onChange={e => setPosition(e.target.value)} placeholder="e.g. Speech Therapist, Front Desk" />

        <label style={labelStyle()}>Hire Date</label>
        <DateField yearNav clearable style={inputStyle()} ariaLabel="Hire Date" value={hireDate} onChange={setHireDate} />

        <label style={labelStyle()}>Role</label>
        <select style={inputStyle()} value={role} onChange={e => setRole(e.target.value)}>
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
        </select>
        <p style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 4, marginBottom: 0 }}>
          Admins can create, edit, and archive staff accounts. Staff cannot.
        </p>

        <label style={labelStyle()}>Linked Provider</label>
        <select style={inputStyle()} value={providerName} onChange={e => setProviderName(e.target.value)}>
          <option value="">-- none (not a provider) --</option>
          {providers.map(p => <option key={p.id} value={p.Name}>{p.Name}</option>)}
        </select>
        <p style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 4, marginBottom: 0 }}>
          If set, this account's Weekly Schedule view will be locked to only this provider's appointments.
        </p>

        {!existing ? (
          <>
            <label style={labelStyle()}>Temporary Password *</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={{ ...inputStyle(), fontFamily: 'monospace' }} value={tempPassword} onChange={e => setTempPassword(e.target.value)} />
              <button type="button" onClick={() => setTempPassword(generateTempPassword())} style={modalBtnStyle()}>Regenerate</button>
            </div>
          </>
        ) : (
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #e2e4e9' }}>
            {!resettingPassword ? (
              <button type="button" onClick={() => { setResettingPassword(true); setTempPassword(generateTempPassword()); }} style={modalBtnStyle()}>
                Reset Password
              </button>
            ) : (
              <>
                <label style={labelStyle()}>New Temporary Password</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input style={{ ...inputStyle(), fontFamily: 'monospace' }} value={tempPassword} onChange={e => setTempPassword(e.target.value)} />
                  <button type="button" onClick={() => setTempPassword(generateTempPassword())} style={modalBtnStyle()}>Regenerate</button>
                </div>
                <p style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 4, marginBottom: 0 }}>
                  They'll be required to set their own password again on next sign-in.
                </p>
              </>
            )}
          </div>
        )}

        {existing && <TimeOffBalanceEditor username={existing.username} />}

        {error && <p style={{ color: '#dc2626', fontSize: 13 }}>{error}</p>}

        {confirmingArchive ? (
          <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: existing?.archived ? '#f0fdf4' : '#fef2f2', border: `1px solid ${existing?.archived ? '#bbf7d0' : '#fecaca'}` }}>
            <p style={{ fontSize: 13, color: existing?.archived ? '#166534' : '#991b1b', margin: '0 0 10px 0', fontWeight: 500 }}>
              {existing?.archived
                ? 'Restore this account? They will be able to sign in again.'
                : "Archive this account? They will no longer be able to sign in, but their history is preserved -- staff accounts can't be deleted."}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmingArchive(false)} disabled={saving} style={modalBtnStyle()}>Cancel</button>
              <button onClick={requestArchiveToggle} disabled={saving} style={modalBtnStyle(false, !existing?.archived)}>
                {existing?.archived ? 'Restore Account' : 'Archive Account'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
            {existing ? (
              <button onClick={() => setConfirmingArchive(true)} disabled={saving} style={modalBtnStyle(false, !existing.archived)}>
                {existing.archived ? 'Restore' : 'Archive'}
              </button>
            ) : <div />}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onClose} style={modalBtnStyle()}>Cancel</button>
              <button onClick={requestSave} disabled={saving} style={modalBtnStyle(true)}>
                {existing ? 'Save' : 'Create Account'}
              </button>
            </div>
          </div>
        )}
      </div>

      {pendingAction && (
        <PasswordConfirmModal
          expectedUsername={currentUser?.username}
          actionLabel={
            pendingAction === 'archive'
              ? `Confirm your identity to ${existing?.archived ? 'restore' : 'archive'} this account.`
              : existing ? 'Confirm your identity to save these changes.' : 'Confirm your identity to create this account.'
          }
          onConfirm={pendingAction === 'archive' ? performArchiveToggle : performSave}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </div>
  );
}



// ---------- Main page ----------
// ---------- Hidden raw data table (view/edit every patient field at once) ----------
function formatCellValue(patient, key) {
  const val = patient[key];
  if (val === null || val === undefined || val === '') return '';
  if (key === 'Picture_Consent') return val === true ? 'Yes' : val === false ? 'No' : '';
  return String(val);
}

const DATE_TABLE_COLUMN_KEYS = new Set(['Date_of_Birth', 'RX_Date', 'RX_Expiration', 'IFSP_Start_Date', 'IFSP_End_Date', 'Report_Date']);
// Same locked, auto-calculated fields as the Patient form -- not directly
// editable here either.
const LOCKED_TABLE_COLUMNS = new Set(['RX_Expiration', 'Report_Date', 'mrn']);
const MULTI_SELECT_TABLE_COLUMNS = { Services: SERVICES_OPTIONS, Program: PROGRAM_OPTIONS };
const SINGLE_SELECT_TABLE_COLUMNS = {
  Relationship_To_Patient: RELATIONSHIP_OPTIONS,
  Status: PATIENT_STATUS_OPTIONS,
  IFSP_Type: IFSP_TYPE_OPTIONS,
};

function cellValueToPayloadValue(key, rawValue) {
  if (key === 'Picture_Consent') {
    return rawValue === 'Yes' ? true : rawValue === 'No' ? false : null;
  }
  return rawValue;
}

function EditableTableCell({ patient, columnKey, value, onCommit, staffDirectory }) {
  const [localValue, setLocalValue] = useState(value);
  const [status, setStatus] = useState('idle'); // idle | saving | saved | error
  const [dropdownPos, setDropdownPos] = useState(null); // only used by multi-select cells

  useEffect(() => { setLocalValue(value); }, [value]);

  const commit = async (overrideValue) => {
    const nextValue = overrideValue !== undefined ? overrideValue : localValue;
    if (nextValue === value) return;
    setStatus('saving');
    try {
      await onCommit(patient, columnKey, nextValue);
      setStatus('saved');
      setTimeout(() => setStatus(s => (s === 'saved' ? 'idle' : s)), 900);
    } catch (err) {
      // The first edit each session pauses for a password prompt rather
      // than failing -- don't flag that as an error on the cell itself.
      setStatus(err.message === 'PASSWORD_REQUIRED' ? 'idle' : 'error');
    }
  };

  const cellStyle = {
    width: '100%', minWidth: 92, border: '1px solid transparent', outline: 'none',
    padding: '4px 6px', fontSize: 11.5, borderRadius: 4, fontFamily: 'inherit', boxSizing: 'border-box',
    background: status === 'saving' ? '#FEF9C3' : status === 'error' ? '#FEF2F2' : status === 'saved' ? '#F0FDF4' : 'transparent',
  };

  // Locked, auto-calculated / system-generated fields -- same read-only
  // treatment as the form (RX Expiration, Report Date, and MRN).
  if (LOCKED_TABLE_COLUMNS.has(columnKey)) {
    const displayValue = DATE_TABLE_COLUMN_KEYS.has(columnKey)
      ? (formatDateMMDDYYYY(value) === '\u2014' ? '' : formatDateMMDDYYYY(value))
      : (value || '');
    return (
      <div style={{ ...cellStyle, display: 'flex', alignItems: 'center', gap: 4, color: '#6b7280', minWidth: 110, fontFamily: columnKey === 'mrn' ? 'monospace' : 'inherit' }} title="System-generated, not editable">
        <span style={{ fontSize: 10 }}>&#128274;</span>
        {displayValue}
      </div>
    );
  }

  if (columnKey === 'Case_Manager') {
    return (
      <select
        value={localValue || ''}
        onChange={e => { setLocalValue(e.target.value); commit(e.target.value); }}
        style={cellStyle}
      >
        <option value="">-- none --</option>
        <option value="__NOT_NEEDED__">Not Needed</option>
        {staffDirectory.map(s => <option key={s.username} value={s.username}>{s.display_name}</option>)}
      </select>
    );
  }

  if (columnKey === 'Picture_Consent') {
    return (
      <select
        value={localValue || ''}
        onChange={e => setLocalValue(e.target.value)}
        onBlur={() => commit()}
        style={cellStyle}
      >
        <option value="">--</option>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
      </select>
    );
  }

  if (SINGLE_SELECT_TABLE_COLUMNS[columnKey]) {
    return (
      <select
        value={localValue || ''}
        onChange={e => { setLocalValue(e.target.value); commit(e.target.value); }}
        style={cellStyle}
      >
        <option value="">-- select --</option>
        {SINGLE_SELECT_TABLE_COLUMNS[columnKey].map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    );
  }

  if (MULTI_SELECT_TABLE_COLUMNS[columnKey]) {
    const selected = splitMultiValue(localValue);
    const toggle = (opt) => {
      const next = selected.includes(opt) ? selected.filter(v => v !== opt) : [...selected, opt];
      const joined = joinMultiValue(next);
      setLocalValue(joined);
      commit(joined);
    };
    return (
      <>
        <button
          type="button"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setDropdownPos({ top: rect.bottom + 4, left: rect.left });
          }}
          style={{
            ...cellStyle, textAlign: 'left', cursor: 'pointer', display: 'flex', flexWrap: 'wrap',
            alignItems: 'center', gap: 3, minHeight: 22, minWidth: 130,
          }}
        >
          {selected.length > 0 ? selected.map(s => (
            <span key={s} style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: '#EDE9FE', color: '#6D28D9' }}>
              {s}
            </span>
          )) : <span style={{ color: '#9ca3af' }}>--</span>}
        </button>
        {dropdownPos && createPortal(
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setDropdownPos(null)} />
            <div style={{
              position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999,
              background: 'white', border: '1px solid #e2e4e9', borderRadius: 8, boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
              padding: 10, minWidth: 240,
            }}>
              <MultiSelectChips options={MULTI_SELECT_TABLE_COLUMNS[columnKey]} selected={selected} onToggle={toggle} />
            </div>
          </>,
          document.body
        )}
      </>
    );
  }

  return (
    <input
      type={DATE_TABLE_COLUMN_KEYS.has(columnKey) ? 'date' : 'text'}
      value={localValue || ''}
      onChange={e => setLocalValue(e.target.value)}
      onBlur={() => commit()}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      onFocus={e => { e.currentTarget.style.border = '1.5px solid #6D28D9'; e.currentTarget.style.background = 'white'; }}
      style={cellStyle}
      title={status === 'error' ? 'Failed to save -- try again' : undefined}
    />
  );
}

// ---------- Patient filters (shared by the Data Table and the Patients list) ----------
// Any number of filters, combined with AND. A column with set values
// (Program, Services, Status, Relationship, IFSP Type, Case Manager,
// Picture Consent) takes one or more EXACT values, combined with OR --
// e.g. Program: P or PP or CPSE. Exact matters: "contains" matching made
// Program "P" also catch "PP" and "CPSE". Free-text columns (names,
// phones, notes...) still match "contains".
// A filter is { id, column, values: [], value: '' }.
const MULTI_VALUE_FILTER_COLUMNS = new Set(['Services', 'Program']);

function isOptionFilterColumn(column) {
  return !!(SINGLE_SELECT_TABLE_COLUMNS[column] || MULTI_SELECT_TABLE_COLUMNS[column]) || column === 'Case_Manager' || column === 'Picture_Consent';
}

export function patientFilterTokens(patient, column) {
  if (column === 'Picture_Consent') return patient.Picture_Consent === true ? ['Yes'] : patient.Picture_Consent === false ? ['No'] : [];
  if (MULTI_VALUE_FILTER_COLUMNS.has(column)) return splitMultiValue(patient[column]);
  const v = patient[column];
  return v === null || v === undefined || String(v).trim() === '' ? [] : [String(v).trim()];
}

// The values to choose from: the usual list, plus anything actually on
// file that isn't in it (older spellings), so every patient can be found.
export function patientFilterOptions(column, patients, staffDirectory = []) {
  let base;
  if (column === 'Case_Manager') base = [...staffDirectory.map(s => s.display_name), 'Not Needed'];
  else if (column === 'Picture_Consent') base = ['Yes', 'No'];
  else base = SINGLE_SELECT_TABLE_COLUMNS[column] || MULTI_SELECT_TABLE_COLUMNS[column];
  if (!base) return null;
  const seen = new Map(base.map(v => [v.toLowerCase(), v]));
  (patients || []).forEach(p => patientFilterTokens(p, column).forEach(t => {
    if (!seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  }));
  return [...seen.values()];
}

export function newPatientFilter(column = PATIENT_FILTER_COLUMNS[0]?.key || '') {
  return { id: `f${Date.now()}${Math.random()}`, column, values: [], value: '' };
}

export function isPatientFilterActive(f) {
  if (!f.column) return false;
  return isOptionFilterColumn(f.column) ? (f.values || []).length > 0 : !!(f.value || '').trim();
}

export function matchesPatientFilter(patient, f) {
  if (!isPatientFilterActive(f)) return true;
  if (isOptionFilterColumn(f.column)) {
    const wanted = new Set(f.values.map(v => v.toLowerCase()));
    return patientFilterTokens(patient, f.column).some(t => wanted.has(t.toLowerCase()));
  }
  return matchesColumnFilter(patient, f.column, f.value);
}

export function matchesPatientFilters(patient, filters) {
  return (filters || []).every(f => matchesPatientFilter(patient, f));
}

export function describePatientFilter(f) {
  const label = PATIENT_FILTER_COLUMNS.find(c => c.key === f.column)?.label || f.column;
  return isOptionFilterColumn(f.column) ? `${label}: ${f.values.join(' or ')}` : `${label} contains \u201c${f.value.trim()}\u201d`;
}

// Tick one or more values. Shows the picks on the button; opens a checklist.
function MultiValuePicker({ options, values, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const toggle = (opt) => onChange(values.includes(opt) ? values.filter(v => v !== opt) : [...values, opt]);
  const label = values.length === 0 ? '-- any --' : values.join(', ');
  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={label}
        style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid #e2e4e9', borderRadius: 4, fontSize: 12, padding: '2px 6px', background: 'white', cursor: 'pointer', maxWidth: 190, color: values.length ? '#111827' : '#6b7280', fontWeight: values.length ? 600 : 400 }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <span aria-hidden="true" style={{ fontSize: 9, color: '#9ca3af' }}>&#9660;</span>
      </button>
      {open && (
        <div role="listbox" aria-multiselectable="true" style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 40, background: 'white', border: '1px solid #e2e4e9', borderRadius: 8, boxShadow: '0 8px 20px rgba(0,0,0,0.12)', padding: 6, minWidth: 190, maxHeight: 260, overflowY: 'auto' }}>
          {options.map(opt => (
            <label key={opt} role="option" aria-selected={values.includes(opt)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', fontSize: 12.5, cursor: 'pointer', borderRadius: 4, whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={values.includes(opt)} onChange={() => toggle(opt)} />
              {opt}
            </label>
          ))}
          {values.length > 0 && (
            <button type="button" onClick={() => onChange([])} style={{ marginTop: 4, width: '100%', border: 'none', borderTop: '1px solid #f1f2f4', background: 'none', color: '#991B1B', fontSize: 12, fontWeight: 600, padding: '6px 0 2px', cursor: 'pointer' }}>
              Clear selection
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// The filter chips + "+ Add Filter". `filters` / `onChange` hold the list.
export function PatientFilterBuilder({ filters, onChange, patients, staffDirectory }) {
  const update = (id, patch) => onChange(filters.map(f => (f.id === id ? { ...f, ...patch } : f)));
  return (
    <>
      {filters.map(f => {
        const options = patientFilterOptions(f.column, patients, staffDirectory);
        return (
          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'white', border: '1px solid #e2e4e9', borderRadius: 6, padding: '4px 6px' }}>
            <select
              aria-label="Filter column"
              value={f.column}
              onChange={e => update(f.id, { column: e.target.value, values: [], value: '' })}
              style={{ border: 'none', fontSize: 12, background: 'transparent', maxWidth: 120 }}
            >
              {PATIENT_FILTER_COLUMNS.map(col => <option key={col.key} value={col.key}>{col.label}</option>)}
            </select>
            {options ? (
              <MultiValuePicker options={options} values={f.values || []} onChange={values => update(f.id, { values })} />
            ) : (
              <input
                aria-label="Contains"
                placeholder="contains..."
                value={f.value || ''}
                onChange={e => update(f.id, { value: e.target.value })}
                style={{ border: '1px solid #e2e4e9', borderRadius: 4, fontSize: 12, padding: '2px 6px', width: 110 }}
              />
            )}
            <button onClick={() => onChange(filters.filter(x => x.id !== f.id))} title="Remove this filter" aria-label="Remove this filter" style={{ border: 'none', background: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1 }}>&times;</button>
          </div>
        );
      })}
      <button onClick={() => onChange([...filters, newPatientFilter()])} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: '1px dashed #9ca3af', background: 'white', color: '#374151', cursor: 'pointer' }}>
        + Add Filter
      </button>
    </>
  );
}

// ---------- Printing the Data Table ----------
// Prints exactly what the Data Table is showing: the same rows (after the
// search box and every active filter), in the same sort order, with every
// column in the same order as on screen. Dates print as MM.DD.YYYY like
// the rest of the app. A header line records the view (search, filters,
// sort) so a printed copy explains itself.
//
// Rendered into a hidden iframe rather than printing the page itself: the
// Data Table is a fixed, scrolling overlay on top of the app, which a
// browser can't lay out across paper pages -- a clean table in its own
// document can, and its header row repeats at the top of every page.
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function printCellText(patient, key) {
  if (key === 'Case_Manager') return patient.Case_Manager || '';
  if (DATE_TABLE_COLUMN_KEYS.has(key)) {
    const formatted = formatDateMMDDYYYY(patient[key]);
    return formatted === '\u2014' ? '' : formatted;
  }
  return formatCellValue(patient, key);
}

function describeTableView({ searchText, filters, sortColumn, sortDirection }) {
  const labelFor = (key) => PATIENT_FILTER_COLUMNS.find(c => c.key === key)?.label || key;
  const parts = [];
  if (searchText.trim()) parts.push(`Search: \u201c${searchText.trim()}\u201d`);
  filters.filter(isPatientFilterActive).forEach(f => parts.push(describePatientFilter(f)));
  if (sortColumn) parts.push(`Sorted by ${labelFor(sortColumn)} (${sortDirection === 'asc' ? 'A\u2192Z' : 'Z\u2192A'})`);
  return parts.length ? parts.join(' \u00b7 ') : 'All records, no filters';
}

// How each column may wrap on paper: dates never split; long single
// "words" (emails, links) get a capped width and break anywhere; notes get
// a wider capped column; everything else wraps only between words, so
// short values like "Mother" never get cut in half.
const PRINT_NOWRAP_COLUMNS = new Set([...DATE_TABLE_COLUMN_KEYS, 'mrn', 'Picture_Consent']);
const PRINT_BREAK_ANYWHERE_COLUMNS = { Parent_Email: 'email', SC_Admin_Email: 'email', Google_Link: 'link' };
// 27 columns: the print font is 5.6pt so dates still fit on one line.
// Each column's share of the page width, in points at the 6pt print font,
// sized so all 25 columns fit across a landscape Letter page (about 740pt
// wide) -- dates exactly fit "04.10.2023", short codes are narrow, and text
// wraps inside its share. Given as proportions, so a larger paper size
// (e.g. Legal) just widens every column evenly.
const PRINT_COLUMN_WIDTHS = {
  Name: 37, mrn: 24, Program: 28, Status: 30, Parent_Name: 30, Relationship_To_Patient: 28,
  Parent_Phone: 30, Parent_Email: 30, SC_Admin_Name: 24, SC_Admin_Phone: 30, SC_Admin_Email: 30,
  Services: 20, Mandate: 24, Case_Manager: 24, ID_Number: 28, Date_of_Birth: 34, IFSP_Type: 25,
  IFSP_Start_Date: 34, IFSP_End_Date: 34, RX_Date: 34, RX_Expiration: 34, Report_Date: 34,
  Picture_Consent: 18, Allergies: 34, Immunizations: 30, Scheduling_Notes: 30, Google_Link: 36,
};

function printCellClass(key) {
  if (key === 'Name') return 'name';
  if (PRINT_NOWRAP_COLUMNS.has(key)) return 'nowrap';
  if (PRINT_BREAK_ANYWHERE_COLUMNS[key]) return PRINT_BREAK_ANYWHERE_COLUMNS[key];
  return '';
}

export function printPatientTable({ rows, totalCount, searchText, filters, sortColumn, sortDirection, printedBy }) {
  const columns = [{ key: 'Name', label: 'Name' }, ...PATIENT_FILTER_COLUMNS.filter(c => c.key !== 'Name')];
  const now = new Date();
  const printedAt = now.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const docTitle = `Patient Data - ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const totalWidth = columns.reduce((sum, c) => sum + (PRINT_COLUMN_WIDTHS[c.key] || 28), 0);
  const colGroup = columns.map(c => `<col style="width:${(((PRINT_COLUMN_WIDTHS[c.key] || 28) / totalWidth) * 100).toFixed(3)}%">`).join('');
  const headerCells = columns.map(c => `<th>${escapeHtml(c.label)}</th>`).join('');
  const bodyRows = rows.map(p => `<tr>${columns.map(c => {
    const cls = printCellClass(c.key);
    return `<td${cls ? ` class="${cls}"` : ''}>${escapeHtml(printCellText(p, c.key))}</td>`;
  }).join('')}</tr>`).join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(docTitle)}</title><style>
    @page { size: landscape; margin: 0.3in; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #111827; }
    header { margin-bottom: 8px; }
    h1 { font-size: 13pt; margin: 0 0 2px; color: #4C1D95; }
    .meta { font-size: 8pt; color: #4b5563; margin: 0; }
    .confidential { font-size: 7.5pt; color: #6b7280; margin: 2px 0 0; font-style: italic; }
    table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 5.6pt; line-height: 1.25; }
    thead { display: table-header-group; }
    th { background: #F3F0FB; color: #374151; font-weight: 700; text-align: left; font-size: 5.3pt; overflow-wrap: break-word; }
    th, td { border: 0.5pt solid #b8b5c4; padding: 1.5pt 1.5pt; vertical-align: top; overflow-wrap: break-word; }
    td.name { font-weight: 700; }
    td.nowrap { white-space: nowrap; overflow: hidden; }
    td.email, td.link { overflow-wrap: anywhere; word-break: break-all; }
    td.link { font-size: 5.4pt; }
    tr { page-break-inside: avoid; break-inside: avoid; }
    tbody tr:nth-child(even) td { background: #FAF9FD; }
  </style></head><body>
    <header>
      <h1>The Kidz Lounge &middot; Patient Data</h1>
      <p class="meta">${rows.length} of ${totalCount} records &middot; ${escapeHtml(describeTableView({ searchText, filters, sortColumn, sortDirection }))}</p>
      <p class="meta">Printed ${escapeHtml(printedAt)}${printedBy ? ` by ${escapeHtml(printedBy)}` : ''}</p>
      <p class="confidential">Confidential patient information. Handle and dispose of securely.</p>
    </header>
    <table><colgroup>${colGroup}</colgroup><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>
  </body></html>`;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const cleanup = () => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); };
  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  // Give the new document a moment to lay out, then open the print dialog.
  setTimeout(() => {
    try {
      iframe.contentWindow.onafterprint = () => setTimeout(cleanup, 0);
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } finally {
      // Safety net for browsers that don't fire afterprint.
      setTimeout(cleanup, 60000);
    }
  }, 150);
}

export function DataTableOverlay({ patients, onClose, onPatientsChanged, initialPassword }) {
  const { user: currentUser } = useAuth();
  const [rows, setRows] = useState(patients);
  const [globalError, setGlobalError] = useState(null);
  const [staffDirectory, setStaffDirectory] = useState([]);
  const [tableSearchText, setTableSearchText] = useState('');
  // Any number of column+value filters can be active at once, all combined
  // with AND -- built up and torn down freely since what someone wants to
  // look at changes moment to moment, not a fixed saved view.
  const [activeFilters, setActiveFilters] = useState([]);
  const [sortColumn, setSortColumn] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  // Every patient edit requires password confirmation (same rule as the
  // full Patient form). Confirmed up front, before this table even opens,
  // rather than on the first edit -- but this initial value is never
  // actually verified server-side until a real save happens, so a typo
  // here still gets caught and re-prompted for, the same way a password
  // that stops working mid-session does.
  const [sessionPassword, setSessionPassword] = useState(initialPassword || null);
  const [pendingCommit, setPendingCommit] = useState(null); // { patient, columnKey, rawValue } waiting on the password prompt

  useEffect(() => { setRows(patients); }, [patients]);
  useEffect(() => { api.getStaffDirectory().then(setStaffDirectory).catch(() => {}); }, []);

  const handleSortClick = (columnKey) => {
    if (sortColumn === columnKey) {
      setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(columnKey);
      setSortDirection('asc');
    }
  };

  const clearAllFilters = () => { setActiveFilters([]); setTableSearchText(''); };

  const displayedRows = useMemo(() => {
    let result = rows.filter(p =>
      matchesSearchText(p, tableSearchText) &&
      matchesPatientFilters(p, activeFilters)
    );
    if (sortColumn) {
      result = [...result].sort((a, b) => {
        const av = (sortColumn === 'Case_Manager' ? a.Case_Manager : formatCellValue(a, sortColumn)) || '';
        const bv = (sortColumn === 'Case_Manager' ? b.Case_Manager : formatCellValue(b, sortColumn)) || '';
        const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
        return sortDirection === 'asc' ? cmp : -cmp;
      });
    }
    return result;
  }, [rows, tableSearchText, activeFilters, sortColumn, sortDirection]);

  const buildPayload = (patient, columnKey, rawValue) => {
    const payload = {};
    // The backend replaces the full record on save, so every field from the
    // current row has to be sent, not just the one that changed.
    PATIENT_FILTER_COLUMNS.forEach(col => {
      payload[col.key] = patient[col.key] ?? '';
    });
    payload.Picture_Consent = patient.Picture_Consent === true ? 'Yes' : patient.Picture_Consent === false ? 'No' : '';
    payload[columnKey] = rawValue;

    // Same auto-calculation as the Patient form: RX Expiration follows RX
    // Date, Report Date follows IFSP End Date.
    if (columnKey === 'RX_Date') {
      payload.RX_Expiration = rawValue ? addDaysToDateStr(rawValue, 364) : payload.RX_Expiration;
    }
    if (columnKey === 'IFSP_End_Date') {
      payload.Report_Date = rawValue ? addDaysToDateStr(rawValue, -21) : payload.Report_Date;
    }
    // Case Manager is edited here as a real staff link (a username), not
    // free text -- the backend derives the display text from that link,
    // the same way the Patient form's dropdown already works. Overwrite
    // the raw text assignment from the line above with the real field.
    if (columnKey === 'Case_Manager') {
      const isNotNeeded = rawValue === '__NOT_NEEDED__';
      payload.case_manager_username = isNotNeeded ? '' : (rawValue || '');
      payload.Case_Manager = isNotNeeded ? 'Not Needed' : '';
    }

    Object.keys(payload).forEach(k => { payload[k] = cellValueToPayloadValue(k, payload[k]); });
    return payload;
  };

  const saveCommit = async (patient, columnKey, rawValue, password) => {
    const payload = buildPayload(patient, columnKey, rawValue);
    payload.admin_password = password;
    const updated = await api.updatePatient(patient.id, payload);
    setRows(prev => prev.map(r => (r.id === patient.id ? updated : r)));
    onPatientsChanged?.();
  };

  // Every patient edit needs password confirmation. The first cell edit in
  // this session prompts for it; every edit after that reuses the same
  // confirmed password automatically, so editing stays quick.
  const handleCommit = async (patient, columnKey, rawValue) => {
    if (sessionPassword) {
      try {
        await saveCommit(patient, columnKey, rawValue, sessionPassword);
      } catch (err) {
        if (err.status === 403) {
          // The cached password stopped working (changed elsewhere) --
          // drop it and ask again rather than silently failing forever.
          setSessionPassword(null);
          setPendingCommit({ patient, columnKey, rawValue });
          throw err;
        }
        setGlobalError(`Failed to save ${patient.Name}'s ${columnKey.replace(/_/g, ' ')}: ${err.message}`);
        throw err;
      }
      return;
    }
    setPendingCommit({ patient, columnKey, rawValue });
    // Rejected so the cell's own saving/error indicator doesn't hang --
    // the actual save happens once the password prompt below is confirmed.
    throw new Error('PASSWORD_REQUIRED');
  };

  // Called by the shared PasswordConfirmModal with the password it already
  // verified the username alongside -- same confirmation flow used
  // everywhere else in the app (editing a patient, a staff account, etc.),
  // rather than a Data-Table-specific one.
  const confirmSessionPassword = async (password) => {
    if (!pendingCommit) return;
    await saveCommit(pendingCommit.patient, pendingCommit.columnKey, pendingCommit.rawValue, password);
    setSessionPassword(password);
    setPendingCommit(null);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 9500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div
        style={{ background: 'white', borderRadius: 10, width: '100%', height: '100%', maxWidth: 1500, display: 'flex', flexDirection: 'column', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #e2e4e9', flexShrink: 0, gap: 12 }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>All Patient Data ({displayedRows.length} of {rows.length} records)</span>
            <span style={{ fontSize: 11.5, color: '#9ca3af', marginLeft: 10 }}>Click any cell to edit &middot; saves when you click away &middot; click a column header to sort</span>
          </div>
          <input
            placeholder="Search all fields..."
            value={tableSearchText}
            onChange={e => setTableSearchText(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e4e9', fontSize: 12.5, width: 200 }}
          />
          <button
            type="button"
            onClick={() => printPatientTable({
              rows: displayedRows, totalCount: rows.length, searchText: tableSearchText, filters: activeFilters,
              sortColumn, sortDirection, printedBy: currentUser?.username,
            })}
            disabled={displayedRows.length === 0}
            title={displayedRows.length === 0 ? 'Nothing to print with the current filters' : 'Print the table exactly as it\u2019s filtered and sorted now'}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: displayedRows.length === 0 ? 'default' : 'pointer', border: '1px solid #e2e4e9', background: 'white', color: displayedRows.length === 0 ? '#9ca3af' : '#374151', flexShrink: 0, marginLeft: 'auto' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" />
            </svg>
            Print
          </button>
          <button onClick={onClose} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', border: '1px solid #e2e4e9', background: 'white', color: '#374151', flexShrink: 0 }}>
            Close
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid #e2e4e9', flexShrink: 0, background: '#fafafa' }}>
          <PatientFilterBuilder filters={activeFilters} onChange={setActiveFilters} patients={rows} staffDirectory={staffDirectory} />
          {(activeFilters.length > 0 || tableSearchText) && (
            <button onClick={clearAllFilters} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', background: 'none', color: '#991B1B', cursor: 'pointer' }}>
              Clear all
            </button>
          )}
        </div>
        {globalError && (
          <div style={{ padding: '8px 16px', background: '#FEF2F2', color: '#991b1b', fontSize: 12, flexShrink: 0 }}>
            {globalError}
            <button onClick={() => setGlobalError(null)} style={{ marginLeft: 10, background: 'none', border: 'none', color: '#991b1b', textDecoration: 'underline', cursor: 'pointer', fontSize: 12 }}>Dismiss</button>
          </div>
        )}
        {pendingCommit && (
          <PasswordConfirmModal
            expectedUsername={currentUser?.username}
            actionLabel="Confirm your identity to start editing in the data table. Every edit after this one in this session will save automatically."
            onConfirm={confirmSessionPassword}
            onCancel={() => setPendingCommit(null)}
          />
        )}
        <div style={{ overflow: 'auto', flex: 1 }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 11.5, whiteSpace: 'nowrap' }}>
            <thead>
              <tr>
                <th
                  onClick={() => handleSortClick('Name')}
                  style={{ position: 'sticky', top: 0, left: 0, zIndex: 3, background: '#f9fafb', padding: '6px 10px', borderBottom: '1px solid #e2e4e9', borderRight: '1px solid #e2e4e9', textAlign: 'left', cursor: 'pointer', userSelect: 'none' }}
                >
                  Name{sortColumn === 'Name' ? (sortDirection === 'asc' ? ' \u25B2' : ' \u25BC') : ''}
                </th>
                {PATIENT_FILTER_COLUMNS.filter(c => c.key !== 'Name').map(col => (
                  <th
                    key={col.key}
                    onClick={() => handleSortClick(col.key)}
                    style={{ position: 'sticky', top: 0, zIndex: 2, background: '#f9fafb', padding: '6px 10px', borderBottom: '1px solid #e2e4e9', textAlign: 'left', color: '#6b7280', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                  >
                    {col.label}{sortColumn === col.key ? (sortDirection === 'asc' ? ' \u25B2' : ' \u25BC') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayedRows.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ position: 'sticky', left: 0, background: 'white', padding: '2px 4px', borderRight: '1px solid #e2e4e9', fontWeight: 600, minWidth: 140 }}>
                    <EditableTableCell patient={p} columnKey="Name" value={p.Name || ''} onCommit={handleCommit} />
                  </td>
                  {PATIENT_FILTER_COLUMNS.filter(c => c.key !== 'Name').map(col => (
                    <td key={col.key} style={{ padding: '2px 4px' }}>
                      <EditableTableCell
                        patient={p}
                        columnKey={col.key}
                        value={col.key === 'Case_Manager' ? (p.case_manager_username || (p.Case_Manager === 'Not Needed' ? '__NOT_NEEDED__' : '')) : formatCellValue(p, col.key)}
                        onCommit={handleCommit}
                        staffDirectory={staffDirectory}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


export default function ManageDataPage({ section: sectionProp, onSectionChange } = {}) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isControlled = sectionProp !== undefined;
  const [internalSection, setInternalSection] = useState('providers');
  const section = isControlled ? sectionProp : internalSection;
  const setSection = isControlled ? onSectionChange : setInternalSection;
  const [providers, setProviders] = useState([]);
  const [patients, setPatients] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [modalTarget, setModalTarget] = useState(null); // { type: 'provider'|'patient'|'staff', existing: obj|null } | null
  const [patientPreset, setPatientPreset] = useState('all');
  const [patientSearchText, setPatientSearchText] = useState('');
  const [patientFilterColumn, setPatientFilterColumn] = useState('');
  const [patientFilterValue, setPatientFilterValue] = useState('');
  const [showDataTable, setShowDataTable] = useState(false);

  const filteredPatients = useMemo(() => {
    return patients.filter(p =>
      matchesPreset(p, patientPreset) &&
      matchesSearchText(p, patientSearchText) &&
      matchesColumnFilter(p, patientFilterColumn, patientFilterValue)
    );
  }, [patients, patientPreset, patientSearchText, patientFilterColumn, patientFilterValue]);

  const clearPatientFilters = () => {
    setPatientPreset('all');
    setPatientSearchText('');
    setPatientFilterColumn('');
    setPatientFilterValue('');
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const calls = [api.getProviders(), api.getPatients()];
      if (isAdmin) calls.push(api.getStaff());
      const results = await Promise.all(calls);
      setProviders(results[0]);
      setPatients(results[1]);
      if (isAdmin) setStaff(results[2]);
    } catch (err) {
      setLoadError(err.message);
    }
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => { load(); }, [load]);

  const closeModal = () => setModalTarget(null);
  const handleSaved = () => { closeModal(); load(); };

  return (
    <div style={{ ...(isControlled ? { padding: 0 } : pageWrap()), position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        {!isControlled && (
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 4 }}>Manage Data</h1>
            <p style={{ fontSize: 13, color: '#6b7280', marginTop: 0, marginBottom: 20 }}>
              Add, edit, or remove providers and patients.
            </p>
          </div>
        )}
        {isAdmin && section === 'patients' && (
          <button
            type="button"
            onClick={() => setShowDataTable(true)}
            title="View and edit all patient data as a table"
            style={{
              display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #e2e4e9', background: 'white',
              color: '#374151', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: '7px 14px', borderRadius: 8, marginTop: 2,
            }}
          >
            <span aria-hidden="true">&#9635;</span> Data Table
          </button>
        )}
      </div>

      {!isControlled && (
        <div style={pillTabsWrap()}>
          <button type="button" onClick={() => setSection('providers')} style={pillTabStyle(section === 'providers')}>Providers</button>
          <button type="button" onClick={() => setSection('patients')} style={pillTabStyle(section === 'patients')}>Patients</button>
          {isAdmin && (
            <button type="button" onClick={() => setSection('staff')} style={pillTabStyle(section === 'staff')}>Staff</button>
          )}
        </div>
      )}

      {loadError && <p style={{ color: '#dc2626', fontSize: 13 }}>{loadError}</p>}

      {section === 'providers' ? (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button style={primaryBtnStyle()} onClick={() => setModalTarget({ type: 'provider', existing: null })}>+ Add Provider</button>
          </div>
          {loading ? (
            <p style={{ fontSize: 13, color: '#9ca3af' }}>Loading...</p>
          ) : providers.length === 0 ? (
            <p style={{ fontSize: 13, color: '#9ca3af' }}>No providers yet.</p>
          ) : (
            providers.map(p => (
              <div key={p.id} style={rowStyle()}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <Avatar name={p.Name} size={32} />
                  <span style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>{p.Name}</span>
                  {p.credentials && <span style={{ fontSize: 12, color: '#9ca3af' }}>{p.credentials}</span>}
                  {p.specialty && <span style={{ fontSize: 11.5, color: '#9ca3af' }}>&middot; {p.specialty}</span>}
                </div>
                <div>
                  <button style={smallBtnStyle(false)} onClick={() => setModalTarget({ type: 'provider', existing: p })}>Edit</button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : section === 'patients' ? (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button style={primaryBtnStyle()} onClick={() => setModalTarget({ type: 'patient', existing: null })}>+ Add Patient</button>
          </div>

          <div style={presetTabsWrap()}>
            {PATIENT_PRESETS.map(preset => (
              <button
                key={preset.key}
                type="button"
                onClick={() => setPatientPreset(preset.key)}
                style={presetTabStyle(patientPreset === preset.key)}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div style={filterBarStyle()}>
            <input
              style={filterInputStyle(220)}
              placeholder="Search all fields..."
              value={patientSearchText}
              onChange={e => setPatientSearchText(e.target.value)}
            />
            <select
              style={filterInputStyle(150)}
              value={patientFilterColumn}
              onChange={e => { setPatientFilterColumn(e.target.value); if (!e.target.value) setPatientFilterValue(''); }}
            >
              <option value="">Filter by column...</option>
              {PATIENT_FILTER_COLUMNS.map(col => (
                <option key={col.key} value={col.key}>{col.label}</option>
              ))}
            </select>
            {patientFilterColumn && (
              <input
                style={filterInputStyle(160)}
                placeholder={`${PATIENT_FILTER_COLUMNS.find(c => c.key === patientFilterColumn)?.label} contains...`}
                value={patientFilterValue}
                onChange={e => setPatientFilterValue(e.target.value)}
                autoFocus
              />
            )}
            {(patientPreset !== 'all' || patientSearchText || patientFilterColumn) && (
              <button type="button" onClick={clearPatientFilters} style={smallBtnStyle(false)}>Clear Filters</button>
            )}
            <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 'auto' }}>
              {filteredPatients.length} of {patients.length}
            </span>
          </div>

          {loading ? (
            <p style={{ fontSize: 13, color: '#9ca3af' }}>Loading...</p>
          ) : patients.length === 0 ? (
            <p style={{ fontSize: 13, color: '#9ca3af' }}>No patients yet.</p>
          ) : filteredPatients.length === 0 ? (
            <p style={{ fontSize: 13, color: '#9ca3af' }}>No patients match the current filters.</p>
          ) : (
            filteredPatients.map(p => (
              <div key={p.id} style={rowStyle()}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>{p.Name}</span>
                  {p.mrn && (
                    <span style={{ fontSize: 10.5, fontFamily: 'monospace', color: '#9ca3af' }}>MRN {p.mrn}</span>
                  )}
                  {splitMultiValue(p.Services).map(s => (
                    <span key={'svc-' + s} style={{
                      fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
                      background: serviceColor(s) + '20', color: serviceColor(s),
                    }}>
                      {s}
                    </span>
                  ))}
                  {splitMultiValue(p.Program).map(prog => (
                    <span key={'prog-' + prog} style={{
                      fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
                      background: programColor(prog) + '20', color: programColor(prog),
                    }}>
                      {prog}
                    </span>
                  ))}
                  {p.Status && (
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>{p.Status}</span>
                  )}
                  {p.Case_Manager && (
                    <span style={{ fontSize: 11.5, color: '#9ca3af' }}>CM: {p.Case_Manager}</span>
                  )}
                </div>
                <div>
                  <button style={smallBtnStyle(false)} onClick={() => setModalTarget({ type: 'patient', existing: p })}>Edit</button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button style={primaryBtnStyle()} onClick={() => setModalTarget({ type: 'staff', existing: null })}>+ Add Staff Account</button>
          </div>
          {loading ? (
            <p style={{ fontSize: 13, color: '#9ca3af' }}>Loading...</p>
          ) : staff.length === 0 ? (
            <p style={{ fontSize: 13, color: '#9ca3af' }}>No staff accounts yet.</p>
          ) : (
            staff.map(s => {
              const displayName = s.preferred_name || [s.first_name, s.last_name].filter(Boolean).join(' ');
              return (
                <div key={s.id} style={{ ...rowStyle(), opacity: s.archived ? 0.55 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <Avatar name={displayName || s.username} size={32} />
                    <span style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>
                      {displayName ? `${displayName} ` : ''}
                      <span style={{ fontFamily: 'monospace', fontSize: 12.5, color: '#9ca3af' }}>({s.username})</span>
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                      background: s.role === 'admin' ? '#8b5cf620' : '#6b728020',
                      color: s.role === 'admin' ? '#8b5cf6' : '#6b7280',
                    }}>
                      {s.role}
                    </span>
                    {s.position && (
                      <span style={{ fontSize: 11.5, color: '#9ca3af' }}>{s.position}</span>
                    )}
                    {s.provider_name && (
                      <span style={{ fontSize: 11.5, color: '#9ca3af' }}>Provider: {s.provider_name}</span>
                    )}
                    {s.archived && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626' }}>Archived</span>
                    )}
                    {!s.archived && s.must_reset_password && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#f59e0b' }}>Awaiting first login</span>
                    )}
                  </div>
                  <div>
                    <button style={smallBtnStyle(false)} onClick={() => setModalTarget({ type: 'staff', existing: s })}>Edit</button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {modalTarget?.type === 'provider' && (
        <ProviderModal existing={modalTarget.existing} onClose={closeModal} onSaved={handleSaved} />
      )}
      {modalTarget?.type === 'patient' && (
        <PatientModal existing={modalTarget.existing} onClose={closeModal} onSaved={handleSaved} />
      )}
      {modalTarget?.type === 'staff' && (
        <StaffModal existing={modalTarget.existing} providers={providers} onClose={closeModal} onSaved={handleSaved} />
      )}

      {showDataTable && isAdmin && (
        <DataTableOverlay
          patients={patients}
          onClose={() => setShowDataTable(false)}
          onPatientsChanged={load}
        />
      )}
    </div>
  );
}
