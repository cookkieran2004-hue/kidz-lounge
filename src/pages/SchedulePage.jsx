import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { useIsMobile } from '../useIsMobile';
import { MeetingAgendaEditor, MeetingAgendaPlaceholder } from '../MeetingAgenda';
import { useStaffDirectory, staffName } from '../staffDirectory';
import { usePatientAlerts, alertsFor, AlertSymbol, PatientAlertsInline } from '../patientAlerts';

export const TIME_SLOTS = [];
for (let h = 8; h <= 17; h++) {
  for (const m of [0, 30]) {
    TIME_SLOTS.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
}

export const ROW_HEIGHT = 80;
// The gap between an appointment card and its grid cell's edge -- used on
// all four sides (top/left/right, and subtracted twice from height for the
// bottom) so the card sits with genuinely equal spacing all the way around,
// not just an approximation.
export const CARD_MARGIN = 3;

// "Practice Ledger" design direction: used for the Appointment modal and
// patient-facing surfaces that should read as an official clinical record
// rather than a typical flat SaaS form.
export const BRAND = { forest: '#6D28D9', brass: '#7C3AED', brassText: '#5B21B6', tint: '#F5F3FF', muted: '#6B6280', box: '#D6CCEF' };
export const BRAND_SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';

function ledgerSectionHeaderStyle() {
  return { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: BRAND.muted, margin: '0 0 8px 0' };
}

function pad(n) {
  return String(n).padStart(2, '0');
}

export function dateToInputValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatSlotLabel(time) {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayHour = h % 12 || 12;
  return `${displayHour}:${String(m).padStart(2, '0')} ${period}`;
}

export function timeToMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

// Every non-contracted gap that overlaps one 30-minute row, trimmed to the
// part inside that row, as { key, top, height } in px. Matching on overlap
// (not "does a gap cover the row's start time") is what makes a gap that
// begins or ends mid-row -- e.g. contracted until 2:45 -- shade exactly the
// right minutes, and lets two gaps share a row.
export function gapSegmentsForSlot(gaps, time, rowHeight) {
  const slotStart = timeToMinutes(time);
  const slotEnd = slotStart + 30;
  const segments = [];
  (gaps || []).forEach(g => {
    const start = Math.max(timeToMinutes(g.start_time.slice(0, 5)), slotStart);
    const end = Math.min(timeToMinutes(g.end_time.slice(0, 5)), slotEnd);
    if (end <= start) return;
    segments.push({
      key: `${g.start_time}-${g.end_time}`,
      top: ((start - slotStart) / 30) * rowHeight,
      height: ((end - start) / 30) * rowHeight,
    });
  });
  return segments;
}

export function statusColor(status) {
  // Distinct color per status again (like rooms), but muted/desaturated
  // instead of the original bold saturated fills -- each status keeps the
  // same hue family it always had (e.g. Canceled stays in the blue family,
  // No Show stays red), just softened.
  const map = {
    Confirmed: '#907be3',
    Scheduled: '#8B8D93',
    Canceled: '#6E93AD',
    'No Show': '#0b3c4d',
    '*HOLD*': '#C9954A',
    'Left Message': '#9B8FC9',
    Emailed: '#9B8FC9',
    'Make Up': '#6B9C82',
    MUS: '#6B9C82',
  };
  return map[status] || '#8B8D93';
}

export const STATUS_OPTIONS = ['Scheduled', 'Confirmed', 'Left Message', 'Emailed', 'Canceled', 'No Show', '*HOLD*', 'Make Up', 'MUS'];

// ---------- The "HOLD - see comments" placeholder patient ----------
// Not a real child: it's booked to hold time on a provider's schedule.
// Picking it in the appointment form sets the status to *HOLD*, and its
// appointments never need a room, so they're left out of Unassigned.
// Recognized by MRN when picked from the patient search, and by name on
// appointments (which store the patient's name, not the MRN).
export const HOLD_PATIENT_MRN = '82712070';
export const HOLD_PATIENT_NAME = 'HOLD - see comments';
export const HOLD_STATUS = '*HOLD*';
export function isHoldPatient(patientOrName) {
  if (!patientOrName) return false;
  if (typeof patientOrName === 'string') return patientOrName.trim().toLowerCase() === HOLD_PATIENT_NAME.toLowerCase();
  if (String(patientOrName.mrn || '') === HOLD_PATIENT_MRN) return true;
  return isHoldPatient(patientOrName.Name || patientOrName.patient_name || '');
}
const DURATION_OPTIONS = [30, 45, 60];
export const TREATMENT_AREA_OPTIONS = ['Green', 'Yellow', 'Orange A', 'Orange B', 'Purple', 'Gym A', 'Gym B', 'Gym Table'];

// ---------- Offsite ----------
// "Offsite" is picked like a room but isn't one of the rooms. It's stored
// in the same treatment_area field as "Offsite" (no location given) or
// "Offsite: Sunnyside Elementary" -- so every existing save path, recurring
// series and "this and all future" edits included, carries it with no
// backend change. Because it never equals one of the eight room names it
// never gets a Room-view column, and because it isn't empty the Unassigned
// list skips it. It's never a room double-booking either: two children
// can be offsite at the same time, even at the same school.
export const OFFSITE = 'Offsite';
const OFFSITE_PREFIX = 'Offsite: ';
export function isOffsite(area) {
  return area === OFFSITE || (typeof area === 'string' && area.startsWith(OFFSITE_PREFIX));
}
export function offsiteLocation(area) {
  return isOffsite(area) && area.startsWith(OFFSITE_PREFIX) ? area.slice(OFFSITE_PREFIX.length).trim() : '';
}
export function makeOffsiteArea(location) {
  const loc = (location || '').trim();
  return loc ? `${OFFSITE_PREFIX}${loc}` : OFFSITE;
}
// Short label for badges on the grid: just the location, or "Offsite".
export function roomBadgeLabel(area) {
  if (!area) return area;
  return isOffsite(area) ? (offsiteLocation(area) || OFFSITE) : area;
}
// Longer label for lists (patient chart, caseload): "Offsite · location".
export function roomDisplayText(area) {
  if (!area) return area;
  if (!isOffsite(area)) return area;
  const loc = offsiteLocation(area);
  return loc ? `${OFFSITE} \u00b7 ${loc}` : OFFSITE;
}

// A patient's past offsite locations, most recent first, for suggestions.
export function useOffsiteLocationSuggestions(patientName, enabled = true) {
  // Results are tagged with the patient they belong to, so switching
  // patients never shows the previous patient's places, even for a moment.
  const [result, setResult] = useState({ patient: null, locations: [] });
  const active = enabled && !!patientName;
  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    api.getPatientAppointments(patientName)
      .then(rows => {
        if (cancelled) return;
        const seen = new Set();
        const list = [];
        (rows || []).forEach(r => {
          const loc = offsiteLocation(r.treatment_area);
          const key = loc.toLowerCase();
          if (loc && !seen.has(key)) { seen.add(key); list.push(loc); }
        });
        setResult({ patient: patientName, locations: list });
      })
      .catch(() => { if (!cancelled) setResult({ patient: patientName, locations: [] }); });
    return () => { cancelled = true; };
  }, [patientName, active]);
  return active && result.patient === patientName ? result.locations : [];
}

export function roomColor(room) {
  // Same eight rooms, muted/desaturated so the grid reads calmer -- these
  // stay distinct from each other since room color-scanning is a real
  // workflow need, just toned down from the original bold saturated fills.
  const map = {
    Green: '#6B9C82',
    Yellow: '#B8923D',
    'Orange A': '#C97A4A',
    'Orange B': '#D68A57',
    Purple: '#9B8FC9',
    'Gym A': '#C97088',
    'Gym B': '#D1798F',
    'Gym Table': '#A85D68',
  };
  if (isOffsite(room)) return '#3F7F9A'; // muted slate blue, distinct from all eight rooms
  return map[room] || '#6b7280';
}

export function getAppointmentTimeRange(apt) {
  const [h, m] = apt.appointment_time.slice(0, 5).split(':').map(Number);
  const start = h * 60 + m;
  const duration = Number(apt.duration) || 30;
  return { start, end: start + duration };
}

export function getConflictKey(c) {
  if (c.kind === 'ooo') return `ooo::${c.a.id}::${c.ooo.id}`;
  if (c.kind === 'closed') return `closed::${c.a.id}::${c.a.appointment_date}`;
  if (c.kind === 'contracted-gap') return `gap::${c.a.id}::${c.gap.provider}::${c.gap.date}::${c.gap.start_time}`;
  return [c.a.id, c.b.id].sort().join('::');
}

// Shared conflict-detection logic: same-provider/room/patient double-bookings,
// provider-appointment-vs-OOO overlaps, and provider-appointment-vs-not-
// contracted-hours overlaps. Works across any set of appointments/OOO
// records spanning one day or many -- date equality is checked explicitly
// so it's safe to pass in a multi-week window. contractedGaps is a flat
// array of { provider, date, start_time, end_time } -- the live-computed
// gaps between office hours and a provider's contracted schedule, the
// same data the schedule grid grays out, just also checked here so
// scheduling directly on top of one gets flagged rather than passing
// silently.
// closedDates: [{ date, reason }] from /office-hours/closed-dates. Any
// non-canceled appointment on a closed day is flagged ('closed'), and the
// not-contracted check is skipped for it -- on a closed day that shading
// isn't drawn, and flagging both would double-count one appointment.
export function computeConflicts(appointments, oooRecords, contractedGaps = [], closedDates = []) {
  const list = [];
  const closedByDate = Object.fromEntries((closedDates || []).map(c => [c.date, c]));
  const nonCanceled = appointments.filter(a => a.appointment_status !== 'Canceled');

  for (let i = 0; i < nonCanceled.length; i++) {
    for (let j = i + 1; j < nonCanceled.length; j++) {
      const a = nonCanceled[i];
      const b = nonCanceled[j];
      if (a.appointment_date !== b.appointment_date) continue;
      const rangeA = getAppointmentTimeRange(a);
      const rangeB = getAppointmentTimeRange(b);
      const overlaps = rangeA.start < rangeB.end && rangeB.start < rangeA.end;
      if (!overlaps) continue;

      const types = [];
      if (a.provider && a.provider === b.provider) types.push('provider');
      if (a.treatment_area && !isOffsite(a.treatment_area) && a.treatment_area === b.treatment_area) types.push('room');
      if (a.patient_name && a.patient_name === b.patient_name) types.push('patient');

      if (types.length > 0) {
        list.push({ kind: 'pair', a, b, types });
      }
    }
  }

  nonCanceled.forEach(apt => {
    const range = getAppointmentTimeRange(apt);
    oooRecords.forEach(ooo => {
      if (ooo.provider !== apt.provider) return;
      if (ooo.ooo_date !== apt.appointment_date) return;
      const oooStart = timeToMinutes(ooo.start_time.slice(0, 5));
      const oooEnd = timeToMinutes(ooo.end_time.slice(0, 5));
      const overlaps = range.start < oooEnd && oooStart < range.end;
      if (!overlaps) return;
      list.push({ kind: 'ooo', a: apt, ooo, types: ['ooo'] });
    });
    const closed = closedByDate[apt.appointment_date];
    if (closed) {
      list.push({ kind: 'closed', a: apt, closed, types: ['closed'] });
      return;
    }
    contractedGaps.forEach(gap => {
      if (gap.provider !== apt.provider) return;
      if (gap.date !== apt.appointment_date) return;
      const gapStart = timeToMinutes(gap.start_time.slice(0, 5));
      const gapEnd = timeToMinutes(gap.end_time.slice(0, 5));
      const overlaps = range.start < gapEnd && gapStart < range.end;
      if (!overlaps) return;
      list.push({ kind: 'contracted-gap', a: apt, gap, types: ['contracted-gap'] });
    });
  });

  return list;
}

export function oooTypeColor(type) {
  const map = {
    Vacation: '#ec4899',
    Meeting: '#3b82f6',
    Unavailable: '#6b7280',
    Lunch: '#f59e0b',
    Break: '#8b5cf6',
    Other: '#6b7280',
    PTO: '#166534',
    UPTO: '#86EFAC',
  };
  return map[type] || '#6b7280';
}

// Fill, top border and label color for an out-of-office block on the grid.
// Most types are a pale tint of their color. PTO and UPTO are solid so
// they're easy to tell apart at a glance: PTO dark green, UPTO light green.
const OOO_SOLID_BLOCKS = {
  PTO: { background: '#166534', border: '#0F3D22', text: '#FFFFFF' },
  UPTO: { background: '#BBF7D0', border: '#4ADE80', text: '#14532D' },
};
export function oooBlockColors(type) {
  if (OOO_SOLID_BLOCKS[type]) return OOO_SOLID_BLOCKS[type];
  const c = oooTypeColor(type);
  return {
    background: `color-mix(in srgb, ${c} 16%, white)`,
    border: `color-mix(in srgb, ${c} 60%, white)`,
    text: `color-mix(in srgb, ${c} 75%, black)`,
  };
}

// ---------- Minimal line-icon set (no emoji) ----------
function Icon({ path, size = 14, color = 'currentColor', strokeWidth = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {path}
    </svg>
  );
}
export const ChevronLeft = (p) => <Icon {...p} path={<polyline points="15 18 9 12 15 6" />} />;
export const ChevronRight = (p) => <Icon {...p} path={<polyline points="9 18 15 12 9 6" />} />;
export const CalendarIcon = (p) => <Icon {...p} path={<><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>} />;
export const PlusIcon = (p) => <Icon {...p} path={<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>} />;
export const UserIcon = (p) => <Icon {...p} path={<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>} />;
export const HouseIcon = (p) => <Icon {...p} path={<><path d="M3 9.5 12 3l9 6.5" /><path d="M5 10v10h14V10" /></>} />;
export const ListIcon = (p) => <Icon {...p} path={<><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></>} />;
const ClockIcon = (p) => <Icon {...p} path={<><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></>} />;

