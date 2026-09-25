import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { useIsMobile } from '../useIsMobile';
import {
  BRAND, BRAND_SERIF, TIME_SLOTS, ROW_HEIGHT, CARD_MARGIN, STATUS_OPTIONS,
  dateToInputValue, formatSlotLabel, timeToMinutes, gapSegmentsForSlot,
  statusColor, roomColor, programColor, oooBlockColors,
  computeConflicts, getAppointmentTimeRange, ConflictReviewModal,
  ChevronLeft, ChevronRight, CalendarIcon, PlusIcon,
  AppointmentCard, AppointmentModal, OOOModal, CalendarPicker, ClosedDaySash, RoomPickerMenu, roomBadgeLabel,
  Dot, iconBtnStyle, primaryBtnStyle, secondaryBtnStyle,
  thStyle, tdTimeStyle, tdCellStyle,
} from './SchedulePage';

function startOfWeek(date) {
  // Monday as the start of the work week.
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toDayInfo(d) {
  return { date: d, dateStr: dateToInputValue(d), label: d.toLocaleDateString('en-US', { weekday: 'short' }), dayNum: d.getDate() };
}

export default function WeeklySchedulePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const lockedProvider = !isAdmin ? user?.providerName : null;
  const isMobile = useIsMobile();

  const [providers, setProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState(lockedProvider || '');
  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeek(new Date()));
  const [mobileDay, setMobileDay] = useState(() => new Date());
  const [appointments, setAppointments] = useState([]);
  const [oooRecords, setOooRecords] = useState([]);
  // Non-contracted hours per date for the active provider -- computed live
  // by the backend from ProviderUsualSchedule + OfficeHours, never a real
  // calendar entry. Refetched with everything else whenever the visible
  // week or provider changes.
  const [contractedGaps, setContractedGaps] = useState([]);
  // Days in view the office is closed ([{ date, reason }]) -- each gets the
  // diagonal sash, and any appointment on one is flagged as a conflict.
  const [closedDates, setClosedDates] = useState([]);
  const closedByDate = useMemo(() => Object.fromEntries(closedDates.map(c => [c.date, c])), [closedDates]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [prefill, setPrefill] = useState(null);
  const [showOOOModal, setShowOOOModal] = useState(false);
  const [editingOOO, setEditingOOO] = useState(null);

  const [roomDropdown, setRoomDropdown] = useState(null); // { apt, top, left }
  const [statusDropdown, setStatusDropdown] = useState(null); // { apt, top, left }
  const [showConflictDetails, setShowConflictDetails] = useState(false);
  const [lookaheadConflicts, setLookaheadConflicts] = useState([]);
  const [showLookaheadDetails, setShowLookaheadDetails] = useState(false);
  const [reviewingConflict, setReviewingConflict] = useState(null);

  // 5 weekday columns on desktop; a single day on mobile/tablet, where a
  // 5-column grid wouldn't be usable.
  const activeProvider = isAdmin ? selectedProvider : lockedProvider;
  const daysToShow = useMemo(() => {
    if (isMobile) return [toDayInfo(mobileDay)];
    return [0, 1, 2, 3, 4].map(i => toDayInfo(addDays(weekAnchor, i)));
  }, [isMobile, mobileDay, weekAnchor]);

  const flatContractedGaps = useMemo(() => {
    const flat = [];
    contractedGaps.forEach(dayEntry => {
      dayEntry.gaps.forEach(g => flat.push({ provider: activeProvider, date: dayEntry.date, start_time: g.start_time, end_time: g.end_time }));
    });
    return flat;
  }, [contractedGaps, activeProvider]);

  const weekConflicts = useMemo(() => computeConflicts(appointments, oooRecords, flatContractedGaps, closedDates), [appointments, oooRecords, flatContractedGaps, closedDates]);

  const displayedDateStrs = useMemo(() => new Set(daysToShow.map(d => d.dateStr)), [daysToShow]);
  const futureLookaheadConflicts = useMemo(() => {
    return lookaheadConflicts.filter(c => !displayedDateStrs.has(c.a.appointment_date));
  }, [lookaheadConflicts, displayedDateStrs]);

  useEffect(() => {
    if (!isAdmin) return;
    api.getProviders().then(setProviders).catch(() => setProviders([]));
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin && !selectedProvider && providers.length > 0) {
      setSelectedProvider(providers[0].Name);
    }
  }, [isAdmin, providers, selectedProvider]);

  

  // Same fix as the daily Schedule view: a transient failure here used to
  // be silently swallowed and treated as "zero non-contracted hours,"
  // making the banner vanish with no visible cause. One retry, then an
  // actual console log if it still fails.
  const fetchContractedGapsWithRetry = async (providerName, start, end) => {
    try {
      return await api.getProviderContractedGaps(providerName, start, end);
    } catch (err) {
      await new Promise(r => setTimeout(r, 800));
      try {
        return await api.getProviderContractedGaps(providerName, start, end);
      } catch (err2) {
        console.error(`Failed to load contracted gaps for ${providerName}:`, err2);
        return [];
      }
    }
  };

  const load = useCallback(async () => {
    if (!activeProvider) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const start = daysToShow[0].dateStr;
    const end = daysToShow[daysToShow.length - 1].dateStr;
    try {
      const [apts, ooo, gaps, closed] = await Promise.all([
        api.getAppointmentsRange(activeProvider, start, end),
        api.getOOORange(activeProvider, start, end),
        fetchContractedGapsWithRetry(activeProvider, start, end),
        api.getClosedDates(start, end).catch(() => []),
      ]);
      setAppointments(apts || []);
      setOooRecords(ooo || []);
      setContractedGaps(gaps || []);
      setClosedDates(closed || []);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, [activeProvider, daysToShow]);

  useEffect(() => { load(); }, [load]);

  const loadLookaheadConflicts = useCallback(async () => {
    if (!activeProvider) {
      setLookaheadConflicts([]);
      return;
    }
    const start = dateToInputValue(new Date());
    const end = dateToInputValue(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));
    try {
      const [windowAppointments, windowOOO, windowGaps, windowClosed] = await Promise.all([
        api.getAppointmentsRange(activeProvider, start, end),
        api.getOOORange(activeProvider, start, end),
        fetchContractedGapsWithRetry(activeProvider, start, end),
        api.getClosedDates(start, end).catch(() => []),
      ]);
      const flatGaps = [];
      (windowGaps || []).forEach(dayEntry => {
        dayEntry.gaps.forEach(g => flatGaps.push({ provider: activeProvider, date: dayEntry.date, start_time: g.start_time, end_time: g.end_time }));
      });
      setLookaheadConflicts(computeConflicts(windowAppointments || [], windowOOO || [], flatGaps, windowClosed || []));
    } catch (err) {
      // Non-critical background check; fail silently rather than disrupting the main view.
    }
  }, [activeProvider]);

  useEffect(() => {
    loadLookaheadConflicts();
    const interval = setInterval(loadLookaheadConflicts, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadLookaheadConflicts]);

  const grid = useMemo(() => {
    const g = {};
    daysToShow.forEach(d => { g[d.dateStr] = {}; });
    appointments.forEach(apt => {
      const dayBucket = g[apt.appointment_date];
      if (!dayBucket) return;
      const slot = apt.appointment_time.slice(0, 5);
      if (!dayBucket[slot]) dayBucket[slot] = [];
      dayBucket[slot].push(apt);
    });
    return g;
  }, [daysToShow, appointments]);

  const oooForDaySlot = (dateStr, time) => {
    const slotM = timeToMinutes(time);
    return oooRecords.find(o => {
      if (o.ooo_date !== dateStr) return false;
      const start = timeToMinutes(o.start_time.slice(0, 5));
      const end = timeToMinutes(o.end_time.slice(0, 5));
      return slotM >= start && slotM < end;
    });
  };

  // Non-contracted shading per row comes from gapSegmentsForSlot (SchedulePage.jsx).

  const goPrevWeek = () => setWeekAnchor(prev => addDays(prev, -7));
  const goNextWeek = () => setWeekAnchor(prev => addDays(prev, 7));
  const goThisWeek = () => setWeekAnchor(startOfWeek(new Date()));

  const goPrevDay = () => setMobileDay(prev => addDays(prev, -1));
  const goNextDay = () => setMobileDay(prev => addDays(prev, 1));
  const goToday = () => setMobileDay(new Date());

  // Jumping to an arbitrary date via the calendar picker: land on that day
  // in mobile mode, or on the week containing it in desktop mode.
  const handleDateJump = (dateStr) => {
    const picked = new Date(dateStr + 'T00:00:00');
    if (isMobile) setMobileDay(picked);
    else setWeekAnchor(startOfWeek(picked));
    setShowDatePicker(false);
  };

  // Quick-edit dropdowns need the same virtual-vs-real branching as the
  // full modal: editing a virtual occurrence materializes it into a real
  // exception row instead of updating a row that doesn't exist.
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
    load();
  };

  const handleStatusChange = async (apt, newStatus) => {
    setStatusDropdown(null);
    await applyQuickEdit(apt, { appointment_status: newStatus, treatment_area: newStatus === 'Canceled' ? null : apt.treatment_area });
    load();
  };

  const weekRangeLabel = `${daysToShow[0].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} \u2013 ${daysToShow[daysToShow.length - 1].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  const dayLabel = daysToShow[0].date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const datePickerValue = isMobile ? dateToInputValue(mobileDay) : dateToInputValue(weekAnchor);

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f6f7f9', height: '100vh', padding: isMobile ? '16px' : '20px 28px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16, flexShrink: 0 }}>
        <h1 style={{ fontFamily: BRAND_SERIF, fontSize: 19, fontWeight: 700, margin: 0, color: '#241A33', whiteSpace: 'nowrap' }}>
          {isMobile ? "Today's Schedule" : 'Weekly Schedule'}
        </h1>

        {isAdmin ? (
          <select
            value={selectedProvider}
            onChange={e => setSelectedProvider(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: 4, border: `1.5px solid ${BRAND.box}`, fontSize: 13, fontWeight: 600, color: '#241A33', background: 'white' }}
          >
            {providers.map(p => <option key={p.id} value={p.Name}>{p.Name}</option>)}
          </select>
        ) : (
          <span style={{ padding: '6px 12px', borderRadius: 4, border: `1.5px solid ${BRAND.box}`, fontSize: 13, fontWeight: 600, color: '#241A33', background: BRAND.tint }}>
            {lockedProvider || 'No provider linked'}
          </span>
        )}

        {isMobile ? (
          <button onClick={goPrevDay} style={iconBtnStyle()}><ChevronLeft size={14} /></button>
        ) : (
          <button onClick={goPrevWeek} style={iconBtnStyle()}><ChevronLeft size={14} /></button>
        )}

        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setShowDatePicker(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 4,
              border: `1.5px solid ${BRAND.box}`, background: 'white', fontWeight: 600, fontSize: 13,
              color: '#241A33', cursor: 'pointer', width: isMobile ? 220 : 210, justifyContent: isMobile ? 'flex-start' : 'center',
              boxSizing: 'border-box',
            }}
          >
            <CalendarIcon size={14} color={BRAND.forest} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {isMobile ? dayLabel : weekRangeLabel}
            </span>
          </button>
          {showDatePicker && (
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 50, background: 'white', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', borderRadius: 4 }}>
              <CalendarPicker value={datePickerValue} onChange={handleDateJump} />
            </div>
          )}
        </div>

        {isMobile ? (
          <button onClick={goNextDay} style={iconBtnStyle()}><ChevronRight size={14} /></button>
        ) : (
          <button onClick={goNextWeek} style={iconBtnStyle()}><ChevronRight size={14} /></button>
        )}
        <button onClick={isMobile ? goToday : goThisWeek} style={secondaryBtnStyle()}>{isMobile ? 'Today' : 'This Week'}</button>

        <Dot />
        <button
          onClick={() => { setEditingAppointment(null); setPrefill({ provider: activeProvider }); setShowModal(true); }}
          disabled={!activeProvider}
          style={primaryBtnStyle()}
        >
          <PlusIcon size={13} color="white" /> Create Appointment
        </button>
        <button onClick={() => navigate('/time')} disabled={!activeProvider} style={secondaryBtnStyle()} title="Out of Office is now requested from My time, so it can go through approval">
          <PlusIcon size={13} /> Request Time Off
        </button>
      </div>

      {futureLookaheadConflicts.length > 0 && (
        <div style={{ marginBottom: 10, borderRadius: 10, background: '#FFF7ED', border: '1px solid #FDBA74', padding: 12, flexShrink: 0 }}>
          <div
            onClick={() => setShowLookaheadDetails(o => !o)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#EA580C' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#9A3412' }}>
                {futureLookaheadConflicts.length} scheduling {futureLookaheadConflicts.length === 1 ? 'conflict' : 'conflicts'} for {activeProvider} in the next 2 weeks
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
                  ? `${c.a.patient_name} is scheduled at ${timeText} while ${activeProvider} is Out of Office (${c.ooo.type})`
                  : c.kind === 'contracted-gap'
                  ? `${c.a.patient_name} is scheduled at ${timeText}, outside ${activeProvider}'s contracted hours`
                  : `${c.a.patient_name} and ${c.b.patient_name} overlap around ${timeText}`;
                return (
                  <div key={idx} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, color: '#9A3412' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600 }}>{dateLabel}</span>
                    <span style={{ fontSize: 13 }}>{message}</span>
                    <button
                      onClick={() => (c.kind === 'ooo' || c.kind === 'contracted-gap' || c.kind === 'closed') ? (() => { setEditingAppointment(c.a); setPrefill(null); setShowModal(true); })() : setReviewingConflict(c)}
                      style={{ fontSize: 12.5, fontWeight: 600, color: '#9A3412', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
                    >
                      Review
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {weekConflicts.length > 0 && (
        <div style={{ marginBottom: 10, borderRadius: 10, background: '#FFF7ED', border: '1px solid #FDBA74', padding: 12, flexShrink: 0 }}>
          <div
            onClick={() => setShowConflictDetails(o => !o)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#EA580C' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#9A3412' }}>
                {weekConflicts.length} scheduling {weekConflicts.length === 1 ? 'conflict' : 'conflicts'} for {activeProvider} {isMobile ? 'today' : 'this week'}
              </span>
            </div>
            <span style={{ fontSize: 12, color: '#9A3412', fontWeight: 600 }}>{showConflictDetails ? 'Hide' : 'Show'}</span>
          </div>
          {showConflictDetails && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
              {weekConflicts.map((c, idx) => {
                const dateLabel = new Date(c.a.appointment_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                const range = getAppointmentTimeRange(c.a);
                const h = Math.floor(range.start / 60);
                const m = range.start % 60;
                const timeText = formatSlotLabel(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
                const message = c.kind === 'closed'
                  ? `${c.a.patient_name} is scheduled at ${timeText} on a day the office is closed${c.closed.reason && c.closed.reason !== 'Office closed' ? ` (${c.closed.reason})` : ''}`
                  : c.kind === 'ooo'
                  ? `${c.a.patient_name} is scheduled at ${timeText} while ${activeProvider} is Out of Office (${c.ooo.type})`
                  : c.kind === 'contracted-gap'
                  ? `${c.a.patient_name} is scheduled at ${timeText}, outside ${activeProvider}'s contracted hours`
                  : `${c.a.patient_name} and ${c.b.patient_name} overlap around ${timeText}`;
                return (
                  <div key={idx} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, color: '#9A3412' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600 }}>{dateLabel}</span>
                    <span style={{ fontSize: 13 }}>{message}</span>
                    <button
                      onClick={() => (c.kind === 'ooo' || c.kind === 'contracted-gap' || c.kind === 'closed') ? (() => { setEditingAppointment(c.a); setPrefill(null); setShowModal(true); })() : setReviewingConflict(c)}
                      style={{ fontSize: 12.5, fontWeight: 600, color: '#9A3412', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
                    >
                      Review
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!activeProvider ? (
        <div style={{ background: 'white', borderRadius: 4, border: `1.5px solid ${BRAND.box}`, padding: 24 }}>
          <p style={{ fontSize: 13.5, color: BRAND.muted, margin: 0 }}>
            No provider is linked to your account, so there's no schedule to show here. Ask an admin to link your
            account to a provider from Manage Data &rarr; Staff.
          </p>
        </div>
      ) : error ? (
        <p style={{ color: '#dc2626', fontSize: 13 }}>{error}</p>
      ) : loading ? (
        <p style={{ fontSize: 13, color: '#9ca3af' }}>Loading...</p>
      ) : (
        <div style={{ background: 'white', borderRadius: 4, border: `1.5px solid ${BRAND.forest}`, overflow: 'auto', boxShadow: '0 8px 28px rgba(76,29,107,0.10)', flex: 1, minHeight: 0 }}>
          <div style={{ position: 'relative' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 64 }} />
              {daysToShow.map(d => <col key={d.dateStr} />)}
            </colgroup>
            <thead style={{ position: 'sticky', top: 0, zIndex: 20 }}>
              <tr>
                <th style={thStyle()}>Time</th>
                {daysToShow.map(d => (
                  <th key={d.dateStr} style={thStyle()}>
                    {isMobile ? d.date.toLocaleDateString('en-US', { weekday: 'long' }) : `${d.label} ${d.dayNum}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIME_SLOTS.map(time => {
                const isHour = time.endsWith(':00');
                return (
                  <tr key={time} style={{ borderTop: isHour ? '1px solid #e5e7eb' : '1px solid #f3f4f6', height: ROW_HEIGHT }}>
                    <td style={tdTimeStyle(isHour)}>{formatSlotLabel(time)}</td>
                    {daysToShow.map(d => {
                      const cellAppointments = (grid[d.dateStr]?.[time] || [])
                        .slice()
                        .sort((a, b) => (a.appointment_status === 'Canceled' ? 1 : 0) - (b.appointment_status === 'Canceled' ? 1 : 0));
                      const oooMatch = oooForDaySlot(d.dateStr, time);
                      const contractedGapSegments = closedByDate[d.dateStr] ? [] : gapSegmentsForSlot(contractedGaps.find(g => g.date === d.dateStr)?.gaps, time, ROW_HEIGHT);
                      return (
                        <td
                          key={d.dateStr}
                          style={tdCellStyle()}
                          onDoubleClick={(e) => {
                            if (e.target !== e.currentTarget) return;
                            setEditingAppointment(null);
                            setPrefill({ time, provider: activeProvider, appointment_date: d.dateStr });
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
                                  position: 'absolute', top: oooTop, left: 0, right: 0, height: oooHeight,
                                  background: oooColors.background,
                                  borderTop: isFirstSlot ? `2px dashed ${oooColors.border}` : 'none',
                                  cursor: 'pointer', zIndex: 1, display: 'flex',
                                  alignItems: isFirstSlot ? 'flex-start' : 'center', justifyContent: 'center',
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
                                hasConflict={false}
                                onClick={() => { setEditingAppointment(apt); setShowModal(true); }}
                                badgeLabel={roomBadgeLabel(apt.treatment_area)}
                                badgeColor={apt.treatment_area ? roomColor(apt.treatment_area) : undefined}
                                badgeIcon={null}
                                onRoomClick={(e) => {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setRoomDropdown({ apt, top: rect.bottom + 4, left: rect.left });
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
          {daysToShow.map((d, i) => closedByDate[d.dateStr] && (
            <ClosedDaySash
              key={d.dateStr}
              reason={closedByDate[d.dateStr].reason}
              style={{ left: `calc(64px + (100% - 64px) * ${i} / ${daysToShow.length})`, width: `calc((100% - 64px) / ${daysToShow.length})` }}
            />
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

      {showModal && (
        <AppointmentModal
          providers={providers.length ? providers : [{ id: 'locked', Name: activeProvider }]}
          existing={editingAppointment}
          defaultDate={prefill?.appointment_date ? new Date(prefill.appointment_date + 'T00:00:00') : daysToShow[0].date}
          prefill={prefill}
          onClose={() => { setShowModal(false); setEditingAppointment(null); setPrefill(null); }}
          onSaved={() => { setShowModal(false); setEditingAppointment(null); setPrefill(null); load(); }}
          onCommentsSynced={load}
        />
      )}

      {showOOOModal && (
        <OOOModal
          providers={providers.length ? providers : [{ id: 'locked', Name: activeProvider }]}
          existing={editingOOO}
          defaultDate={daysToShow[0].date}
          onClose={() => { setShowOOOModal(false); setEditingOOO(null); }}
          onSaved={() => { setShowOOOModal(false); setEditingOOO(null); load(); }}
          onCommentsSynced={load}
        />
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
    </div>
  );
}