export function AppointmentCard({ apt, onClick, badgeLabel, badgeIcon, badgeColor, heightPx, onRoomClick, onStatusClick, stackIndex = 0, hasConflict, offsetWithinSlot = 0 }) {
  const color = statusColor(apt.appointment_status);
  const isCanceled = apt.appointment_status === 'Canceled';
  const isNoShow = apt.appointment_status === 'No Show';
  const hasComments = apt.comments && apt.comments.trim().length > 0;
  // Yellow allergy / immunization icons for this patient (text on hover).
  const patientAlert = alertsFor(usePatientAlerts(), apt.patient_name);
  // Yellow circles sit in the card's top-right corner, layered BEHIND the
  // text: the name keeps the card's full width and is drawn on top.
  const alertCount = (patientAlert?.allergies ? 1 : 0) + (patientAlert?.immunizations ? 1 : 0);
  // Time/duration is redundant with the card's position in the grid for a
  // typical short appointment -- only show it once there's genuinely enough
  // vertical room to spare (a 60+ minute slot), so a normal 30-minute card
  // stays down to two lines and reliably fits its row.
  const showTimeLine = heightPx >= 90;
  return (
    <div
      onClick={onClick}
      style={{
        position: 'absolute',
        top: offsetWithinSlot + CARD_MARGIN + stackIndex * 10,
        left: CARD_MARGIN + stackIndex * 10,
        right: CARD_MARGIN,
        height: heightPx,
        boxSizing: 'border-box',
        zIndex: 5 + (10 - Math.min(stackIndex, 9)),
        background: (isCanceled || isNoShow) ? `color-mix(in srgb, ${color} 30%, white)` : `color-mix(in srgb, ${color} 10%, white)`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 6,
        padding: '5px 8px',
        cursor: 'pointer',
        transition: 'box-shadow 0.15s, transform 0.1s',
        boxShadow: hasConflict ? '0 0 0 2px #dc2626, 0 2px 6px rgba(0,0,0,0.08)' : '0 0 0 1px white, 0 1px 3px rgba(0,0,0,0.1)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 1,
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = hasConflict ? '0 0 0 2px #dc2626, 0 3px 10px rgba(0,0,0,0.15)' : '0 0 0 1px white, 0 3px 10px rgba(0,0,0,0.15)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = hasConflict ? '0 0 0 2px #dc2626, 0 2px 6px rgba(0,0,0,0.08)' : '0 0 0 1px white, 0 1px 3px rgba(0,0,0,0.1)'; }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: '#1f2937', display: 'flex', alignItems: 'center', gap: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0, lineHeight: 1.2, position: 'relative', zIndex: 1 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{apt.patient_name || '(no patient)'}</span>
        {hasComments && <span style={{ color: '#dc2626', fontWeight: 700, fontSize: 13, lineHeight: 1 }}>*</span>}

      </div>
      {showTimeLine && (
        <div style={{ fontSize: 10, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {formatSlotLabel(apt.appointment_time.slice(0, 5))} &middot; {Number(apt.duration) || 30} min
        </div>
      )}
      {badgeLabel && (
        <div style={{ flexShrink: 0, lineHeight: 1.2, position: 'relative', zIndex: 1 }}>
          <span
            onClick={onRoomClick ? (e) => { e.stopPropagation(); onRoomClick(e); } : undefined}
            style={{
              fontSize: 10, fontWeight: badgeColor ? 700 : 400, borderRadius: 4, padding: '1px 6px',
              background: badgeColor ? `color-mix(in srgb, ${badgeColor} 14%, white)` : 'rgba(0,0,0,0.045)',
              color: badgeColor || '#4b5563', cursor: onRoomClick ? 'pointer' : 'default',
              display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {badgeLabel}
          </span>
        </div>
      )}
      <div style={{ flexShrink: 0, lineHeight: 1.2, position: 'relative', zIndex: 1 }}>
        <span
          onClick={onStatusClick ? (e) => { e.stopPropagation(); onStatusClick(e); } : undefined}
          style={{
            fontSize: 10, fontWeight: 600, borderRadius: 10, padding: '1px 7px', cursor: onStatusClick ? 'pointer' : 'default',
            background: `color-mix(in srgb, ${color} 16%, white)`, color, whiteSpace: 'nowrap', display: 'inline-block',
          }}>
          {apt.appointment_status}
        </span>
      </div>
      {alertCount > 0 && (
        <div style={{ position: 'absolute', top: 4, right: 4, display: 'flex', gap: 2, zIndex: 0 }}>
          {patientAlert.allergies && <AlertSymbol kind="allergies" size={13} title={`Allergies: ${patientAlert.allergies}`} />}
          {patientAlert.immunizations && <AlertSymbol kind="immunizations" size={13} title={`Immunizations: ${patientAlert.immunizations}`} />}
        </div>
      )}
    </div>
  );
}

export function programColor(programValue) {
  const map = {
    EI: '#3b82f6', 'BCBS/Anthem': '#059669', 'BCBS/Anthen': '#059669', CIGNA: '#059669', CPSE: '#8b5cf6', CSE: '#8b5cf6',
    GHI: '#059669', P: '#059669', PP: '#059669', NONE: '#6b7280',
  };
  const first = (programValue || '').split(',')[0].trim();
  return map[first] || '#6b7280';
}

function formatDateMMDDYYYY(dateStr) {
  if (!dateStr) return dateStr;
  // Expects "YYYY-MM-DD" from the database; anything else is returned
  // unchanged rather than guessed at.
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!match) return dateStr;
  const [, year, month, day] = match;
  return `${month}.${day}.${year}`;
}

function PatientDetailsPanel({ patientName }) {
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setPatient(null);

    (async () => {
      try {
        const data = await api.getPatient(patientName);
        if (cancelled) return;
        if (!data) {
          setNotFound(true);
        } else {
          setPatient(data);
        }
      } catch (err) {
        if (!cancelled) setNotFound(true);
      }
      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [patientName]);

  if (loading) return <p style={{ fontSize: 12.5, color: '#9ca3af' }}>Loading patient details...</p>;
  if (notFound || !patient) return <p style={{ fontSize: 12.5, color: '#9ca3af' }}>No matching patient record found in Patients.</p>;

  const row = (label, value) => {
    if (!value) return null;
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, padding: '5px 0', borderBottom: '1px solid #EDE9F7' }}>
        <span style={{ color: BRAND.muted }}>{label}</span>
        <span style={{ color: '#241A33', fontWeight: 500, textAlign: 'right' }}>{value}</span>
      </div>
    );
  };

  const sectionHeader = (label) => (
    <p style={ledgerSectionHeaderStyle()}>{label}</p>
  );

  const emptyNote = <p style={{ fontSize: 13, color: BRAND.muted, margin: 0, fontStyle: 'italic' }}>None on file</p>;

  const programValues = (patient.Program || '').split(',').map(s => s.trim()).filter(Boolean);

  const parentFields = [patient.Parent_Name, patient.Relationship_To_Patient, patient.Parent_Phone, patient.Parent_Email];
  const hasParentInfo = parentFields.some(Boolean);

  const patientInfoFields = [patient.Date_of_Birth, patient.ID_Number];
  const hasPatientInfo = patientInfoFields.some(Boolean) || patient.Picture_Consent !== null;

  const servicesFields = [patient.Services, patient.Mandate, patient.Case_Manager, patient.SC_Admin_Name];
  const hasServicesInfo = servicesFields.some(Boolean);

  const ifspFields = [patient.IFSP_Type, patient.IFSP_Start_Date, patient.IFSP_End_Date];
  const hasIfspInfo = ifspFields.some(Boolean);

  const rxFields = [patient.RX_Date, patient.RX_Expiration, patient.Report_Date];
  const hasRxInfo = rxFields.some(Boolean);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: BRAND_SERIF, fontSize: 18, fontWeight: 700, color: '#241A33' }}>{patient.Name}</span>
        {programValues.map(prog => (
          <span key={prog} style={{
            fontSize: 10.5, fontWeight: 700, borderRadius: 3, padding: '2px 8px', letterSpacing: '0.03em', textTransform: 'uppercase',
            background: `color-mix(in srgb, ${programColor(prog)} 14%, white)`, color: programColor(prog),
          }}>
            {prog}
          </span>
        ))}
      </div>

      <div style={{ marginBottom: 16 }}>
        {sectionHeader('Parent / Guardian')}
        <div style={{ border: `1.5px solid ${BRAND.box}`, borderRadius: 3, background: '#FCFBFE', padding: hasParentInfo ? '2px 12px' : '10px 12px' }}>
          {hasParentInfo ? (
            <>
              {row('Name', patient.Parent_Name)}
              {row('Relationship', patient.Relationship_To_Patient)}
              {row('Phone', patient.Parent_Phone)}
              {row('Email', patient.Parent_Email)}
            </>
          ) : emptyNote}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        {sectionHeader('Patient Info')}
        <div style={{ border: `1.5px solid ${BRAND.box}`, borderRadius: 3, background: '#FCFBFE', padding: hasPatientInfo ? '2px 12px' : '10px 12px' }}>
          {hasPatientInfo ? (
            <>
              {row('Date of Birth', formatDateMMDDYYYY(patient.Date_of_Birth))}
              {row('ID#', patient.ID_Number)}
              {patient.Picture_Consent !== null && row('Picture Consent', patient.Picture_Consent ? 'Yes' : 'No')}
            </>
          ) : emptyNote}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          {sectionHeader('Services & Care Team')}
          {hasServicesInfo ? (
            <>
              {row('Services', patient.Services)}
              {row('Mandate', patient.Mandate)}
              {row('Case Manager', patient.Case_Manager)}
              {row('SC / Admin', patient.SC_Admin_Name)}
            </>
          ) : emptyNote}
        </div>
        <div>
          {sectionHeader('IFSP')}
          {hasIfspInfo ? (
            <>
              {row('Type', patient.IFSP_Type)}
              {row('Start Date', formatDateMMDDYYYY(patient.IFSP_Start_Date))}
              {row('End Date', formatDateMMDDYYYY(patient.IFSP_End_Date))}
            </>
          ) : emptyNote}
        </div>
      </div>

      {hasRxInfo && (
        <div style={{ marginBottom: 16 }}>
          {sectionHeader('Prescription & Reports')}
          {row('RX Date', formatDateMMDDYYYY(patient.RX_Date))}
          {row('RX Expiration', formatDateMMDDYYYY(patient.RX_Expiration))}
          {row('Report Date', formatDateMMDDYYYY(patient.Report_Date))}
        </div>
      )}

      {patient.Scheduling_Notes && (
        <div>
          {sectionHeader('Notes')}
          <p style={{ fontSize: 13, color: '#374151', whiteSpace: 'pre-wrap', margin: 0 }}>{patient.Scheduling_Notes}</p>
        </div>
      )}

      {patient.Google_Link && (
        <div style={{ marginTop: 16 }}>
          {sectionHeader('Google Link')}
          <a
            href={patient.Google_Link}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 13, color: BRAND.forest, fontWeight: 600, wordBreak: 'break-all' }}
          >
            {patient.Google_Link}
          </a>
        </div>
      )}
    </div>
  );
}

function generateCalendarDays(viewMonth) {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPadding = firstDay.getDay();
  const days = [];
  for (let i = 0; i < startPadding; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));
  return days;
}

export function CalendarPicker({ value, onChange }) {
  const [viewMonth, setViewMonth] = useState(() => value ? new Date(value + 'T00:00:00') : new Date());
  const days = generateCalendarDays(viewMonth);
  const todayStr = dateToInputValue(new Date());

  return (
    <div style={{ border: '1px solid #e2e4e9', borderRadius: 8, padding: 10, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button type="button" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))} style={iconBtnStyle()}>
          <ChevronLeft size={13} />
        </button>
        <span style={{ fontWeight: 600, fontSize: 13, color: '#1f2937' }}>
          {viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </span>
        <button type="button" onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))} style={iconBtnStyle()}>
          <ChevronRight size={13} />
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, color: '#9ca3af', fontWeight: 600 }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {days.map((day, idx) => {
          if (!day) return <div key={idx} />;
          const dayStr = dateToInputValue(day);
          const isSelected = dayStr === value;
          const isToday = dayStr === todayStr;
          return (
            <button
              type="button"
              key={idx}
              onClick={() => onChange(dayStr)}
              style={{
                width: 28, height: 28, borderRadius: '50%', border: 'none', fontSize: 12, cursor: 'pointer', margin: '0 auto',
                background: isSelected ? BRAND.forest : isToday ? BRAND.tint : 'transparent',
                color: isSelected ? 'white' : isToday ? BRAND.forest : '#374151',
              }}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TimePicker({ value, onChange }) {
  const [h, m] = (value || '09:00').split(':');
  const hours = [];
  for (let i = 8; i <= 18; i++) hours.push(String(i).padStart(2, '0'));
  const minutes = ['00', '15', '30', '45'];

  return (
    <div style={{ border: '1px solid #e2e4e9', borderRadius: 8, padding: 10, marginBottom: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <p style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, margin: '0 0 4px 0' }}>HOUR</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, maxHeight: 110, overflowY: 'auto' }}>
            {hours.map(hh => (
              <button
                type="button" key={hh} onClick={() => onChange(`${hh}:${m}`)}
                style={{ padding: '5px 0', borderRadius: 6, border: 'none', fontSize: 11, cursor: 'pointer', background: h === hh ? '#6D28D9' : '#f3f4f6', color: h === hh ? 'white' : '#374151' }}
              >
                {formatSlotLabel(`${hh}:00`).replace(':00', '')}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, margin: '0 0 4px 0' }}>MINUTE</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
            {minutes.map(mm => (
              <button
                type="button" key={mm} onClick={() => onChange(`${h}:${mm}`)}
                style={{ padding: '5px 0', borderRadius: 6, border: 'none', fontSize: 11, cursor: 'pointer', background: m === mm ? '#6D28D9' : '#f3f4f6', color: m === mm ? 'white' : '#374151' }}
              >
                :{mm}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DateField({ label, value, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <label style={labelStyle()}>{label}</label>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ ...inputStyle(), textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <CalendarIcon size={13} color="#6b7280" />
        {value ? new Date(value + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Select date'}
      </button>
      {open && <CalendarPicker value={value} onChange={(v) => { onChange(v); setOpen(false); }} />}
    </div>
  );
}

function TimeField({ label, value, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <label style={labelStyle()}>{label}</label>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ ...inputStyle(), textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <ClockIcon size={13} color="#6b7280" />
        {value ? formatSlotLabel(value) : 'Select time'}
      </button>
      {open && <TimePicker value={value} onChange={onChange} />}
    </div>
  );
}

function parseComments(raw) {
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (err) {
    // Pre-existing flat-text comment from before this format existed.
    return [{ id: 0, author_username: null, author_display: null, timestamp: null, text: raw, legacy: true }];
  }
}

function formatCommentTimestamp(isoString) {
  if (!isoString) return '';
  return new Date(isoString).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// `onAppend(text)` / `onRemove(commentId)`: optional -- post somewhere other
// than a calendar row (a shared meeting thread). Each returns the updated
// comments string.
function CommentsThread({ table, recordId, comments, currentUser, onUpdated, isVirtual, onMaterialize, onAppend, onRemove, label = 'Comments' }) {
  const [newComment, setNewComment] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const commentsList = parseComments(comments);
  const isAdmin = currentUser?.role === 'admin';

  const handleSend = async () => {
    if (!newComment.trim()) return;
    setSending(true);
    setError(null);
    try {
      if (onAppend) {
        const updatedComments = await onAppend(newComment.trim());
        setSending(false);
        setNewComment('');
        onUpdated(updatedComments);
        return;
      }
      let targetId = recordId;
      if (isVirtual) {
        // First comment on an occurrence that's never been touched before
        // -- materialize it into a real row first (unchanged otherwise),
        // the same way any other edit to a single occurrence would, then
        // attach the comment to that new real row.
        const materialized = await onMaterialize();
        targetId = materialized.id;
      }
      const appendFn = table === 'Appointments' ? api.appendAppointmentComment : api.appendOOOComment;
      const updated = await appendFn(targetId, newComment.trim());
      setSending(false);
      setNewComment('');
      onUpdated(updated.comments, targetId);
    } catch (err) {
      setSending(false);
      setError(err.message);
    }
  };

  const handleDelete = async (commentId) => {
    if (!window.confirm('Delete this comment? This cannot be undone.')) return;
    setError(null);
    try {
      if (onRemove) { onUpdated(await onRemove(commentId)); return; }
      const deleteFn = table === 'Appointments' ? api.deleteAppointmentComment : api.deleteOOOComment;
      const updated = await deleteFn(recordId, commentId);
      onUpdated(updated.comments);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <label style={labelStyle()}>{label}</label>
      <div style={{ background: '#f9fafb', borderRadius: 8, padding: 10, marginBottom: 8, maxHeight: 180, overflowY: 'auto' }}>
        {commentsList.length === 0 ? (
          <p style={{ fontSize: 12.5, color: '#9ca3af', textAlign: 'center', margin: 0 }}>No comments yet</p>
        ) : (
          commentsList.map(c => {
            const canDelete = !c.legacy && (c.author_username === currentUser?.username || isAdmin);
            return (
              <div key={c.id} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280' }}>
                    {c.legacy ? 'Legacy note' : (c.author_display || c.author_username)}
                    {c.timestamp && <span style={{ fontWeight: 400, color: '#9ca3af' }}> &middot; {formatCommentTimestamp(c.timestamp)}</span>}
                  </span>
                  {canDelete && (
                    <button
                      onClick={() => handleDelete(c.id)}
                      style={{ border: 'none', background: 'none', color: '#c1c5cc', fontSize: 11, cursor: 'pointer', padding: 0, flexShrink: 0 }}
                    >
                      Delete
                    </button>
                  )}
                </div>
                <p style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, color: '#374151', margin: '2px 0 0' }}>{c.text}</p>
              </div>
            );
          })
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <textarea
          value={newComment}
          onChange={e => setNewComment(e.target.value)}
          placeholder="Add a comment..."
          style={{ ...inputStyle(), minHeight: 44, marginBottom: 0, flex: 1 }}
        />
        <button
          onClick={handleSend}
          disabled={sending || !newComment.trim()}
          style={{
            padding: '9px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: sending || !newComment.trim() ? 'not-allowed' : 'pointer',
            border: 'none', background: sending || !newComment.trim() ? '#C4B5FD' : '#6D28D9', color: 'white',
          }}
        >
          {sending ? '...' : 'Send'}
        </button>
      </div>
      {error && <p style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>{error}</p>}
    </div>
  );
}

// Diagonal "Office closed" ribbon laid over a closed day. It's decoration
// only and ignores the pointer, so everything under it stays clickable and
// double-click-to-book still works. Stacking: on top of the whole day --
// shading, OOO blocks, appointment cards (zIndex up to 15) and the current-
// time line (17), all still visible through the translucent ribbon -- and
// only below the sticky header (20), so it never covers the column names. It measures its own box so the ribbon always runs
// corner to corner -- shallow across the wide daily grid, steep down a
// single Weekly View column. Position it with `style` (top/left/width...).
// Quick room menu opened from an appointment card (daily and weekly grids)
// or the Unassigned list. Rooms save with one click. "Offsite..." switches
// the menu to a location box -- optional, with this patient's past offsite
// locations suggested -- and Save/Enter stores it. Rendered by the caller
// inside its own portal + backdrop, positioned at { top, left }.
export function RoomPickerMenu({ apt, top, left, onPick, onClose }) {
  const current = apt.treatment_area || '';
  const [offsiteMode, setOffsiteMode] = useState(false);
  const [location, setLocation] = useState(offsiteLocation(current));
  const suggestions = useOffsiteLocationSuggestions(apt.patient_name, offsiteMode);
  const listId = `kl-offsite-suggestions-${apt.id || apt.series_id || 'new'}`;
  const itemStyle = (active) => ({
    padding: '7px 10px', fontSize: 13, borderRadius: 6, cursor: 'pointer',
    background: active ? '#f3f4f6' : 'transparent', color: '#374151',
  });
  const hover = (active) => ({
    onMouseEnter: e => { e.currentTarget.style.background = '#f9fafb'; },
    onMouseLeave: e => { e.currentTarget.style.background = active ? '#f3f4f6' : 'transparent'; },
  });
  const saveOffsite = () => onPick(makeOffsiteArea(location));

  return (
    <div
      style={{
        position: 'fixed', top, left, zIndex: 9999,
        background: 'white', border: '1px solid #e2e4e9', borderRadius: 8, boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
        minWidth: offsiteMode ? 240 : 150, maxHeight: offsiteMode ? 'none' : 260, overflowY: offsiteMode ? 'visible' : 'auto', padding: 4,
      }}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
    >
      {!offsiteMode ? (
        <>
          {TREATMENT_AREA_OPTIONS.map(room => (
            <div key={room} role="button" tabIndex={0} onClick={() => onPick(room)} onKeyDown={e => { if (e.key === 'Enter') onPick(room); }} style={itemStyle(current === room)} {...hover(current === room)}>
              {room}
            </div>
          ))}
          <div style={{ height: 1, background: '#f1f2f4', margin: '4px 2px' }} />
          <div
            role="button"
            tabIndex={0}
            onClick={() => setOffsiteMode(true)}
            onKeyDown={e => { if (e.key === 'Enter') setOffsiteMode(true); }}
            style={{ ...itemStyle(isOffsite(current)), display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
            {...hover(isOffsite(current))}
          >
            <span>Offsite&hellip;</span>
            {isOffsite(current) && offsiteLocation(current) && (
              <span style={{ fontSize: 11.5, color: '#9ca3af', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{offsiteLocation(current)}</span>
            )}
          </div>
        </>
      ) : (
        <div style={{ padding: 6 }}>
          <label htmlFor={`${listId}-input`} style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: '#374151', marginBottom: 4 }}>
            Offsite location <span style={{ fontWeight: 500, color: '#9ca3af' }}>(optional)</span>
          </label>
          <input
            id={`${listId}-input`}
            list={listId}
            autoFocus
            value={location}
            onChange={e => setLocation(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveOffsite(); } }}
            placeholder="e.g. Sunnyside Elementary"
            style={{ width: '100%', boxSizing: 'border-box', padding: '7px 9px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13 }}
          />
          <datalist id={listId}>
            {suggestions.map(loc => <option key={loc} value={loc} />)}
          </datalist>
          {suggestions.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
              {suggestions.slice(0, 4).map(loc => (
                <button key={loc} type="button" onClick={() => setLocation(loc)} title="Used before for this patient"
                  style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, border: '1px solid #cfe0e7', background: '#F0F7FA', color: '#2F6479', cursor: 'pointer', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {loc}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button type="button" onClick={saveOffsite} style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: 'none', background: '#6D28D9', color: 'white', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
              Save
            </button>
            <button type="button" onClick={() => setOffsiteMode(false)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e2e4e9', background: 'white', color: '#374151', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// The location box shown in the appointment form when Treatment Area is
// Offsite -- optional, with the patient's past offsite locations suggested.
function OffsiteLocationField({ patientName, value, onChange, inputStyle, labelStyle }) {
  const suggestions = useOffsiteLocationSuggestions(patientName);
  const unused = suggestions.filter(loc => loc.toLowerCase() !== value.trim().toLowerCase());
  return (
    <div style={{ marginTop: -6, marginBottom: 14 }}>
      <label htmlFor="kl-offsite-location" style={labelStyle}>
        Offsite location <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: '#9ca3af' }}>(optional)</span>
      </label>
      <input
        id="kl-offsite-location"
        list="kl-offsite-location-suggestions"
        style={inputStyle}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="e.g. Sunnyside Elementary"
      />
      <datalist id="kl-offsite-location-suggestions">
        {suggestions.map(loc => <option key={loc} value={loc} />)}
      </datalist>
      {unused.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginTop: -6 }}>
          <span style={{ fontSize: 11, color: '#9ca3af' }}>Used before:</span>
          {unused.slice(0, 5).map(loc => (
            <button key={loc} type="button" onClick={() => onChange(loc)}
              style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, border: '1px solid #cfe0e7', background: '#F0F7FA', color: '#2F6479', cursor: 'pointer' }}>
              {loc}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function closedDayLabel(reason) {
  return !reason || reason === 'Office closed' ? 'Office closed' : `Office closed \u00b7 ${reason}`;
}

export function ClosedDaySash({ reason, style }) {
  const ref = useRef(null);
  const [box, setBox] = useState(null);
  // Starts below the grid's header row (the <thead> of the table it's laid
  // over), so the ribbon's angle is measured on the time slots alone.
  const [headerHeight, setHeaderHeight] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const head = el.parentElement?.querySelector('thead');
      setHeaderHeight(head ? head.offsetHeight : 0);
      setBox({ w: el.clientWidth, h: el.clientHeight });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const label = closedDayLabel(reason);
  const angle = box && box.w > 0 ? (Math.atan2(box.h, box.w) * 180) / Math.PI : 30;
  const length = box ? Math.hypot(box.w, box.h) + 200 : 0;
  return (
    <div
      ref={ref}
      role="img"
      aria-label={label}
      title={label}
      style={{
        position: 'absolute', top: headerHeight, bottom: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 18,
        background: 'rgba(109, 40, 217, 0.035)',
        ...style,
      }}
    >
      {box && (
        <div
          style={{
            position: 'absolute', left: '50%', top: '50%', width: length,
            transform: `translate(-50%, -50%) rotate(-${angle}deg)`,
            background: 'rgba(109, 40, 217, 0.13)',
            borderTop: '2px solid rgba(109, 40, 217, 0.35)', borderBottom: '2px solid rgba(109, 40, 217, 0.35)',
            padding: '10px 0', display: 'flex', justifyContent: 'center', gap: 90, whiteSpace: 'nowrap',
            color: BRAND.brassText, fontSize: 15, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          }}
        >
          {Array.from({ length: Math.max(1, Math.ceil(length / 450)) }, (_, i) => (
            <span key={i} aria-hidden={i > 0 ? 'true' : undefined}>{label}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export function ConflictReviewModal({ conflict, onClose, onEditAppointment }) {
  const items = [conflict.a, conflict.b];
  const typeLabels = conflict.types.map(t => t === 'provider' ? 'same provider' : t === 'room' ? 'same room' : 'same patient').join(', ');
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }} onClick={onClose}>
      <div
        style={{ background: 'white', borderRadius: 12, padding: 20, width: '100%', maxWidth: 640, maxHeight: '85vh', overflowY: 'auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}
        onClick={e => e.stopPropagation()}
      >
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 4px 0', color: '#111827' }}>Scheduling Conflict</h2>
        <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px 0' }}>These two appointments conflict ({typeLabels}). Review and edit either one to resolve it.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {items.map((apt, idx) => {
            const color = statusColor(apt.appointment_status);
            return (
              <div key={apt.id} style={{ border: '1px solid #eef0f3', borderRadius: 10, padding: 14, background: '#fafbfc' }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#1f2937', margin: '0 0 8px 0' }}>{apt.patient_name || '(no patient)'}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, color: '#4b5563', marginBottom: 10 }}>
                  <span><UserIcon size={11} color="#9ca3af" /> {apt.provider}</span>
                  <span><CalendarIcon size={11} color="#9ca3af" /> {formatSlotLabel(apt.appointment_time.slice(0, 5))} · {apt.duration || 30} min</span>
                  {apt.treatment_area && <span><HouseIcon size={11} color="#9ca3af" /> {roomDisplayText(apt.treatment_area)}</span>}
                </div>
                <span style={{
                  display: 'inline-block', fontSize: 10.5, fontWeight: 600, borderRadius: 10, padding: '3px 9px', marginBottom: 12,
                  background: `color-mix(in srgb, ${color} 16%, white)`, color,
                }}>
                  {apt.appointment_status}
                </span>
                <button
                  onClick={() => onEditAppointment(apt)}
                  style={{ display: 'block', width: '100%', padding: '7px 12px', borderRadius: 8, border: '1px solid #e2e4e9', background: 'white', color: '#374151', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
                >
                  View / Edit
                </button>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #e2e4e9', background: 'white', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// NOTE: Authentication was removed here during the Supabase -> AWS migration.
// Supabase Auth doesn't exist in this architecture. Per an earlier decision,
// a real auth approach (custom Cognito-based login, or giving each staff
// member their own login some other way) is being deferred and rebuilt as
// a separate, deliberate next step -- not silently skipped.
// Scheduling needs the full multi-provider grid, which doesn't adapt well
// to a phone-sized screen -- rather than let it overflow awkwardly, phones
// see a friendly message instead. Tablets are intentionally still allowed
// (768px is a phone-specific cutoff, tighter than the general-purpose
// useIsMobile default of 1024px used elsewhere in the app for broader
// mobile layout adjustments).
const PHONE_BREAKPOINT = 768;

function ScheduleUnavailableOnMobile() {
  const navigate = useNavigate();
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 32, textAlign: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      <p style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 6 }}>The daily grid isn't available on this screen size</p>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20, maxWidth: 340 }}>
        The daily grid needs more room than a phone screen provides. The weekly view is built for phones, or use a tablet or desktop for the daily grid.
      </p>
      <button
        onClick={() => navigate('/weekly')}
        style={{ padding: '9px 18px', borderRadius: 6, fontSize: 13, fontWeight: 600, border: 'none', background: '#6D28D9', color: 'white', cursor: 'pointer' }}
      >
        Go to Weekly View
      </button>
    </div>
  );
}

// Stable identity for an appointment in the Unassigned list. Setting a room
// on a recurring occurrence turns it into a new row with a new id, so for
// series appointments we key by series + date instead of by id.
function unassignedPinKey(apt) {
  return apt.series_id ? `s:${apt.series_id}:${apt.appointment_date}` : `a:${apt.id}`;
}

// Blue "you are here" line across the daily grid, with a dot where the
// time column ends. Drawn over the cards but under the sticky column headers.
const NOW_BLUE = '#2563EB';
const NOW_BLUE_LINE = 'rgba(37, 99, 235, 0.4)'; // 40% opacity blue

function NowLine({ top, now }) {
  const label = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return (
    <div aria-label={`Current time, ${label}`} role="img" style={{ position: 'absolute', top, left: 59, right: 0, height: 0, zIndex: 17, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: 5, right: 0, top: -1, height: 2, background: NOW_BLUE_LINE }} />
      <div style={{ position: 'absolute', left: 0, top: -5, width: 10, height: 10, borderRadius: '50%', background: NOW_BLUE, boxShadow: '0 0 0 2px white' }} />
    </div>
  );
}

export default function SchedulePage() {
  const isPhone = useIsMobile(PHONE_BREAKPOINT);
  if (isPhone) return <ScheduleUnavailableOnMobile />;
  return <ScheduleApp />;
}

function ScheduleApp() {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const selectedDateRef = useRef(selectedDate);
  selectedDateRef.current = selectedDate;
  const [providers, setProviders] = useState([]); // active providers: dropdowns, quick edits, columns
  const [archivedProviders, setArchivedProviders] = useState([]); // only get a column on days they still have appointments
  const [appointments, setAppointments] = useState([]);
  const [oooRecords, setOooRecords] = useState([]);
  // Non-contracted hours per provider for the selected date -- computed
  // live by the backend from ProviderUsualSchedule + OfficeHours every
  // time, never a stored calendar entry. Refetched whenever the visible
  // date or provider list changes.
  const [contractedGapsByProvider, setContractedGapsByProvider] = useState({});
  const [lookaheadConflicts, setLookaheadConflicts] = useState([]);
  const [showLookaheadDetails, setShowLookaheadDetails] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [viewMode, setViewMode] = useState('provider');
  const [closedInfo, setClosedInfo] = useState(null); // { date, reason } if the selected date is closed, else null

  const [showModal, setShowModal] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [prefill, setPrefill] = useState(null);
  const [dismissedConflictKeys, setDismissedConflictKeys] = useState(new Set());

  const [showOOOModal, setShowOOOModal] = useState(false);
  const [editingOOO, setEditingOOO] = useState(null);

  const [roomDropdown, setRoomDropdown] = useState(null); // { apt, top, left }
  const [providerDropdown, setProviderDropdown] = useState(null); // { apt, top, left }
  const [reviewingConflict, setReviewingConflict] = useState(null); // { a, b, types }
  const [statusDropdown, setStatusDropdown] = useState(null); // { apt, top, left }

  // ---- Current-time line on the daily grid ----
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  const isToday = dateToInputValue(selectedDate) === dateToInputValue(now);
  const [gridEl, setGridEl] = useState(null); // the grid's scrolling box
  const [nowLineTop, setNowLineTop] = useState(null); // px from top of grid content, or null if hidden
  const autoScrolledGridRef = useRef(null);

  // ---- Unassigned view: rows you've given a room stay listed until you leave the view ----
  const [pinnedUnassignedKeys, setPinnedUnassignedKeys] = useState(() => new Set());

  useEffect(() => {
    const closeDropdowns = () => { setRoomDropdown(null); setStatusDropdown(null); setProviderDropdown(null); };
    document.addEventListener('scroll', closeDropdowns, true);
    return () => document.removeEventListener('scroll', closeDropdowns, true);
  }, []);

  // Quick-edit dropdowns (room/provider/status) need the same virtual-vs-real
  // branching as the full modal: editing a virtual occurrence materializes
  // it into a real exception row instead of updating a row that doesn't exist.
  const applyQuickEdit = async (apt, fieldOverrides) => {
    const base = {
      patient_name: apt.patient_name, provider: apt.provider, appointment_time: apt.appointment_time,
      duration: apt.duration, treatment_area: apt.treatment_area, appointment_status: apt.appointment_status,
      ...fieldOverrides,
    };
    if (apt.is_virtual) {
      await api.createRecurringException(apt.series_id, {
        occurrence_date: apt.appointment_date,
        appointment_date: apt.appointment_date,
        ...base,
      });
    } else {
      await api.updateAppointment(apt.id, { ...base, appointment_date: apt.appointment_date, comments: apt.comments });
    }
  };

  const handleRoomChange = async (apt, newRoom) => {
    setRoomDropdown(null);
    await applyQuickEdit(apt, { treatment_area: newRoom });
    loadDayRef.current?.();
  };

  const handleProviderChange = async (apt, newProvider) => {
    setProviderDropdown(null);
    await applyQuickEdit(apt, { provider: newProvider });
    loadDayRef.current?.();
  };

  const handleStatusChange = async (apt, newStatus) => {
    setStatusDropdown(null);
    await applyQuickEdit(apt, { appointment_status: newStatus, treatment_area: newStatus === 'Canceled' ? null : apt.treatment_area });
    loadDayRef.current?.();
  };

  const loadProviders = useCallback(async () => {
    try {
      const data = await api.getProviders(true);
      setProviders(data.filter(p => !p.archived));
      setArchivedProviders(data.filter(p => p.archived));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  // `background: true` refreshes the data in place without swapping the grid
  // for "Loading..." -- used for the 30-second poll and after edits, so the
  // grid doesn't flicker or jump back to the top. Only a date change shows
  // the loading state.
  const loadDay = useCallback(async (date, { background = false } = {}) => {
    if (!background) setLoading(true);
    setError(null);
    const dateStr = dateToInputValue(date);

    try {
      const [apts, ooo, closedDates] = await Promise.all([
        api.getAppointments(dateStr),
        api.getOOO(dateStr),
        api.getClosedDates(dateStr, dateStr).catch(() => []),
      ]);
      setAppointments(apts);
      setOooRecords(ooo);
      setClosedInfo(closedDates.length > 0 ? closedDates[0] : null);
      setConnectionStatus('live');
    } catch (err) {
      setError(err.message);
      setConnectionStatus('error');
    }
    setLoading(false);
  }, []);

  const loadDayRef = useRef(null);
  useEffect(() => {
    loadDayRef.current = () => loadDay(selectedDateRef.current, { background: true });
  }, [loadDay]);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    loadDay(selectedDate);
  }, [selectedDate, loadDay]);

  // Used to fire one request per provider in parallel to build this map --
  // with enough providers, that burst of simultaneous requests was large
  // enough to get randomly throttled by the backend (intermittent
  // 503s/CORS failures hitting a different provider each time), which
  // looked exactly like the banner randomly vanishing for whoever's
  // request got throttled that time. A single batch request removes the
  // burst entirely. Still retried once, with an actual console log if it
  // still fails, so a genuine failure is visible rather than silently
  // read as "there's nothing to show."
  const fetchContractedGapsBatchWithRetry = async (start, end) => {
    try {
      return await api.getContractedGapsBatch(start, end);
    } catch (err) {
      await new Promise(r => setTimeout(r, 800));
      try {
        return await api.getContractedGapsBatch(start, end);
      } catch (err2) {
        console.error('Failed to load contracted gaps:', err2);
        return {};
      }
    }
  };

  useEffect(() => {
    if (providers.length === 0) return;
    const dateStr = dateToInputValue(selectedDate);
    let cancelled = false;
    fetchContractedGapsBatchWithRetry(dateStr, dateStr).then(byProvider => {
      if (cancelled) return;
      const map = {};
      providers.forEach(p => {
        map[p.Name] = byProvider[p.Name]?.[0]?.gaps || [];
      });
      setContractedGapsByProvider(map);
    });
    return () => { cancelled = true; };
  }, [providers, selectedDate]);

  // No push-based real-time on this backend (unlike Supabase) -- poll instead.
  useEffect(() => {
    const interval = setInterval(() => {
      loadDay(selectedDateRef.current, { background: true });
    }, 30000);
    return () => clearInterval(interval);
  }, [loadDay]);

  // The old client-side auto-extend mechanism for Appointments has been
  // The old client-side auto-extend mechanisms for both Appointments and
  // Out-of-Office have been removed. They shared the same flaw: no
  // duplicate-checking before creating new rows, so if the check fired from
  // more than one place around the same time, it could create redundant
  // copies of the same future occurrence that compound over time. This is
  // the same class of bug diagnosed and fixed for Appointments; OOO's full
  // migration to the new rule-based model is still a separate, upcoming
  // piece of work, but this stops any further duplication in the meantime.

  const loadLookaheadConflicts = useCallback(async () => {
    const start = dateToInputValue(new Date());
    const end = dateToInputValue(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));
    try {
      const [windowAppointments, windowOOO, gapsByProvider, windowClosed] = await Promise.all([
        api.getAppointmentsWindow(start, end),
        api.getOOOWindow(start, end),
        fetchContractedGapsBatchWithRetry(start, end),
        api.getClosedDates(start, end).catch(() => []),
      ]);
      const flatGaps = [];
      Object.entries(gapsByProvider).forEach(([providerName, dayEntries]) => {
        dayEntries.forEach(dayEntry => {
          dayEntry.gaps.forEach(g => flatGaps.push({ provider: providerName, date: dayEntry.date, start_time: g.start_time, end_time: g.end_time }));
        });
      });
      setLookaheadConflicts(computeConflicts(windowAppointments || [], windowOOO || [], flatGaps, windowClosed || []));
    } catch (err) {
      // Non-critical background check; fail silently rather than disrupting
      // the main schedule view.
    }
  }, []);

  useEffect(() => {
    loadLookaheadConflicts();
    const interval = setInterval(loadLookaheadConflicts, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadLookaheadConflicts]);

  const goToPreviousDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d);
  };
  const goToNextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d);
  };
  const goToToday = () => setSelectedDate(new Date());

  // Columns on the daily grid: every active provider, plus an archived one
  // only when they still have a non-canceled appointment that day -- so a
  // leftover booking never silently disappears. Past days work the same way.
  const gridProviders = useMemo(() => {
    const extra = archivedProviders.filter(p => appointments.some(a => a.provider === p.Name && a.appointment_status !== 'Canceled'));
    return extra.length ? [...providers, ...extra] : providers;
  }, [providers, archivedProviders, appointments]);

  const grid = useMemo(() => {
    const map = {};
    gridProviders.forEach(p => {
      map[p.Name] = {};
      TIME_SLOTS.forEach(t => { map[p.Name][t] = []; });
    });

    appointments.forEach(apt => {
      const providerName = apt.provider || 'Unassigned';
      if (!map[providerName]) return;
      const aptMinutes = timeToMinutes(apt.appointment_time.slice(0, 5));
      let closestSlot = TIME_SLOTS[0];
      TIME_SLOTS.forEach(slot => {
        if (timeToMinutes(slot) <= aptMinutes) closestSlot = slot;
      });
      if (map[providerName][closestSlot]) {
        map[providerName][closestSlot].push(apt);
      }
    });

    return map;
  }, [gridProviders, appointments]);

  const roomGrid = useMemo(() => {
    const map = {};
    TREATMENT_AREA_OPTIONS.forEach(room => {
      map[room] = {};
      TIME_SLOTS.forEach(t => { map[room][t] = []; });
    });

    appointments.forEach(apt => {
      const room = apt.treatment_area;
      if (!room || !map[room]) return;
      const aptMinutes = timeToMinutes(apt.appointment_time.slice(0, 5));
      let closestSlot = TIME_SLOTS[0];
      TIME_SLOTS.forEach(slot => {
        if (timeToMinutes(slot) <= aptMinutes) closestSlot = slot;
      });
      if (map[room][closestSlot]) {
        map[room][closestSlot].push(apt);
      }
    });

    return map;
  }, [appointments]);

  // Start fresh whenever you open the Unassigned view or change the date...
  useEffect(() => { setPinnedUnassignedKeys(new Set()); }, [viewMode, selectedDate]);
  // ...then remember every appointment that showed up here as unassigned, so
  // it stays in the list after you pick a room for it.
  useEffect(() => {
    if (viewMode !== 'unassigned') return;
    setPinnedUnassignedKeys(prev => {
      let next = prev;
      appointments.forEach(apt => {
        if (apt.treatment_area || apt.appointment_status === 'Canceled' || isHoldPatient(apt.patient_name)) return;
        const key = unassignedPinKey(apt);
        if (!next.has(key)) { if (next === prev) next = new Set(prev); next.add(key); }
      });
      return next;
    });
  }, [appointments, viewMode]);

  const unassignedAppointments = useMemo(() => {
    return appointments
      .filter(apt => apt.appointment_status !== 'Canceled' && !isHoldPatient(apt.patient_name) && (!apt.treatment_area || pinnedUnassignedKeys.has(unassignedPinKey(apt))))
      .sort((a, b) => a.appointment_time.localeCompare(b.appointment_time));
  }, [appointments, pinnedUnassignedKeys]);

  // Position the blue current-time line from the real row positions, and on
  // first showing today's grid, scroll so the line sits about a third down.
  useLayoutEffect(() => {
    if (!gridEl || !isToday) { setNowLineTop(null); return; }
    const [startH, startM] = TIME_SLOTS[0].split(':').map(Number);
    const minsFromStart = (now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60) - (startH * 60 + startM);
    const slotIndex = Math.floor(minsFromStart / 30);
    const row = slotIndex >= 0 && slotIndex < TIME_SLOTS.length ? gridEl.querySelector(`tr[data-slot="${TIME_SLOTS[slotIndex]}"]`) : null;
    if (!row) { setNowLineTop(null); return; } // before opening or after closing
    const top = row.getBoundingClientRect().top - gridEl.getBoundingClientRect().top + gridEl.scrollTop
      + ((minsFromStart - slotIndex * 30) / 30) * row.offsetHeight;
    setNowLineTop(top);
    if (autoScrolledGridRef.current !== gridEl) {
      autoScrolledGridRef.current = gridEl;
      gridEl.scrollTop = Math.max(0, top - gridEl.clientHeight / 3);
    }
  }, [gridEl, isToday, now, appointments, providers, viewMode]);

  const oooByProvider = useMemo(() => {
    const map = {};
    providers.forEach(p => { map[p.Name] = []; });
    oooRecords.forEach(ooo => {
      if (!map[ooo.provider]) map[ooo.provider] = [];
      map[ooo.provider].push(ooo);
    });
    return map;
  }, [providers, oooRecords]);

  const oooCoveringSlot = (providerName, time) => {
    const slotMinutes = timeToMinutes(time);
    const records = oooByProvider[providerName] || [];
    return records.find(ooo => {
      const start = timeToMinutes(ooo.start_time.slice(0, 5));
      const end = timeToMinutes(ooo.end_time.slice(0, 5));
      return slotMinutes >= start && slotMinutes < end;
    });
  };

  // Non-contracted shading per row comes from gapSegmentsForSlot (top of file).

  const flatContractedGaps = useMemo(() => {
    const dateStr = dateToInputValue(selectedDate);
    const flat = [];
    Object.entries(contractedGapsByProvider).forEach(([provider, gaps]) => {
      gaps.forEach(g => flat.push({ provider, date: dateStr, start_time: g.start_time, end_time: g.end_time }));
    });
    return flat;
  }, [contractedGapsByProvider, selectedDate]);

  const allConflicts = useMemo(() => computeConflicts(appointments, oooRecords, flatContractedGaps, closedInfo ? [closedInfo] : []), [appointments, oooRecords, flatContractedGaps, closedInfo]);

  const futureLookaheadConflicts = useMemo(() => {
    const todayStr = dateToInputValue(new Date());
    return lookaheadConflicts.filter(c => c.a.appointment_date !== todayStr);
  }, [lookaheadConflicts]);

  const activeConflicts = useMemo(() => {
    const active = allConflicts.filter(c => !dismissedConflictKeys.has(getConflictKey(c)));
    const ids = new Set();
    active.forEach(c => {
      ids.add(c.a.id);
      if (c.kind === 'pair') ids.add(c.b.id);
    });
    return { list: active, ids };
  }, [allConflicts, dismissedConflictKeys]);

  const dismissedConflictsList = useMemo(() => {
    return allConflicts.filter(c => dismissedConflictKeys.has(getConflictKey(c)));
  }, [allConflicts, dismissedConflictKeys]);

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f6f7f9', height: '100vh', padding: '20px 28px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ marginBottom: 16, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <h1 style={{ fontFamily: BRAND_SERIF, fontSize: 19, fontWeight: 700, margin: 0, color: '#241A33', whiteSpace: 'nowrap' }}>
            Today's Appointments
          </h1>

          <button onClick={goToPreviousDay} style={iconBtnStyle()}><ChevronLeft size={14} /></button>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setShowDatePicker(o => !o)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 4,
                border: `1.5px solid ${BRAND.box}`, background: 'white', fontWeight: 600, fontSize: 13,
                color: '#241A33', cursor: 'pointer', width: 236, boxSizing: 'border-box', justifyContent: 'flex-start',
              }}
            >
              <CalendarIcon size={14} color={BRAND.forest} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
            </button>
            {showDatePicker && (
              <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 50, background: 'white', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', borderRadius: 4 }}>
                <CalendarPicker
                  value={dateToInputValue(selectedDate)}
                  onChange={(v) => { setSelectedDate(new Date(v + 'T00:00:00')); setShowDatePicker(false); }}
                />
              </div>
            )}
          </div>
          <button onClick={goToNextDay} style={iconBtnStyle()}><ChevronRight size={14} /></button>
          <button onClick={goToToday} style={secondaryBtnStyle()}>Today</button>

          <Dot />
          <button onClick={() => { setEditingAppointment(null); setPrefill(null); setShowModal(true); }} style={primaryBtnStyle()}>
            <PlusIcon size={13} color="white" /> Create Appointment
          </button>
          <button onClick={() => navigate('/time')} style={secondaryBtnStyle()} title="Out of Office is now requested from My time, so it can go through approval">
            <PlusIcon size={13} /> Request Time Off
          </button>

          <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1.5px solid #dc2626', marginLeft: 'auto' }}>
            <button onClick={() => setViewMode('provider')} style={segmentBtnStyle(viewMode === 'provider')}>
              <UserIcon size={14} /> Provider
            </button>
            <button onClick={() => setViewMode('room')} style={segmentBtnStyle(viewMode === 'room')}>
              <HouseIcon size={14} /> Room
            </button>
            <button onClick={() => setViewMode('unassigned')} style={{ ...segmentBtnStyle(viewMode === 'unassigned'), borderRight: 'none' }}>
              <ListIcon size={14} /> Unassigned
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: connectionStatus === 'live' ? '#10b981' : connectionStatus === 'error' ? '#dc2626' : '#f59e0b',
            }} />
            <span style={{ fontSize: 11.5, color: '#9ca3af' }}>
              {connectionStatus === 'live' ? 'Connected — refreshes every 30s' : connectionStatus === 'error' ? 'Connection issue' : 'Connecting...'}
            </span>
          </div>
        </div>
      </div>

      {/* On the grid views a closed day gets the diagonal sash instead (ClosedDaySash). */}
      {closedInfo && viewMode === 'unassigned' && (
        <div style={{ marginBottom: 10, borderRadius: 10, background: '#F3F0FB', border: `1.5px solid ${BRAND.box}`, padding: '14px 16px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <CalendarIcon size={16} color={BRAND.forest} />
          <span style={{ fontSize: 13.5, fontWeight: 600, color: '#241A33' }}>{closedInfo.reason} — the office is closed on {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}.</span>
        </div>
      )}

      {futureLookaheadConflicts.length > 0 && (
        <div style={{ marginBottom: 10, borderRadius: 10, background: '#FFF7ED', border: '1px solid #FDBA74', padding: 12, flexShrink: 0 }}>
          <div
            onClick={() => setShowLookaheadDetails(o => !o)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#EA580C' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#9A3412' }}>
                {futureLookaheadConflicts.length} scheduling {futureLookaheadConflicts.length === 1 ? 'conflict' : 'conflicts'} found in the next 2 weeks
              </span>
            </div>
            <span style={{ fontSize: 12, color: '#9A3412', fontWeight: 600 }}>{showLookaheadDetails ? 'Hide' : 'Show'}</span>
          </div>
          {showLookaheadDetails && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
              {futureLookaheadConflicts.map((c, idx) => {
                const dateLabel = new Date(c.a.appointment_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                const range = getAppointmentTimeRange(c.a);
                const h = Math.floor(range.start / 60);
                const m = range.start % 60;
                const timeText = formatSlotLabel(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
                const message = c.kind === 'closed'
                  ? `${c.a.patient_name} is scheduled at ${timeText} on a day the office is closed${c.closed.reason && c.closed.reason !== 'Office closed' ? ` (${c.closed.reason})` : ''}`
                  : c.kind === 'ooo'
                  ? `${c.a.patient_name} is scheduled at ${timeText} while ${c.a.provider} is Out of Office (${c.ooo.type})`
                  : c.kind === 'contracted-gap'
                  ? `${c.a.patient_name} is scheduled at ${timeText}, outside ${c.a.provider}'s contracted hours`
                  : `${c.a.patient_name} and ${c.b.patient_name} overlap around ${timeText} (${c.types.map(t => t === 'provider' ? 'same provider' : t === 'room' ? 'same room' : 'same patient').join(', ')})`;
                return (
                  <div key={idx} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, color: '#9A3412' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600 }}>{dateLabel}</span>
                    <span style={{ fontSize: 13 }}>{message}</span>
                    <button
                      onClick={() => setSelectedDate(new Date(c.a.appointment_date + 'T00:00:00'))}
                      style={{ fontSize: 12.5, fontWeight: 600, color: '#9A3412', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
                    >
                      Go to day
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeConflicts.list.length > 0 && (
        <div style={{ marginBottom: 14, borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', padding: 14, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626' }} />
            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#991b1b' }}>
              {activeConflicts.list.length} scheduling {activeConflicts.list.length === 1 ? 'conflict' : 'conflicts'} need{activeConflicts.list.length === 1 ? 's' : ''} to be rectified
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {activeConflicts.list.map((c, idx) => {
              const range = getAppointmentTimeRange(c.a);
              const h = Math.floor(range.start / 60);
              const m = range.start % 60;
              const timeText = formatSlotLabel(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
              const message = c.kind === 'closed'
                  ? `${c.a.patient_name} is scheduled at ${timeText} on a day the office is closed${c.closed.reason && c.closed.reason !== 'Office closed' ? ` (${c.closed.reason})` : ''}`
                  : c.kind === 'ooo'
                ? `${c.a.patient_name} is scheduled at ${timeText} while ${c.a.provider} is Out of Office (${c.ooo.type}, ${formatSlotLabel(c.ooo.start_time.slice(0, 5))}–${formatSlotLabel(c.ooo.end_time.slice(0, 5))})`
                : c.kind === 'contracted-gap'
                ? `${c.a.patient_name} is scheduled at ${timeText}, outside ${c.a.provider}'s contracted hours (not contracted ${formatSlotLabel(c.gap.start_time.slice(0, 5))}–${formatSlotLabel(c.gap.end_time.slice(0, 5))})`
                : `${c.a.patient_name} and ${c.b.patient_name} overlap around ${timeText} (${c.types.map(t => t === 'provider' ? 'same provider' : t === 'room' ? 'same room' : 'same patient').join(', ')})`;
              return (
                <div key={idx} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, color: '#991b1b' }}>
                  <span style={{ fontSize: 13 }}>{message}</span>
                  <button
                    onClick={() => (c.kind === 'ooo' || c.kind === 'contracted-gap' || c.kind === 'closed') ? (() => { setEditingAppointment(c.a); setPrefill(null); setShowModal(true); })() : setReviewingConflict(c)}
                    style={{ fontSize: 12.5, fontWeight: 600, color: '#991b1b', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
                  >
                    Review
                  </button>
                  <button
                    onClick={() => setDismissedConflictKeys(prev => new Set(prev).add(getConflictKey(c)))}
                    style={{ fontSize: 12.5, fontWeight: 600, color: '#991b1b', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
                  >
                    Dismiss
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {dismissedConflictsList.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10, flexShrink: 0 }}>
          <button
            onClick={() => setDismissedConflictKeys(new Set())}
            title={`Restore ${dismissedConflictsList.length} dismissed ${dismissedConflictsList.length === 1 ? 'conflict' : 'conflicts'}`}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e4e9', background: 'white', color: '#991b1b', fontSize: 12, cursor: 'pointer' }}
          >
            ⚠ {dismissedConflictsList.length} dismissed
          </button>
        </div>
      )}

      {loading && <p style={{ color: '#6b7280', fontSize: 14 }}>Loading...</p>}
      {error && <p style={{ color: '#dc2626', fontSize: 14 }}>Error: {error}</p>}

      {!loading && !error && viewMode !== 'unassigned' && (
        <div ref={setGridEl} style={{ position: 'relative', background: 'white', borderRadius: 12, overflow: 'auto', boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 1px 6px rgba(0,0,0,0.04)', border: '1px solid #eef0f3', flex: 1, minHeight: 0 }}>
          <div style={{ position: 'relative' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 64 }} />
              {(viewMode === 'provider' ? gridProviders : TREATMENT_AREA_OPTIONS.map(r => ({ id: r }))).map(c => <col key={c.id} />)}
            </colgroup>
            <thead style={{ position: 'sticky', top: 0, zIndex: 20 }}>
              <tr>
                <th style={thStyle()}>Time</th>
                {viewMode === 'provider' && gridProviders.map(p => {
                  const headerLabel = ((p.specialty && p.first_name) ? `${p.specialty} - ${p.first_name}` : (p.first_name || p.Name)) + (p.archived ? ' (archived)' : '');
                  return (
                    <th key={p.id} style={{ ...thStyle(), ...(p.archived ? { color: '#9ca3af' } : {}) }} title={p.archived ? `${p.Name}'s account is archived. Reassign these appointments.` : p.Name}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, overflow: 'hidden' }}>
                        <UserIcon size={11} color="#9ca3af" />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{headerLabel}</span>
                      </div>
                    </th>
                  );
                })}
                {viewMode === 'provider' && gridProviders.length === 0 && <th style={thStyle()}>No providers yet</th>}
                {viewMode === 'room' && TREATMENT_AREA_OPTIONS.map(room => (
                  <th key={room} style={thStyle()}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, overflow: 'hidden' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: roomColor(room), flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: roomColor(room), fontWeight: 700 }}>{room}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIME_SLOTS.map(time => {
                const isHour = time.endsWith(':00');
                const columns = viewMode === 'provider' ? gridProviders.map(p => p.Name) : TREATMENT_AREA_OPTIONS;
                const sourceGrid = viewMode === 'provider' ? grid : roomGrid;
                return (
                  <tr key={time} data-slot={time} style={{ borderTop: isHour ? '1px solid #e5e7eb' : '1px solid #f3f4f6', height: ROW_HEIGHT }}>
                    <td style={tdTimeStyle(isHour)}>{formatSlotLabel(time)}</td>
                    {columns.map(colKey => {
                      const cellAppointments = (sourceGrid[colKey]?.[time] || [])
                        .slice()
                        .sort((a, b) => (a.appointment_status === 'Canceled' ? 1 : 0) - (b.appointment_status === 'Canceled' ? 1 : 0));
                      const oooMatch = viewMode === 'provider' ? oooCoveringSlot(colKey, time) : null;
                      const contractedGapSegments = viewMode === 'provider' && !closedInfo ? gapSegmentsForSlot(contractedGapsByProvider[colKey], time, ROW_HEIGHT) : [];
                      return (
                        <td
                          key={colKey}
                          style={tdCellStyle()}
                          onDoubleClick={(e) => {
                            if (e.target !== e.currentTarget) return;
                            if (viewMode === 'provider' && archivedProviders.some(p => p.Name === colKey)) return; // no new bookings for an archived provider
                            setEditingAppointment(null);
                            setPrefill({
                              time,
                              provider: viewMode === 'provider' ? colKey : (providers[0]?.Name || ''),
                              treatmentArea: viewMode === 'room' ? colKey : '',
                            });
                            setShowModal(true);
                          }}
                        >
                          {contractedGapSegments.map(seg => (
                            <div
                              key={seg.key}
                              title="Not contracted at this time"
                              style={{
                                position: 'absolute', top: seg.top, left: 0, right: 0, height: seg.height,
                                background: 'repeating-linear-gradient(135deg, #f3f4f6, #f3f4f6 6px, #e9eaec 6px, #e9eaec 12px)',
                                zIndex: 0, pointerEvents: 'none',
                              }}
                            />
                          ))}
                          {oooMatch && (() => {
                            const oooColors = oooBlockColors(oooMatch.type);
                            const startM = timeToMinutes(oooMatch.start_time.slice(0, 5));
                            const endM = timeToMinutes(oooMatch.end_time.slice(0, 5));
                            const slotM = timeToMinutes(time);
                            const isFirstSlot = slotM <= startM && slotM + 30 > startM;
                            const oooTop = isFirstSlot ? ((startM - slotM) / 30) * ROW_HEIGHT : 0;
                            const remainingMinutes = endM - Math.max(startM, slotM);
                            const oooHeight = Math.min(remainingMinutes, 30 - (isFirstSlot ? startM - slotM : 0)) / 30 * ROW_HEIGHT;
                            return (
                              <div
                                onClick={() => { setEditingOOO(oooMatch); setShowOOOModal(true); }}
                                style={{
                                  position: 'absolute',
                                  top: oooTop,
                                  left: 0,
                                  right: 0,
                                  height: oooHeight,
                                  background: oooColors.background,
                                  borderTop: isFirstSlot ? `2px dashed ${oooColors.border}` : 'none',
                                  cursor: 'pointer',
                                  zIndex: 1,
                                  display: 'flex',
                                  alignItems: isFirstSlot ? 'flex-start' : 'center',
                                  justifyContent: 'center',
                                  paddingTop: isFirstSlot ? 4 : 0,
                                }}
                              >
                                {isFirstSlot && (
                                  <span style={{ fontSize: 10.5, fontWeight: 600, color: oooColors.text }}>
                                    {oooMatch.type}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                          {cellAppointments.map((apt, stackIndex) => {
                            const duration = Number(apt.duration) || 30;
                            const heightPx = Math.max(1, duration / 30) * ROW_HEIGHT - CARD_MARGIN * 2;
                            const aptMinutes = timeToMinutes(apt.appointment_time.slice(0, 5));
                            const slotMinutes = timeToMinutes(time);
                            const offsetWithinSlot = ((aptMinutes - slotMinutes) / 30) * ROW_HEIGHT;
                            return (
                              <AppointmentCard
                                key={apt.id}
                                apt={apt}
                                heightPx={heightPx}
                                stackIndex={stackIndex}
                                offsetWithinSlot={offsetWithinSlot}
                                hasConflict={activeConflicts.ids.has(apt.id)}
                                onClick={() => { setEditingAppointment(apt); setShowModal(true); }}
                                badgeLabel={viewMode === 'provider' ? roomBadgeLabel(apt.treatment_area) : apt.provider}
                                badgeColor={viewMode === 'provider' && apt.treatment_area ? roomColor(apt.treatment_area) : undefined}
                                badgeIcon={viewMode === 'provider'
                                  ? <HouseIcon size={10} color="#9ca3af" strokeWidth={2} />
                                  : <UserIcon size={10} color="#9ca3af" strokeWidth={2} />}
                                onRoomClick={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  if (viewMode === 'provider') {
                                    setRoomDropdown({ apt, top: rect.bottom + 4, left: rect.left });
                                  } else {
                                    setProviderDropdown({ apt, top: rect.bottom + 4, left: rect.left });
                                  }
                                }}
                                onStatusClick={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setStatusDropdown({ apt, top: rect.bottom + 4, left: rect.left });
                                }}
                              />
                            );
                          })}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {closedInfo && <ClosedDaySash reason={closedInfo.reason} style={{ left: 64, right: 0 }} />}
          </div>
          {nowLineTop != null && <NowLine top={nowLineTop} now={now} />}
        </div>
      )}

      {!loading && !error && viewMode === 'unassigned' && (
        <div style={{ background: 'white', borderRadius: 12, overflow: 'auto', boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 1px 6px rgba(0,0,0,0.04)', border: '1px solid #eef0f3', padding: 16, flex: 1, minHeight: 0 }}>
          <p style={{ fontSize: 12.5, color: '#6b7280', margin: '0 0 12px 0' }}>
            Appointments without a treatment area assigned yet.
          </p>
          {unassignedAppointments.length === 0 && (
            <p style={{ fontSize: 13.5, color: '#9ca3af', textAlign: 'center', padding: '24px 0' }}>
              Everything has a room assigned — nothing unassigned right now.
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {unassignedAppointments.map(apt => (
              <div
                key={apt.id}
                onClick={() => { setEditingAppointment(apt); setShowModal(true); }}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 12px', borderRadius: 8, border: '1px solid #eef0f3', cursor: 'pointer' }}
                onMouseEnter={e => { e.currentTarget.style.background = '#fafbfc'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'white'; }}
              >
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', minWidth: 80 }}>{formatSlotLabel(apt.appointment_time.slice(0, 5))}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1f2937', flex: 1 }}>{apt.patient_name || '(no patient)'}</span>
                <span style={{ fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <UserIcon size={11} color="#9ca3af" /> {apt.provider}
                </span>
                <button
                  type="button"
                  title={apt.treatment_area ? 'Change room' : 'Set room'}
                  onClick={(e) => {
                    e.stopPropagation(); // don't open the full appointment editor
                    const rect = e.currentTarget.getBoundingClientRect();
                    setRoomDropdown({ apt, top: rect.bottom + 4, left: rect.left });
                  }}
                  style={apt.treatment_area ? {
                    display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', borderRadius: 999, padding: '3px 10px',
                    border: `1px solid color-mix(in srgb, ${roomColor(apt.treatment_area)} 40%, white)`,
                    background: `color-mix(in srgb, ${roomColor(apt.treatment_area)} 12%, white)`, color: roomColor(apt.treatment_area),
                  } : {
                    display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', borderRadius: 999, padding: '3px 10px',
                    border: '1px dashed #c4b5fd', background: '#F5F3FF', color: '#6D28D9',
                  }}
                >
                  <HouseIcon size={11} color="currentColor" strokeWidth={2} />
                  {apt.treatment_area ? roomBadgeLabel(apt.treatment_area) : 'Set room'}
                </button>
                <span style={{
                  fontSize: 10, fontWeight: 600, borderRadius: 10, padding: '2px 8px',
                  background: `color-mix(in srgb, ${statusColor(apt.appointment_status)} 16%, white)`, color: statusColor(apt.appointment_status),
                }}>
                  {apt.appointment_status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {roomDropdown && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setRoomDropdown(null)} />
          <RoomPickerMenu
            apt={roomDropdown.apt}
            top={roomDropdown.top}
            left={roomDropdown.left}
            onPick={(area) => handleRoomChange(roomDropdown.apt, area)}
            onClose={() => setRoomDropdown(null)}
          />
        </>,
        document.body
      )}

      {providerDropdown && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setProviderDropdown(null)} />
          <div style={{
            position: 'fixed', top: providerDropdown.top, left: providerDropdown.left, zIndex: 9999,
            background: 'white', border: '1px solid #e2e4e9', borderRadius: 8, boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
            minWidth: 160, maxHeight: 220, overflowY: 'auto', padding: 4,
          }}>
            {providers.map(p => (
              <div
                key={p.id}
                onClick={() => handleProviderChange(providerDropdown.apt, p.Name)}
                style={{
                  padding: '7px 10px', fontSize: 13, borderRadius: 6, cursor: 'pointer',
                  background: providerDropdown.apt.provider === p.Name ? '#f3f4f6' : 'transparent',
                  color: '#374151',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f9fafb'; }}
                onMouseLeave={e => { e.currentTarget.style.background = providerDropdown.apt.provider === p.Name ? '#f3f4f6' : 'transparent'; }}
              >
                {p.Name}
              </div>
            ))}
          </div>
        </>,
        document.body
      )}

      {statusDropdown && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setStatusDropdown(null)} />
          <div style={{
            position: 'fixed', top: statusDropdown.top, left: statusDropdown.left, zIndex: 9999,
            background: 'white', border: '1px solid #e2e4e9', borderRadius: 8, boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
            minWidth: 150, maxHeight: 260, overflowY: 'auto', padding: 4,
          }}>
            {STATUS_OPTIONS.map(status => {
              const c = statusColor(status);
              return (
                <div
                  key={status}
                  onClick={() => handleStatusChange(statusDropdown.apt, status)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', fontSize: 13, borderRadius: 6, cursor: 'pointer',
                    background: statusDropdown.apt.appointment_status === status ? '#f3f4f6' : 'transparent',
                    color: '#374151',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#f9fafb'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = statusDropdown.apt.appointment_status === status ? '#f3f4f6' : 'transparent'; }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0 }} />
                  {status}
                </div>
              );
            })}
          </div>
        </>,
        document.body
      )}

      {reviewingConflict && (
        <ConflictReviewModal
          conflict={reviewingConflict}
          onClose={() => setReviewingConflict(null)}
          onEditAppointment={(apt) => {
            setReviewingConflict(null);
            setEditingAppointment(apt);
            setPrefill(null);
            setShowModal(true);
          }}
        />
      )}

      {showModal && (
        <AppointmentModal
          providers={providers}
          existing={editingAppointment}
          defaultDate={selectedDate}
          prefill={prefill}
          onClose={() => { setShowModal(false); setEditingAppointment(null); setPrefill(null); }}
          onSaved={() => { setShowModal(false); setEditingAppointment(null); setPrefill(null); loadDay(selectedDateRef.current, { background: true }); }}
          onCommentsSynced={() => loadDay(selectedDateRef.current, { background: true })}
        />
      )}

      {showOOOModal && (
        <OOOModal
          providers={providers}
          existing={editingOOO}
          defaultDate={selectedDate}
          onClose={() => { setShowOOOModal(false); setEditingOOO(null); }}
          onSaved={() => { setShowOOOModal(false); setEditingOOO(null); loadDay(selectedDateRef.current, { background: true }); }}
          onCommentsSynced={() => loadDay(selectedDateRef.current, { background: true })}
        />
      )}
    </div>
  );
}

export function Dot() {
  return <span style={{ color: '#d1d5db', fontSize: 13 }}>·</span>;
}
export function iconBtnStyle() {
  return { width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: '1px solid #e2e4e9', background: 'white', color: '#6b7280', cursor: 'pointer' };
}
export function primaryBtnStyle() {
  return { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#6D28D9', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
}
export function secondaryBtnStyle(disabled) {
  return { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #e2e4e9', background: 'white', color: disabled ? '#c1c5cc' : '#374151', fontSize: 13, fontWeight: 500, cursor: disabled ? 'not-allowed' : 'pointer' };
}
export function segmentBtnStyle(active, disabled) {
  return {
    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: 'none', fontSize: 13, fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
    background: active ? '#dc2626' : 'white', color: active ? 'white' : disabled ? '#c1c5cc' : '#374151',
    borderRight: '1px solid #e2e4e9',
  };
}
export function thStyle() {
  return { padding: '10px 6px', fontSize: 11.5, fontWeight: 600, color: '#6b7280', background: '#fafbfc', borderBottom: '1px solid #eef0f3', textAlign: 'center' };
}
export function tdTimeStyle(isHour) {
  return { padding: '6px 8px', fontSize: 10.5, fontWeight: isHour ? 700 : 500, color: isHour ? '#374151' : '#b0b4bb', verticalAlign: 'top', whiteSpace: 'nowrap' };
}
export function tdCellStyle() {
  return { padding: 0, verticalAlign: 'top', borderLeft: '1px solid #f3f4f6', overflow: 'visible', position: 'relative' };
}

function modalOverlayStyle() {
  return { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 };
}
function modalBoxStyle() {
  return { background: 'white', borderRadius: 12, padding: 22, width: '100%', maxWidth: 420, maxHeight: '85vh', overflowY: 'auto', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', boxShadow: '0 20px 40px rgba(0,0,0,0.15)' };
}
function inputStyle() {
  return { width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid #e2e4e9', fontSize: 13.5, marginBottom: 12, boxSizing: 'border-box' };
}
function labelStyle() {
  return { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5, color: '#374151' };
}
function modalBtnStyle(primary, danger) {
  return {
    padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
    border: primary ? 'none' : danger ? '1px solid #dc2626' : '1px solid #e2e4e9',
    background: primary ? '#6D28D9' : 'white',
    color: primary ? 'white' : danger ? '#dc2626' : '#374151',
  };
}

export function AppointmentModal({ providers, existing, defaultDate, prefill, onClose, onSaved, onCommentsSynced }) {
  const { user } = useAuth();
  const patientAlertsMap = usePatientAlerts();
  const navigate = useNavigate();
  const [patientSearch, setPatientSearch] = useState(existing ? (existing.patient_name || '') : '');
  const [patientConfirmed, setPatientConfirmed] = useState(!!existing);
  const [patientResults, setPatientResults] = useState([]);
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);

  const [provider, setProvider] = useState(existing ? existing.provider : (prefill?.provider || providers[0]?.Name || ''));
  const [appointmentDate, setAppointmentDate] = useState(existing ? existing.appointment_date : dateToInputValue(defaultDate));
  const [appointmentTime, setAppointmentTime] = useState(existing ? existing.appointment_time.slice(0, 5) : (prefill?.time || '09:00'));
  const [duration, setDuration] = useState(existing ? existing.duration : 30);
  // The dropdown holds a room, 'Offsite', or '' -- the typed offsite
  // location is kept separately, and the two combine into the stored value
  // ("Offsite" or "Offsite: <location>") that every save path below uses.
  const initialArea = existing ? (existing.treatment_area || '') : (prefill?.treatmentArea || '');
  const [roomChoice, setRoomChoice] = useState(isOffsite(initialArea) ? OFFSITE : initialArea);
  const [offsiteLocationText, setOffsiteLocationText] = useState(offsiteLocation(initialArea));
  const treatmentArea = roomChoice === OFFSITE ? makeOffsiteArea(offsiteLocationText) : roomChoice;
  const [status, setStatus] = useState(existing ? (existing.appointment_status || STATUS_OPTIONS[0]) : STATUS_OPTIONS[0]);
  const [localComments, setLocalComments] = useState(existing ? (existing.comments || '') : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  // Tracks whether a virtual occurrence has been turned into a real row
  // during this modal session (e.g. by adding the first comment to it) --
  // existing itself is a prop and can't be mutated, so this is what
  // subsequent actions in the same session check instead of existing.id.
  const [materializedRecord, setMaterializedRecord] = useState(null);
  const effectiveIsVirtual = !!existing?.is_virtual && !materializedRecord;
  const effectiveId = materializedRecord ? materializedRecord.id : existing?.id;

  const materializeCurrentOccurrence = async () => {
    const seriesId = existing.series_id;
    const created = await api.createRecurringException(seriesId, {
      occurrence_date: existing.appointment_date,
      appointment_date: appointmentDate,
      patient_name: patientSearch,
      provider,
      appointment_time: appointmentTime,
      duration: Number(duration),
      treatment_area: status === 'Canceled' ? null : (treatmentArea || null),
      appointment_status: status,
    });
    setMaterializedRecord(created);
    return created;
  };
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [futureMatches, setFutureMatches] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [confirmingRecurringEdit, setConfirmingRecurringEdit] = useState(false);
  const [pendingEditRecord, setPendingEditRecord] = useState(null);
  const [pendingSeriesId, setPendingSeriesId] = useState(null); // set when the edit belongs to a new-model series
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [repeatNoEndDate, setRepeatNoEndDate] = useState(false);
  const [repeatWeeks, setRepeatWeeks] = useState('4');
  const [activeTab, setActiveTab] = useState('details');
  const [liveConflicts, setLiveConflicts] = useState([]);

  // Real-time check: as the form fills in, warn (without blocking) if this
  // patient or room already has an overlapping appointment on that date.
  // Runs in both the daily and weekly views since they share this modal.
  useEffect(() => {
    if (!appointmentDate || !appointmentTime || !duration) { setLiveConflicts([]); return; }
    if (!patientConfirmed && (!treatmentArea || isOffsite(treatmentArea))) { setLiveConflicts([]); return; }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const dayAppointments = await api.getAppointments(appointmentDate);
        if (cancelled) return;
        const draftRange = getAppointmentTimeRange({ appointment_time: appointmentTime, duration });
        const found = [];
        (dayAppointments || []).forEach(apt => {
          if (apt.appointment_status === 'Canceled') return;
          if (existing && apt.id === existing.id) return; // never flag against itself when editing
          const range = getAppointmentTimeRange(apt);
          const overlaps = draftRange.start < range.end && range.start < draftRange.end;
          if (!overlaps) return;
          if (patientConfirmed && patientSearch && apt.patient_name === patientSearch) {
            found.push({ type: 'patient', apt });
          }
          if (treatmentArea && !isOffsite(treatmentArea) && apt.treatment_area === treatmentArea) {
            found.push({ type: 'room', apt });
          }
        });
        setLiveConflicts(found);
      } catch (err) {
        // Non-critical background check -- fail silently.
      }
    }, 350); // small debounce so it doesn't fire on every keystroke

    return () => { cancelled = true; clearTimeout(timer); };
  }, [appointmentDate, appointmentTime, duration, patientSearch, patientConfirmed, treatmentArea, existing]);

  const handleStatusSelect = (newStatus) => {
    setStatus(newStatus);
    if (newStatus === 'Canceled') setRoomChoice('');
  };

  useEffect(() => {
    if (!patientSearch || patientConfirmed) { setPatientResults([]); return; }
    const timeout = setTimeout(async () => {
      try {
        const data = await api.searchPatients(patientSearch);
        setPatientResults(data);
      } catch (err) {
        console.error('Patient search failed:', err);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [patientSearch, patientConfirmed]);

  const handleSave = async () => {
    if (!patientConfirmed || !appointmentDate || !appointmentTime || !provider) {
      setError('Patient (selected from the list), date, time, and provider are required.');
      return;
    }
    setSaving(true);
    setError(null);

    if (existing) {
      const record = {
        patient_name: patientSearch,
        provider,
        appointment_date: appointmentDate,
        appointment_time: appointmentTime,
        duration: Number(duration),
        treatment_area: status === 'Canceled' ? null : (treatmentArea || null),
        appointment_status: status,
      };

      // An occurrence linked to the NEW rule-based series -- either still
      // virtual, or a real row that's already an exception -- gets the
      // same "just this one, or this and all future" choice as the old
      // model, UNLESS the only things that changed are room and/or status.
      // Those are always session-specific details (a one-off room swap, a
      // cancellation) that should never silently propagate to the whole
      // future series -- so those go straight to "just this occurrence."
      const linkedSeriesId = existing.is_virtual ? existing.series_id : existing.exception_of_series_id;
      if (linkedSeriesId) {
        const onlyRoomOrStatusChanged =
          patientSearch === existing.patient_name &&
          provider === existing.provider &&
          appointmentDate === existing.appointment_date &&
          appointmentTime === existing.appointment_time.slice(0, 5) &&
          Number(duration) === Number(existing.duration);

        if (onlyRoomOrStatusChanged) {
          try {
            if (existing.is_virtual) {
              // Not a real row yet -- this is the first time this specific
              // occurrence has ever been touched, so materializing it via
              // an exception is correct.
              await api.createRecurringException(linkedSeriesId, {
                occurrence_date: existing.appointment_date,
                appointment_date: appointmentDate,
                patient_name: patientSearch,
                provider,
                appointment_time: appointmentTime,
                duration: Number(duration),
                treatment_area: status === 'Canceled' ? null : (treatmentArea || null),
                appointment_status: status,
              });
            } else {
              // Already a real exception row from a previous edit --
              // update it in place. Calling createRecurringException here
              // would INSERT a second row for the same date instead of
              // updating this one, creating a duplicate.
              await api.updateAppointment(existing.id, record);
            }
          } catch (err) {
            setSaving(false);
            setError(err.message);
            return;
          }
          setSaving(false);
          onSaved();
          return;
        }

        setPendingEditRecord(record);
        setPendingSeriesId(linkedSeriesId);
        setConfirmingRecurringEdit(true);
        setSaving(false);
        return;
      }

      // If this appointment is part of a recurring series with future
      // occurrences, ask whether to apply the change to just this one or
      // the whole future series, rather than silently only updating this one.
      const matches = await getFutureSeriesMatches(existing);
      if (matches.length > 0) {
        setPendingEditRecord(record);
        setFutureMatches(matches);
        setConfirmingRecurringEdit(true);
        setSaving(false);
        return;
      }

      try {
        await api.updateAppointment(existing.id, record);
      } catch (err) {
        setSaving(false);
        setError(err.message);
        return;
      }
      setSaving(false);
      onSaved();
      return;
    }

    // New appointment — possibly repeating
    const isRecurringSeries = repeatWeekly && repeatNoEndDate;
    const baseDate = new Date(appointmentDate + 'T00:00:00');

    if (isRecurringSeries) {
      // No-end-date recurrence now uses the rule-based model -- one row
      // describing the pattern, no pre-generation, no window to run out of.
      // The pattern always starts as Scheduled regardless of whatever the
      // status field happens to show -- future occurrences haven't happened
      // yet and shouldn't inherit a stale Confirmed/Canceled/etc. status
      // from whenever the series was originally set up.
      try {
        await api.createRecurringSeries({
          patient_name: patientSearch,
          provider,
          weekday: baseDate.getDay(),
          appointment_time: appointmentTime,
          duration: Number(duration),
          treatment_area: status === 'Canceled' ? null : (treatmentArea || null),
          appointment_status: 'Scheduled',
          start_date: appointmentDate,
        });
      } catch (err) {
        setSaving(false);
        setError(err.message);
        return;
      }
      setSaving(false);
      onSaved();
      return;
    }

    // Fixed number of weeks -- unchanged: it's naturally bounded and
    // doesn't have the "running out" problem, so the simple bulk-create
    // approach is still perfectly fine here.
    const weeksCount = !repeatWeekly ? 1 : Math.max(1, parseInt(repeatWeeks, 10) || 1);
    // A shared fin lets "delete this and all future" / "edit this and all
    // future" keep finding every occurrence in this set later, even if one
    // of them gets rescheduled to a different time. Only actually needed
    // when there's more than one row to keep track of as a group.
    const groupFin = weeksCount > 1 ? crypto.randomUUID() : null;

    for (let i = 0; i < weeksCount; i++) {
      const occDate = new Date(baseDate);
      occDate.setDate(occDate.getDate() + i * 7);
      const dateStr = dateToInputValue(occDate);

      const record = {
        patient_name: patientSearch,
        provider,
        appointment_date: dateStr,
        appointment_time: appointmentTime,
        duration: Number(duration),
        treatment_area: status === 'Canceled' ? null : (treatmentArea || null),
        appointment_status: status,
        fin: groupFin,
      };
      try {
        await api.createAppointment(record);
      } catch (err) {
        setSaving(false);
        setError(err.message);
        return;
      }
    }

    setSaving(false);
    onSaved();
  };

  const getFutureSeriesMatches = async (apt) => {
    try {
      // A fin survives an occurrence being rescheduled to a different time,
      // unlike matching by patient/provider/time -- prefer it whenever the
      // row has one. Older bounded sets created before this existed don't
      // have a fin, so they fall back to the original matching.
      if (apt.fin) {
        const data = await api.getFinMatches(apt.fin, apt.appointment_date);
        return data || [];
      }
      const weekday = new Date(apt.appointment_date + 'T00:00:00').getDay();
      const dateStr = apt.appointment_date;
      const data = await api.getSeriesMatches(apt.patient_name, apt.provider, apt.appointment_time, dateStr);
      return (data || []).filter(r => new Date(r.appointment_date + 'T00:00:00').getDay() === weekday);
    } catch (err) {
      return [];
    }
  };

  const handleApplyEditThisOnly = async () => {
    setSaving(true);
    try {
      if (pendingSeriesId && existing.is_virtual) {
        // Not a real row yet -- materializing it via an exception is correct.
        await api.createRecurringException(pendingSeriesId, {
          occurrence_date: existing.appointment_date,
          appointment_date: pendingEditRecord.appointment_date,
          patient_name: pendingEditRecord.patient_name,
          provider: pendingEditRecord.provider,
          appointment_time: pendingEditRecord.appointment_time,
          duration: pendingEditRecord.duration,
          treatment_area: pendingEditRecord.treatment_area,
          appointment_status: pendingEditRecord.appointment_status,
        });
      } else {
        // Either not linked to a series at all, or already a real
        // exception row from a previous edit -- either way, update it in
        // place. Calling createRecurringException for an already-real row
        // would INSERT a second row for the same date instead of updating
        // this one, creating a duplicate.
        await api.updateAppointment(existing.id, pendingEditRecord);
      }
    } catch (err) {
      setSaving(false);
      setError(err.message);
      return;
    }
    setSaving(false);
    onSaved();
  };

  const handleApplyEditThisAndFuture = async () => {
    setSaving(true);
    try {
      if (pendingSeriesId) {
        // Ends the old series the day before this occurrence, removes this
        // occurrence's own exception row if it already had one (its
        // changes become the new series' baseline pattern instead of a
        // one-off override), then starts a fresh series from this date
        // forward with the edited pattern -- seamless from the user's view.
        const occDate = existing.appointment_date;
        const dayBefore = dateToInputValue(new Date(new Date(occDate + 'T00:00:00').getTime() - 24 * 60 * 60 * 1000));
        await api.endRecurringSeries(pendingSeriesId, dayBefore);

        if (!existing.is_virtual && existing.id) {
          await api.deleteAppointment(existing.id);
        }

        const newWeekday = new Date(pendingEditRecord.appointment_date + 'T00:00:00').getDay();
        await api.createRecurringSeries({
          patient_name: pendingEditRecord.patient_name,
          provider: pendingEditRecord.provider,
          weekday: newWeekday,
          appointment_time: pendingEditRecord.appointment_time,
          duration: pendingEditRecord.duration,
          treatment_area: pendingEditRecord.treatment_area,
          appointment_status: pendingEditRecord.appointment_status,
          start_date: pendingEditRecord.appointment_date,
        });
      } else {
        const targets = [{ id: existing.id, appointment_date: pendingEditRecord.appointment_date }, ...futureMatches.map(m => ({ id: m.id, appointment_date: m.appointment_date }))];
        for (const t of targets) {
          try {
            await api.updateAppointment(t.id, { ...pendingEditRecord, appointment_date: t.appointment_date });
          } catch (err) {
            console.error('Failed to update', t.id, err);
          }
        }
      }
    } catch (err) {
      setSaving(false);
      setError(err.message);
      return;
    }
    setSaving(false);
    onSaved();
  };

  const openDeleteConfirm = async () => {
    setConfirmingDelete(true);
    const linkedSeriesId = existing.is_virtual ? existing.series_id : existing.exception_of_series_id;
    if (linkedSeriesId) {
      // New-model series: no need to look up future rows, since deleting
      // "this and future" means ending the series itself, not hunting down
      // individually-created rows.
      setPendingSeriesId(linkedSeriesId);
      return;
    }
    setLoadingMatches(true);
    const matches = await getFutureSeriesMatches(existing);
    setFutureMatches(matches);
    setLoadingMatches(false);
  };

  const deleteThisOccurrence = async (seriesId) => {
    if (existing.is_virtual) {
      // Not a real row yet -- materialize it as a deleted exception. This
      // permanently excludes the date from future virtual generation while
      // keeping the row itself out of every normal view -- distinct from
      // Canceled, which is a real, visible record that a visit didn't happen.
      await api.createRecurringException(seriesId, {
        occurrence_date: existing.appointment_date,
        appointment_date: existing.appointment_date,
        patient_name: existing.patient_name,
        provider: existing.provider,
        appointment_time: existing.appointment_time,
        duration: existing.duration,
        treatment_area: existing.treatment_area,
        appointment_status: existing.appointment_status,
        deleted: true,
      });
    } else {
      // Already a real exception row -- mark it deleted rather than removing
      // it outright. Removing it would delete the exception that's excluding
      // this date from virtual generation, so the series would silently
      // regenerate the default pattern here on the next load.
      await api.markAppointmentDeleted(existing.id);
    }
  };

  const handleDeleteThisOnly = async () => {
    setSaving(true);
    try {
      if (pendingSeriesId) {
        await deleteThisOccurrence(pendingSeriesId);
      } else {
        await api.deleteAppointment(existing.id);
      }
    } catch (err) {
      setSaving(false);
      setError(err.message);
      return;
    }
    setSaving(false);
    onSaved();
  };

  const handleDeleteThisAndFuture = async () => {
    setSaving(true);
    try {
      if (pendingSeriesId) {
        // Ends the series the day before this occurrence so nothing further
        // generates from here on, deletes this occurrence itself the same
        // way "delete this only" does, and separately purges any OTHER
        // future occurrence that was already materialized into a real row
        // before now (a prior room/status change, a reschedule) -- ending
        // the series alone does nothing to rows that already exist.
        const dayBefore = dateToInputValue(new Date(new Date(existing.appointment_date + 'T00:00:00').getTime() - 24 * 60 * 60 * 1000));
        await api.endRecurringSeries(pendingSeriesId, dayBefore);
        await deleteThisOccurrence(pendingSeriesId);
        await api.purgeFutureRecurringExceptions(pendingSeriesId, existing.appointment_date);
      } else {
        const idsToDelete = [existing.id, ...futureMatches.map(m => m.id)];
        for (const id of idsToDelete) {
          try {
            await api.deleteAppointment(id);
          } catch (err) {
            console.error('Failed to delete', id, err);
          }
        }
      }
    } catch (err) {
      setSaving(false);
      setError(err.message);
      return;
    }
    setSaving(false);
    onSaved();
  };

  // This patient's allergy / immunization notes (shared cache, same as the cards).
  const headerAlertRaw = existing ? alertsFor(patientAlertsMap, patientSearch) : null;
  const headerAlert = headerAlertRaw && (headerAlertRaw.allergies || headerAlertRaw.immunizations) ? headerAlertRaw : null;

  return (
    <div style={modalOverlayStyle()} onClick={onClose}>
      <div
        style={{ ...modalBoxStyle(), maxWidth: headerAlert ? 600 : 520 }}
        onClick={e => e.stopPropagation()}
      >
        {existing ? (
          <div style={{ marginBottom: 18, display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <div style={{ minWidth: 0 }}>
            <div
              onClick={() => navigate(`/patients/${encodeURIComponent(patientSearch)}`)}
              style={{ fontFamily: BRAND_SERIF, fontSize: 20, fontWeight: 700, color: '#111827', cursor: 'pointer', lineHeight: 1.2 }}
            >
              {patientSearch}
            </div>
            <div style={{ fontSize: 13, color: BRAND.muted, marginTop: 4 }}>
              {provider} &middot; {appointmentDate ? new Date(appointmentDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '--'} &middot; {formatSlotLabel(appointmentTime)}
            </div>
            <button
              onClick={() => navigate(`/patients/${encodeURIComponent(patientSearch)}`)}
              style={{ fontSize: 12, color: BRAND.forest, fontWeight: 600, marginTop: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              View Patient Chart &rarr;
            </button>
            </div>
            <PatientAlertsInline allergies={headerAlert?.allergies} immunizations={headerAlert?.immunizations} maxWidth="58%" />
          </div>
        ) : (
          <h2 style={{
            fontFamily: BRAND_SERIF, fontSize: 19, fontWeight: 700, marginTop: 0, marginBottom: 16, color: '#111827',
          }}>
            New Appointment
          </h2>
        )}

        {existing && (
          <div style={{ display: 'inline-flex', gap: 4, background: '#F1F2F4', borderRadius: 8, padding: 3, marginBottom: 18 }}>
            <button
              type="button"
              onClick={() => setActiveTab('details')}
              style={{
                border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                background: activeTab === 'details' ? 'white' : 'transparent',
                color: activeTab === 'details' ? '#111827' : '#6b7280',
              }}
            >
              Details
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('patient')}
              style={{
                border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                background: activeTab === 'patient' ? 'white' : 'transparent',
                color: activeTab === 'patient' ? '#111827' : '#6b7280',
              }}
            >
              Patient Info
            </button>
          </div>
        )}

        {(!existing || activeTab === 'details') && (
          <>
            {!existing && (
              <>
                <label style={labelStyle()}>Patient</label>
                <div style={{ position: 'relative' }}>
                  <input
                    style={inputStyle()}
                    placeholder="Search patients..."
                    value={patientSearch}
                    onChange={e => { setPatientSearch(e.target.value); setPatientConfirmed(false); setShowPatientDropdown(true); }}
                    onFocus={() => setShowPatientDropdown(true)}
                  />
                  {showPatientDropdown && !patientConfirmed && patientResults.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: `1.5px solid ${BRAND.box}`, borderRadius: 3, maxHeight: 160, overflowY: 'auto', zIndex: 10, marginTop: -12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                      {patientResults.map(p => (
                        <div
                          key={p.id}
                          onClick={() => { setPatientSearch(p.Name); setPatientConfirmed(true); setShowPatientDropdown(false); if (isHoldPatient(p)) setStatus(HOLD_STATUS); }}
                          style={{ padding: '8px 10px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid #EDE9F7' }}
                        >
                          {p.Name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            <label style={labelStyle()}>Provider *</label>
            <select style={inputStyle()} value={provider} onChange={e => setProvider(e.target.value)}>
              {providers.map(p => <option key={p.id} value={p.Name}>{p.Name}</option>)}
              {existing?.provider && !providers.some(p => p.Name === existing.provider) && <option value={existing.provider}>{existing.provider} (archived)</option>}
            </select>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <DateField label="Date *" value={appointmentDate} onChange={setAppointmentDate} />
              <TimeField label="Time *" value={appointmentTime} onChange={setAppointmentTime} />
            </div>

            <label style={labelStyle()}>Duration (minutes)</label>
            <select style={inputStyle()} value={duration} onChange={e => setDuration(e.target.value)}>
              {DURATION_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>

            <label style={labelStyle()}>Treatment Area</label>
            <select style={inputStyle()} value={roomChoice} onChange={e => setRoomChoice(e.target.value)}>
              <option value="">-- none --</option>
              {TREATMENT_AREA_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              <option value={OFFSITE}>Offsite</option>
            </select>
            {roomChoice === OFFSITE && (
              <OffsiteLocationField
                patientName={patientConfirmed ? patientSearch : ''}
                value={offsiteLocationText}
                onChange={setOffsiteLocationText}
                inputStyle={inputStyle()}
                labelStyle={labelStyle()}
              />
            )}

            {liveConflicts.length > 0 && (
              <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 6, padding: '9px 12px', marginBottom: 14 }}>
                <p style={{ fontSize: 12.5, fontWeight: 700, color: '#92400E', margin: '0 0 4px' }}>Possible scheduling conflict</p>
                {liveConflicts.map((c, i) => (
                  <p key={i} style={{ fontSize: 12, color: '#92400E', margin: '2px 0' }}>
                    {c.type === 'patient'
                      ? `${patientSearch} is already scheduled at ${formatSlotLabel(c.apt.appointment_time.slice(0, 5))} with ${c.apt.provider}.`
                      : `${treatmentArea} is already booked at ${formatSlotLabel(c.apt.appointment_time.slice(0, 5))} for ${c.apt.patient_name}.`}
                  </p>
                ))}
                <p style={{ fontSize: 11, color: '#92400E', margin: '4px 0 0', fontStyle: 'italic' }}>You can still save if this is intentional.</p>
              </div>
            )}

            <label style={labelStyle()}>Status</label>
            <select
              value={status}
              onChange={e => handleStatusSelect(e.target.value)}
              style={{
                ...inputStyle(), width: 'auto', minWidth: 160, display: 'inline-block',
                borderLeft: `4px solid ${statusColor(status)}`, fontWeight: 600, color: statusColor(status), cursor: 'pointer',
              }}
            >
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {status === 'Canceled' && (
              <p style={{ fontSize: 11.5, color: BRAND.muted, marginTop: -8, marginBottom: 12 }}>
                Room assignment will be cleared since this appointment is canceled.
              </p>
            )}

            {existing ? (
              <CommentsThread
                table="Appointments"
                recordId={effectiveId}
                comments={localComments}
                currentUser={user}
                isVirtual={effectiveIsVirtual}
                onMaterialize={materializeCurrentOccurrence}
                onUpdated={(updated) => { setLocalComments(updated); onCommentsSynced?.(); }}
              />
            ) : (
              <p style={{ fontSize: 11.5, color: '#9ca3af', marginTop: -4, marginBottom: 12 }}>
                Comments can be added once this appointment is created.
              </p>
            )}

            {!existing && (
              <div style={{ border: '1px solid #e2e4e9', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151' }}>
                  <input type="checkbox" checked={repeatWeekly} onChange={e => setRepeatWeekly(e.target.checked)} />
                  Repeat weekly
                </label>
                {repeatWeekly && (
                  <div style={{ marginTop: 8, paddingLeft: 22 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#374151' }}>
                      <input type="checkbox" checked={repeatNoEndDate} onChange={e => setRepeatNoEndDate(e.target.checked)} />
                      No end date
                    </label>
                    {!repeatNoEndDate && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                        <span style={{ fontSize: 13, color: BRAND.muted }}>for</span>
                        <input
                          type="number" min={1} max={52} value={repeatWeeks}
                          onChange={e => setRepeatWeeks(e.target.value)}
                          style={{ width: 56, padding: '4px 6px', borderRadius: 3, border: `1.5px solid ${BRAND.box}`, fontSize: 13 }}
                        />
                        <span style={{ fontSize: 13, color: BRAND.muted }}>weeks</span>
                      </div>
                    )}
                    <p style={{ fontSize: 11.5, color: BRAND.muted, marginTop: 6, marginBottom: 0 }}>
                      {repeatNoEndDate
                        ? 'Repeats every week on this day and time, indefinitely -- no need to extend it later.'
                        : `Creates ${Math.max(1, parseInt(repeatWeeks, 10) || 1)} appointments on the same day of week and time.`}
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {existing && activeTab === 'patient' && patientSearch && (
          <PatientDetailsPanel patientName={patientSearch} />
        )}

        {error && <p style={{ color: '#dc2626', fontSize: 13 }}>{error}</p>}

        {confirmingRecurringEdit ? (
          <div style={{ marginTop: 16, padding: 12, borderRadius: 3, background: BRAND.tint, border: `1.5px solid ${BRAND.box}` }}>
            <p style={{ fontSize: 13, color: '#241A33', margin: '0 0 10px 0', fontWeight: 500 }}>
              {pendingSeriesId
                ? 'This is part of a repeating series. Apply this change to just this occurrence, or to this and all future occurrences?'
                : <>This looks like part of a repeating series — there {futureMatches.length === 1 ? 'is' : 'are'} {futureMatches.length} future {futureMatches.length === 1 ? 'occurrence' : 'occurrences'} on the same day of week and time. Apply this change to just this one, or to this and all future occurrences?</>}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={handleApplyEditThisOnly} disabled={saving} style={modalBtnStyle(true)}>
                {saving ? 'Saving...' : 'Just This One'}
              </button>
              <button onClick={handleApplyEditThisAndFuture} disabled={saving} style={modalBtnStyle(true)}>
                {saving ? 'Saving...' : pendingSeriesId ? 'This & All Future' : `This & ${futureMatches.length} Future`}
              </button>
              <button onClick={() => { setConfirmingRecurringEdit(false); setPendingEditRecord(null); setPendingSeriesId(null); }} disabled={saving} style={modalBtnStyle()}>Cancel</button>
            </div>
          </div>
        ) : confirmingDelete ? (
          <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca' }}>
            {loadingMatches ? (
              <p style={{ fontSize: 13, color: '#991b1b', margin: 0 }}>Checking for a repeating series...</p>
            ) : (
              <>
                <p style={{ fontSize: 13, color: '#991b1b', margin: '0 0 10px 0', fontWeight: 500 }}>
                  {pendingSeriesId ? (
                    <>This is part of a repeating series. Delete just this occurrence, or this and all future occurrences? This removes it from the schedule entirely — to keep a record that a visit was cancelled instead, edit its status to Canceled rather than deleting it.</>
                  ) : (
                    <>
                      Delete this appointment? This can't be undone.
                      {futureMatches.length > 0 && (
                        <> This looks like part of a repeating series — there {futureMatches.length === 1 ? 'is' : 'are'} {futureMatches.length} future {futureMatches.length === 1 ? 'occurrence' : 'occurrences'} on the same day of week and time.</>
                      )}
                    </>
                  )}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button
                    onClick={handleDeleteThisOnly}
                    disabled={saving}
                    style={{ padding: '7px 14px', borderRadius: 3, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.02em', cursor: 'pointer', border: 'none', background: '#A32D2D', color: 'white' }}
                  >
                    {saving ? 'Deleting...' : 'Delete This Only'}
                  </button>
                  {(pendingSeriesId || futureMatches.length > 0) && (
                    <button
                      onClick={handleDeleteThisAndFuture}
                      disabled={saving}
                      style={{ padding: '7px 14px', borderRadius: 3, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.02em', cursor: 'pointer', border: 'none', background: '#A32D2D', color: 'white' }}
                    >
                      {saving ? 'Deleting...' : pendingSeriesId ? 'Delete This & All Future' : `Delete This & ${futureMatches.length} Future`}
                    </button>
                  )}
                  <button onClick={() => { setConfirmingDelete(false); setPendingSeriesId(null); }} disabled={saving} style={modalBtnStyle()}>Cancel</button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
            {existing ? (
              <button onClick={openDeleteConfirm} disabled={saving} style={modalBtnStyle(false, true)}>Delete</button>
            ) : <div />}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onClose} style={modalBtnStyle()}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={modalBtnStyle(true)}>
                {saving ? 'Saving...' : existing ? 'Save' : (repeatWeekly && !repeatNoEndDate && Math.max(1, parseInt(repeatWeeks, 10) || 1) > 1) ? `Create ${Math.max(1, parseInt(repeatWeeks, 10) || 1)} Appointments` : (repeatWeekly && repeatNoEndDate) ? 'Create Recurring Series' : 'Create'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// View of an out-of-office block, opened from the daily and weekly grids.
// The date/time/type change in My time (the organizer's own) or on their
// staff profile's Time off (admins) -- the "Edit in My time" link goes
// straight there. Here: the entry's notes, and comments for everyone. For
// a meeting: who organized it and who's in it, its agenda (editable here
// by anyone in the meeting or an admin) and ONE shared comment thread --
// the same on every attendee's copy (per week for a recurring meeting).
// The only change allowed here: an admin can delete an older entry that
// wasn't created through My time (so it has nowhere else to be managed).
export function OOOModal({ existing, onClose, onSaved, onCommentsSynced }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [localComments, setLocalComments] = useState(existing?.comments || '');
  const [link, setLink] = useState({ loading: true, request: null, can_change: false, can_edit_agenda: false });
  const [meetingComments, setMeetingComments] = useState(null);
  const directory = useStaffDirectory();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [futureMatches, setFutureMatches] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [pendingSeriesId, setPendingSeriesId] = useState(null);
  // A virtual (computed) weekly occurrence becomes a real row the first
  // time someone comments on it; remember that row for later comments.
  const [materializedRecord, setMaterializedRecord] = useState(null);
  const effectiveIsVirtual = !!existing?.is_virtual && !materializedRecord;
  const effectiveId = materializedRecord ? materializedRecord.id : existing?.id;
  const seriesId = existing?.is_virtual ? existing.series_id : existing?.exception_of_series_id;
  const weekDate = existing?.is_virtual ? existing.ooo_date : (existing?.exception_occurrence_date || existing?.ooo_date);

  useEffect(() => {
    if (!existing) return undefined;
    let cancelled = false;
    api.lookupTimeOffForOOO({
      time_off_request_id: existing.time_off_request_id,
      series_id: seriesId, ooo_id: existing.is_virtual ? null : existing.id,
      provider: existing.provider, type: existing.type, date: existing.ooo_date,
    })
      .then(res => {
        if (cancelled) return;
        setLink({ loading: false, request: res?.request || null, can_change: !!res?.can_change, can_edit_agenda: !!res?.can_edit_agenda });
        // A meeting's comments live on the meeting, shared by everyone in it.
        if (res?.request?.request_type === 'Meeting') {
          api.getMeetingComments(res.request.id, res.request.is_recurring ? weekDate : null)
            .then(c => { if (!cancelled) setMeetingComments(c?.comments || ''); })
            .catch(() => { if (!cancelled) setMeetingComments(''); });
        }
      })
      .catch(() => { if (!cancelled) setLink({ loading: false, request: null, can_change: false, can_edit_agenda: false }); });
    return () => { cancelled = true; };
  }, [existing, seriesId, weekDate]);

  if (!existing) return null;

  const colors = oooBlockColors(existing.type);
  const dateLabel = new Date(existing.ooo_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const timeLabel = `${formatSlotLabel(existing.start_time.slice(0, 5))} \u2013 ${formatSlotLabel(existing.end_time.slice(0, 5))}`;
  const isAdmin = user?.role === 'admin';
  const owner = link.request?.username;
  const isOwner = !!owner && owner === user?.username;
  const isMeeting = existing.type === 'Meeting' && link.request?.request_type === 'Meeting';
  const meetingDate = link.request?.is_recurring ? weekDate : null;
  const attendees = link.request?.attendees || [];
  const notes = (link.request?.notes || '').trim();
  // Older meeting blocks (not from My time) keep their agenda on the block.
  const blockRef = seriesId ? { series_id: seriesId } : { ooo_id: existing.id };
  const editHref = link.request
    ? (isOwner
      ? `/time?edit=${encodeURIComponent(link.request.id)}&date=${weekDate}`
      : `/admin/staff/${encodeURIComponent(owner)}?section=time-off&edit=${encodeURIComponent(link.request.id)}&date=${weekDate}`)
    : null;
  const canEdit = !!link.request && link.can_change;
  const canDeleteLegacy = !link.loading && !link.request && isAdmin;

  const materializeCurrentOccurrence = async () => {
    const created = await api.createOOOException(existing.series_id, {
      occurrence_date: existing.ooo_date, ooo_date: existing.ooo_date, provider: existing.provider,
      start_time: existing.start_time, end_time: existing.end_time, type: existing.type,
    });
    setMaterializedRecord(created);
    return created;
  };

  // ---- Deleting an older entry that isn't linked to My time (admins) ----
  const getFutureOOOSeriesMatches = async (o) => {
    try {
      if (o.fin) return (await api.getOOOFinMatches(o.fin, o.ooo_date)) || [];
      const weekday = new Date(o.ooo_date + 'T00:00:00').getDay();
      const data = await api.getOOOSeriesMatches(o.provider, o.type, o.start_time.slice(0, 5), o.end_time.slice(0, 5), o.ooo_date);
      return (data || []).filter(r => new Date(r.ooo_date + 'T00:00:00').getDay() === weekday);
    } catch (err) {
      return [];
    }
  };
  const openDeleteConfirm = async () => {
    setConfirmingDelete(true);
    if (seriesId) { setPendingSeriesId(seriesId); return; }
    setLoadingMatches(true);
    setFutureMatches(await getFutureOOOSeriesMatches(existing));
    setLoadingMatches(false);
  };
  const deleteThisOccurrence = async (sid) => {
    if (existing.is_virtual) {
      // Excludes this date from the series for good (the row itself is never shown).
      await api.createOOOException(sid, {
        occurrence_date: existing.ooo_date, ooo_date: existing.ooo_date, provider: existing.provider,
        start_time: existing.start_time, end_time: existing.end_time, type: existing.type, deleted: true,
      });
    } else {
      await api.markOOODeleted(existing.id);
    }
  };
  const runDelete = async (fn) => {
    setSaving(true);
    try { await fn(); } catch (err) { setSaving(false); setError(err.message); return; }
    setSaving(false);
    onSaved();
  };
  const handleDeleteThisOnly = () => runDelete(async () => {
    if (pendingSeriesId) await deleteThisOccurrence(pendingSeriesId);
    else await api.deleteOOO(existing.id);
  });
  const handleDeleteThisAndFuture = () => runDelete(async () => {
    if (pendingSeriesId) {
      const dayBefore = dateToInputValue(new Date(new Date(existing.ooo_date + 'T00:00:00').getTime() - 24 * 60 * 60 * 1000));
      await api.endOOOSeries(pendingSeriesId, dayBefore);
      await deleteThisOccurrence(pendingSeriesId);
      await api.purgeFutureOOOExceptions(pendingSeriesId, existing.ooo_date);
    } else {
      for (const id of [existing.id, ...futureMatches.map(m => m.id)]) {
        try { await api.deleteOOO(id); } catch (err) { console.error('Failed to delete', id, err); }
      }
    }
  });

  const detailRow = (label, value) => (
    <div style={{ display: 'flex', gap: 10, fontSize: 13.5, padding: '5px 0', borderBottom: '1px solid #f3f1f8' }}>
      <span style={{ width: 70, flexShrink: 0, color: BRAND.muted, fontSize: 12, fontWeight: 600, paddingTop: 1 }}>{label}</span>
      <span style={{ color: '#241A33' }}>{value}</span>
    </div>
  );

  return (
    <div style={modalOverlayStyle()} onClick={onClose}>
      <div
        role="dialog"
        aria-label="Out of office details"
        style={{ ...modalBoxStyle(), maxWidth: isMeeting && link.request?.is_recurring ? 640 : 460 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <h2 style={{ fontFamily: BRAND_SERIF, fontSize: 20, fontWeight: 700, margin: 0, color: '#241A33' }}>Out of Office</h2>
          <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: colors.background, color: colors.text, border: `1px solid ${colors.border}` }}>
            {existing.type}
          </span>
        </div>

        <div style={{ marginBottom: 14 }}>
          {detailRow('Who', existing.provider)}
          {detailRow('Date', dateLabel)}
          {detailRow('Time', timeLabel)}
          {seriesId && detailRow('Repeats', 'Weekly')}
          {isMeeting && attendees.length > 0 && detailRow('Organizer', staffName(directory, owner))}
          {isMeeting && attendees.length > 0 && detailRow('With', attendees.map(a => staffName(directory, a)).join(', '))}
          {notes && detailRow(existing.type === 'Other' ? 'Details' : 'Notes', <span style={{ whiteSpace: 'pre-wrap' }}>{notes}</span>)}
        </div>

        {existing.type === 'Meeting' && (
          // Always shown -- blank until someone writes an agenda.
          <div style={{ marginBottom: 16 }}>
            {link.loading ? (
              <MeetingAgendaPlaceholder recurring={!!seriesId} />
            ) : isMeeting ? (
              <MeetingAgendaEditor
                key={`${link.request.id}:${meetingDate || ''}`}
                requestId={link.request.id}
                fixedDate={meetingDate || undefined}
                readOnly={!link.can_edit_agenda}
                recurringHint={!!link.request.is_recurring}
              />
            ) : (
              <MeetingAgendaEditor
                key={`block:${seriesId || existing.id}:${weekDate}`}
                blockRef={blockRef}
                fixedDate={seriesId ? weekDate : undefined}
                recurringHint={!!seriesId}
              />
            )}
          </div>
        )}

        {isMeeting ? (
          meetingComments === null ? (
            <p style={{ fontSize: 12.5, color: '#9ca3af' }}>Loading comments...</p>
          ) : (
            <>
              <CommentsThread
                label={attendees.length ? 'Comments (shared with everyone in this meeting)' : 'Comments'}
                comments={meetingComments}
                currentUser={user}
                onAppend={async (text) => (await api.appendMeetingComment(link.request.id, meetingDate, text)).comments}
                onRemove={async (commentId) => (await api.deleteMeetingComment(link.request.id, meetingDate, commentId)).comments}
                onUpdated={(updated) => { setMeetingComments(updated || ''); onCommentsSynced?.(); }}
              />
              {parseComments(localComments).length > 0 && (
                <div style={{ marginTop: -4, marginBottom: 12 }}>
                  <p style={{ fontSize: 11.5, fontWeight: 600, color: BRAND.muted, margin: '0 0 4px' }}>Earlier comments on this calendar block</p>
                  {parseComments(localComments).map(c => (
                    <p key={c.id} style={{ fontSize: 12, color: '#4b5563', margin: '0 0 4px', whiteSpace: 'pre-wrap' }}>
                      <strong style={{ fontWeight: 600 }}>{c.legacy ? 'Note' : (c.author_display || c.author_username)}:</strong> {c.text}
                    </p>
                  ))}
                </div>
              )}
            </>
          )
        ) : (
          <CommentsThread
            table="Out_of_Office"
            recordId={effectiveId}
            comments={localComments}
            currentUser={user}
            isVirtual={effectiveIsVirtual}
            onMaterialize={materializeCurrentOccurrence}
            onUpdated={(updated) => { setLocalComments(updated); onCommentsSynced?.(); }}
          />
        )}

        {error && <p style={{ color: '#dc2626', fontSize: 13 }}>{error}</p>}

        {confirmingDelete ? (
          <div style={{ marginTop: 16, padding: 12, borderRadius: 3, background: '#FCEBEB', border: '1.5px solid #E9A5A5' }}>
            {loadingMatches ? (
              <p style={{ fontSize: 13, color: '#791F1F', margin: 0 }}>Checking for a repeating series...</p>
            ) : (
              <>
                <p style={{ fontSize: 13, color: '#791F1F', margin: '0 0 10px 0', fontWeight: 500 }}>
                  {pendingSeriesId
                    ? 'This is part of a repeating series. Delete just this occurrence, or this and all future occurrences?'
                    : `Delete this out-of-office entry? This can't be undone.${futureMatches.length > 0 ? ` It looks like part of a repeating set with ${futureMatches.length} future ${futureMatches.length === 1 ? 'occurrence' : 'occurrences'}.` : ''}`}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button onClick={handleDeleteThisOnly} disabled={saving} style={{ padding: '7px 14px', borderRadius: 3, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: 'none', background: '#A32D2D', color: 'white' }}>
                    {saving ? 'Deleting...' : 'Delete This Only'}
                  </button>
                  {(pendingSeriesId || futureMatches.length > 0) && (
                    <button onClick={handleDeleteThisAndFuture} disabled={saving} style={{ padding: '7px 14px', borderRadius: 3, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: 'none', background: '#A32D2D', color: 'white' }}>
                      {saving ? 'Deleting...' : pendingSeriesId ? 'Delete This & All Future' : `Delete This & ${futureMatches.length} Future`}
                    </button>
                  )}
                  <button onClick={() => { setConfirmingDelete(false); setPendingSeriesId(null); }} disabled={saving} style={modalBtnStyle()}>Cancel</button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12, color: BRAND.muted, maxWidth: 260 }}>
              {link.loading ? null
                : canDeleteLegacy ? <button onClick={openDeleteConfirm} disabled={saving} style={modalBtnStyle(false, true)}>Delete</button>
                : !link.request ? "This entry wasn't created through My time."
                : !canEdit ? `Only ${staffName(directory, owner)} or an admin can change the date or time.`
                : null}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onClose} style={modalBtnStyle()}>Close</button>
              {canEdit && (
                <button onClick={() => navigate(editHref)} style={modalBtnStyle(true)}>
                  {isOwner ? 'Edit in My time' : `Edit on ${staffName(directory, owner)}'s profile`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
