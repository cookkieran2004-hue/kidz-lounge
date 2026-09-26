import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { useIsMobile } from '../useIsMobile';
import { TimeOffTab, BRAND, BRAND_SERIF, calculateTenure } from './StaffPage';
import { timeTypeStyle, sessionStyle, monthlyAccrual } from '../timeTypes';
import TimeOffHistory from '../TimeOffHistory';
import { Card, Pill, INK, MUTED, HAIRLINE, PAGE_BG, FONT } from '../dashboardUi';
import { DateField, AppointmentModal, OOOModal, dateToInputValue, formatSlotLabel } from './SchedulePage';

// My time: a personal dashboard for everything about your time at work --
// balances and what they'll be, your week, what's coming up, your contracted
// hours -- with your requests below.
// Everything here is read from endpoints any staff member can already use;
// the week view is built from the schedule for providers (so it includes
// appointments) and from approved requests for everyone else.



// Week grid: 7 AM - 7 PM, 44px per hour.
const DAY_START = 7;
const DAY_END = 19;
const HOUR_PX = 44;

// Same colors as the schedule (see timeTypes.js). A session gets its
// appointment status color, like the schedule's cards.
// The schedule's shading for time outside a provider's contracted hours.
const NOT_CONTRACTED_BG = 'repeating-linear-gradient(135deg, #f3f4f6, #f3f4f6 6px, #e9eaec 6px, #e9eaec 12px)';

const typeStyle = (t, status) => (t === 'Appointment' ? sessionStyle(status) : timeTypeStyle(t));

// ---------- small date/time helpers ----------
const toDate = (s) => new Date(s + 'T00:00:00');
const addDays = (s, n) => { const d = toDate(s); d.setDate(d.getDate() + n); return dateToInputValue(d); };
const todayStr = () => dateToInputValue(new Date());
const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000);
const mins = (t) => { const [h, m] = (t || '0:0').split(':').map(Number); return h * 60 + m; };
const hoursLabel = (h) => `${Number.isInteger(h) ? h : h.toFixed(2).replace(/0$/, '')}h`;
const shortDate = (s) => toDate(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const longDate = (s) => toDate(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const timeRange = (a, b) => `${formatSlotLabel(a.slice(0, 5))} – ${formatSlotLabel(b.slice(0, 5))}`;
function mondayOf(s) {
  const d = toDate(s);
  const back = (d.getDay() + 6) % 7;
  return addDays(s, -back);
}
// What a PTO/UPTO request costs: the scheduled hours it covers, worked out
// by the API (charged_hours). Older requests without one fall back to the
// clock hours they were deducted at.
function requestHours(r) {
  if (!r.is_balance_type) return 0;
  if (r.charged_hours !== null && r.charged_hours !== undefined) return Number(r.charged_hours);
  if (!r.start_date || !r.end_date || !r.start_time || !r.end_time) return 0;
  const start = new Date(`${r.start_date}T${r.start_time}`);
  const end = new Date(`${r.end_date}T${r.end_time}`);
  return Math.max(0, Math.round(((end - start) / 3600000) * 100) / 100);
}
function firstDayOf(r) { return r.is_balance_type ? r.start_date : r.is_recurring ? r.recurring_start_date : r.ooo_date; }
function lastDayOf(r) { return r.is_balance_type ? r.end_date : r.is_recurring ? null : r.ooo_date; }
// PTO on `target`: a weekly credit every Sunday at the person's scheduled
// rate, never past the 120-hour cap, cut to 40 at each year end -- the same
// rules as the Sunday job (kidz-lounge-api/lib/ptoAccrual.js).
function forecastPto(start, weekly, policy, fromStr, target) {
  let bal = start;
  let weeks = 0;
  let d = toDate(fromStr); d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7)); // next Sunday
  for (; dateToInputValue(d) <= target; d.setDate(d.getDate() + 7)) {
    const sunday = dateToInputValue(d);
    if (bal < policy.balance_cap) bal = Math.min(policy.balance_cap, bal + weekly);
    weeks++;
    const yearEnd = `${Number(sunday.slice(0, 4)) - 1}-12-31`;
    if (addDays(sunday, -7) < yearEnd && yearEnd < sunday && bal > policy.carryover_max) bal = policy.carryover_max;
  }
  return { value: Math.round(bal * 100) / 100, weeks };
}
// 1st-of-month credits strictly after today, up to and including `target`.
function creditsBetween(fromStr, target) {
  let n = 0;
  const d = toDate(fromStr); d.setDate(1); d.setMonth(d.getMonth() + 1);
  while (dateToInputValue(d) <= target) { n++; d.setMonth(d.getMonth() + 1); }
  return n;
}
// Hours in effect on a date: the most recently started change covering it,
// otherwise the standing weekly schedule (same rule as the API).
function hoursOn(dateStr, standing, changes) {
  let pick = null;
  for (const c of changes) {
    if (c.start_date > dateStr || (c.end_date && c.end_date < dateStr)) continue;
    if (!pick || c.start_date > pick.start_date) pick = c;
  }
  const rows = pick ? pick.schedule : standing;
  return rows.find(r => Number(r.weekday) === toDate(dateStr).getDay()) || null;
}

// Blocks for one date from an approved/pending request (non-providers: the
// requests are the source; providers get them from the schedule instead).
function requestBlocksOn(r, dateStr) {
  const blocks = [];
  const base = { type: r.request_type, pending: r.status === 'pending', title: r.request_type, note: r.notes, date: dateStr, request: r };
  if (r.is_balance_type) {
    if (dateStr < r.start_date || dateStr > r.end_date) return blocks;
    const start = dateStr === r.start_date ? r.start_time : '00:00';
    const end = dateStr === r.end_date ? r.end_time : '23:59';
    blocks.push({ ...base, start, end });
  } else if (r.is_recurring) {
    if (dateStr >= r.recurring_start_date && toDate(dateStr).getDay() === Number(r.weekday)) blocks.push({ ...base, start: r.start_time, end: r.end_time });
  } else if (r.ooo_date === dateStr) {
    blocks.push({ ...base, start: r.start_time, end: r.end_time });
  }
  return blocks.filter(b => b.start && b.end);
}

// Side-by-side lanes for overlapping blocks within a day.
function layoutLanes(blocks) {
  const sorted = [...blocks].sort((a, b) => mins(a.start) - mins(b.start) || mins(b.end) - mins(a.end));
  const out = [];
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = [];
    cluster.forEach(b => {
      let lane = lanes.findIndex(end => end <= mins(b.start));
      if (lane === -1) { lane = lanes.length; lanes.push(0); }
      lanes[lane] = mins(b.end);
      b.lane = lane;
    });
    cluster.forEach(b => { b.lanes = lanes.length; out.push(b); });
    cluster = [];
  };
  sorted.forEach(b => {
    if (cluster.length && mins(b.start) >= clusterEnd) flush();
    cluster.push(b);
    clusterEnd = Math.max(clusterEnd, mins(b.end));
  });
  if (cluster.length) flush();
  return out;
}

// ---------- visual building blocks ----------
function iconBtn() {
  return { width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: `1px solid ${HAIRLINE}`, background: 'white', color: MUTED, cursor: 'pointer', fontSize: 15 };
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

// ---------- balances + forecast ----------
function BalanceCard({ type, hours, pendingHours, policy }) {
  const s = typeStyle(type);
  const negative = hours < 0;
  const days = hours / 8;
  return (
    <Card pad={16} style={{ position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: '0 auto 0 0', width: 4, background: s.border }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: s.accent }}>{type === 'PTO' ? 'PAID TIME OFF' : 'UNPAID TIME OFF'}</span>
        {type === 'PTO'
          ? <span title={policy ? `${policy.pto.rate}h of PTO for every hour worked, credited on Sundays. About ${policy.pto.estimated_weekly_credit}h a week on your usual schedule.` : undefined}><Pill bg={s.bg} color={s.text}>+{policy ? hoursLabel(policy.pto.estimated_weekly_credit) : '…'} / week</Pill></span>
          : <Pill bg={s.bg} color={s.text}>+{hoursLabel(policy?.upto?.monthly_hours ?? monthlyAccrual(type))} / month</Pill>}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontFamily: BRAND_SERIF, fontSize: 34, fontWeight: 700, color: negative ? '#B42318' : INK, lineHeight: 1.1 }}>{hoursLabel(hours).replace('h', '')}</span>
        <span style={{ fontSize: 13, color: MUTED }}>hours</span>
        <span style={{ fontSize: 12, color: MUTED, marginLeft: 'auto' }}>≈ {days.toFixed(1)} days</span>
      </div>
      <div style={{ fontSize: 12, color: MUTED, marginTop: 6, minHeight: 16 }}>
        {pendingHours > 0 ? <><b style={{ color: '#92400E' }}>{hoursLabel(pendingHours)}</b> waiting on approval</> : 'Nothing pending'}
      </div>
      {type === 'PTO' && policy && (
        <div style={{ fontSize: 11.5, color: hours >= policy.pto.balance_cap ? '#B54708' : MUTED, marginTop: 4 }}>
          {hours >= policy.pto.balance_cap
            ? `At the ${policy.pto.balance_cap}h cap -- use some to keep earning`
            : `${policy.pto.rate}h per hour worked · cap ${policy.pto.balance_cap}h`}
        </div>
      )}
    </Card>
  );
}

function ForecastCard({ balances, pendingByType, policy }) {
  const [target, setTarget] = useState(() => addDays(todayStr(), 90));
  const future = target > todayStr();
  const credits = future ? creditsBetween(todayStr(), target) : 0;
  const pto = policy && future
    ? forecastPto((balances.PTO ?? 0) - (pendingByType.PTO || 0), policy.pto.estimated_weekly_credit, policy.pto, todayStr(), target)
    : { value: (balances.PTO ?? 0) - (pendingByType.PTO || 0), weeks: 0 };
  const rows = [
    { t: 'PTO', value: pto.value },
    { t: 'UPTO', value: (balances.UPTO ?? 0) + credits * (policy?.upto?.monthly_hours ?? monthlyAccrual('UPTO')) - (pendingByType.UPTO || 0) },
  ];
  return (
    <Card pad={16} style={{ background: `linear-gradient(135deg, ${BRAND.forest} 0%, #8B5CF6 100%)`, border: 'none', color: 'white' }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', opacity: 0.85, marginBottom: 8 }}>PLAN AHEAD</div>
      <div style={{ fontSize: 13, marginBottom: 8, opacity: 0.95 }}>What you'll have on</div>
      <DateField
        value={target}
        onChange={(v) => v && setTarget(v)}
        min={todayStr()}
        floating
        ariaLabel="Forecast date"
        style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.35)', fontSize: 13, boxSizing: 'border-box', background: 'rgba(255,255,255,0.14)', color: 'white' }}
      />
      <div style={{ display: 'flex', gap: 18, marginTop: 12 }}>
        {rows.map(r => (
          <div key={r.t}>
            <div style={{ fontFamily: BRAND_SERIF, fontSize: 24, fontWeight: 700 }}>{hoursLabel(r.value)}</div>
            <div style={{ fontSize: 11, opacity: 0.85 }}>{r.t}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, opacity: 0.8, marginTop: 8 }}>
        {pto.weeks} weekly PTO credit{pto.weeks === 1 ? '' : 's'} on your usual schedule and {credits} monthly UPTO credit{credits === 1 ? '' : 's'} by then{Object.values(pendingByType).some(Boolean) ? ', after pending requests' : ''}.
      </div>
    </Card>
  );
}

function NextUpCard({ next, onNew }) {
  if (!next) {
    return (
      <Card pad={16}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: MUTED, marginBottom: 8 }}>NEXT TIME OFF</div>
        <div style={{ fontFamily: BRAND_SERIF, fontSize: 18, fontWeight: 700, color: INK, marginBottom: 4 }}>Nothing booked yet</div>
        <p style={{ fontSize: 12.5, color: MUTED, margin: '0 0 12px' }}>Time for a break? Requests go to an admin for approval.</p>
        <button type="button" onClick={onNew} style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${BRAND.box}`, background: BRAND.tint, color: BRAND.forest, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>Plan time off</button>
      </Card>
    );
  }
  const s = typeStyle(next.request_type);
  const inDays = daysBetween(todayStr(), firstDayOf(next));
  const span = next.is_balance_type && next.end_date !== next.start_date ? `${shortDate(next.start_date)} – ${shortDate(next.end_date)}` : longDate(firstDayOf(next));
  return (
    <Card pad={16}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: MUTED, marginBottom: 8 }}>NEXT TIME OFF</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontFamily: BRAND_SERIF, fontSize: 34, fontWeight: 700, color: INK, lineHeight: 1.1 }}>{inDays <= 0 ? 'Today' : inDays}</span>
        {inDays > 0 && <span style={{ fontSize: 13, color: MUTED }}>day{inDays === 1 ? '' : 's'} to go</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <Pill bg={s.bg} color={s.text}>{s.label}</Pill>
        <span style={{ fontSize: 12.5, color: INK }}>{span}</span>
        {requestHours(next) > 0 && <span style={{ fontSize: 12, color: MUTED }}>· {hoursLabel(requestHours(next))}</span>}
      </div>
    </Card>
  );
}

// ---------- week view ----------
function WeekView({ weekStart, setWeekStart, days, isMobile, isProvider, onOpen }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);
  const today = todayStr();
  const heading = `${shortDate(weekStart)} – ${shortDate(addDays(weekStart, 6))}`;
  const nav = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button type="button" style={iconBtn()} aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}>‹</button>
      <button type="button" onClick={() => setWeekStart(mondayOf(today))} style={{ ...iconBtn(), width: 'auto', padding: '0 10px', fontSize: 12, fontWeight: 600, color: INK }}>This week</button>
      <button type="button" style={iconBtn()} aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}>›</button>
    </div>
  );

  const legend = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12, fontSize: 11, color: MUTED }}>
      {isProvider && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: NOT_CONTRACTED_BG, border: '1px solid #e2e4e9' }} />Not contracted</span>}
      {(isProvider ? ['Appointment', 'PTO', 'UPTO', 'Lunch', 'Meeting'] : ['PTO', 'UPTO', 'Lunch', 'Meeting']).map(t => {
        const ts = typeStyle(t);
        const swatch = ts.bar ? { background: ts.bg, borderLeft: `3px solid ${ts.border}` } : { background: ts.bg, border: `1.5px solid ${ts.border}` };
        return <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, boxSizing: 'border-box', ...swatch }} />{ts.label}</span>;
      })}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, border: `1.5px dashed ${MUTED}` }} />Pending</span>
    </div>
  );

  if (isMobile) {
    return (
      <Card title={`Week of ${heading}`} action={nav}>
        {days.map(d => (
          <div key={d.date} style={{ padding: '10px 0', borderTop: `1px solid ${HAIRLINE}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 13.5, color: d.date === today ? BRAND.forest : INK }}>{longDate(d.date)}</span>
              <span style={{ fontSize: 11.5, color: MUTED }}>{d.closed ? d.closed : d.contract ? timeRange(d.contract.start_time, d.contract.end_time) : isProvider ? 'Not scheduled' : ''}</span>
            </div>
            {d.blocks.length === 0 && !d.closed && <div style={{ fontSize: 12, color: MUTED }}>Nothing booked</div>}
            {[...d.blocks].sort((a, b) => mins(a.start) - mins(b.start)).map((b, i) => {
              const s = typeStyle(b.type, b.appointment?.appointment_status);
              return (
                <button type="button" key={i} onClick={() => onOpen(b)} style={{ display: 'flex', width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit', border: 'none', gap: 8, alignItems: 'center', padding: '6px 8px', marginBottom: 4, borderRadius: 8, background: s.bg, borderLeft: `3px ${b.pending ? 'dashed' : 'solid'} ${s.border}` }}>
                  <span style={{ fontSize: 11.5, color: s.text, fontWeight: 700, minWidth: 110 }}>{timeRange(b.start, b.end)}</span>
                  <span style={{ fontSize: 12.5, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}{b.pending ? ' · pending' : ''}{b.canceled ? ' · canceled' : ''}</span>
                </button>
              );
            })}
          </div>
        ))}
        {legend}
      </Card>
    );
  }

  const hours = [];
  for (let h = DAY_START; h < DAY_END; h++) hours.push(h);
  const height = (DAY_END - DAY_START) * HOUR_PX;
  const topFor = (t) => Math.max(0, Math.min(height, ((mins(t) - DAY_START * 60) / 60) * HOUR_PX));
  const nowTop = topFor(`${now.getHours()}:${now.getMinutes()}`);

  return (
    <Card title={`Week of ${heading}`} action={nav}>
      <div style={{ display: 'grid', gridTemplateColumns: `52px repeat(${days.length}, 1fr)`, border: `1px solid ${HAIRLINE}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ background: '#FCFBFE', borderBottom: `1px solid ${HAIRLINE}` }} />
        {days.map(d => (
          <div key={d.date} style={{ padding: '8px 6px', textAlign: 'center', background: d.date === today ? BRAND.tint : '#FCFBFE', borderBottom: `1px solid ${HAIRLINE}`, borderLeft: `1px solid ${HAIRLINE}` }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', color: d.date === today ? BRAND.forest : MUTED }}>{toDate(d.date).toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}</div>
            <div style={{ fontFamily: BRAND_SERIF, fontSize: 18, fontWeight: 700, color: d.date === today ? BRAND.forest : INK }}>{toDate(d.date).getDate()}</div>
            <div style={{ fontSize: 10.5, color: MUTED, minHeight: 14 }}>{d.bookedLabel}</div>
          </div>
        ))}
        <div style={{ position: 'relative', height }}>
          {hours.map(h => (
            <div key={h} style={{ position: 'absolute', top: (h - DAY_START) * HOUR_PX - 6, right: 6, fontSize: 10, color: '#A7A1B5' }}>{h === DAY_START ? '' : formatSlotLabel(`${h}:00`).replace(':00', '')}</div>
          ))}
        </div>
        {days.map(d => (
          <div key={d.date} style={{ position: 'relative', height, borderLeft: `1px solid ${HAIRLINE}`, background: 'white' }}>
            {hours.map(h => <div key={h} style={{ position: 'absolute', left: 0, right: 0, top: (h - DAY_START) * HOUR_PX, borderTop: h === DAY_START ? 'none' : '1px solid #F3F1F8' }} />)}
            {isProvider && !d.closed && (d.contract
              ? [[0, topFor(d.contract.start_time)], [topFor(d.contract.end_time), height]]
              : [[0, height]]
            ).filter(([a, z]) => z > a).map(([a, z]) => (
              <div key={a} title="Not contracted at this time" style={{ position: 'absolute', left: 0, right: 0, top: a, height: z - a, background: NOT_CONTRACTED_BG, pointerEvents: 'none' }} />
            ))}
            {d.closed && (
              <div title={d.closed} style={{ position: 'absolute', inset: 0, zIndex: 3, background: 'rgba(109, 40, 217, 0.035)', display: 'flex', alignItems: 'center', overflow: 'hidden', pointerEvents: 'none' }}>
                <span style={{ width: '100%', textAlign: 'center', padding: '8px 4px', background: 'rgba(109, 40, 217, 0.13)', borderTop: '2px solid rgba(109, 40, 217, 0.35)', borderBottom: '2px solid rgba(109, 40, 217, 0.35)', color: BRAND.brassText, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{d.closed}</span>
              </div>
            )}
            {layoutLanes(d.blocks).map((b, i) => {
              const s = typeStyle(b.type, b.appointment?.appointment_status);
              const top = topFor(b.start);
              const h = Math.max(18, topFor(b.end) - top);
              if (topFor(b.end) <= 0 || top >= height) return null;
              return (
                <button
                  type="button"
                  key={i}
                  onClick={() => onOpen(b)}
                  title={`${b.title} · ${timeRange(b.start, b.end)}${b.pending ? ' · pending approval' : ''}`}
                  className="kl-mytime-block"
                  style={{
                    position: 'absolute', top: top + 1, height: h - 2, textAlign: 'left', cursor: 'pointer', font: 'inherit', display: 'block',
                    left: `calc(${(b.lane / b.lanes) * 100}% + 3px)`, width: `calc(${100 / b.lanes}% - 6px)`,
                    background: s.bg, boxSizing: 'border-box', overflow: 'hidden', padding: '3px 6px',
                    ...(s.bar
                      ? { border: 'none', borderLeft: `3px solid ${s.border}`, borderRadius: 6, boxShadow: '0 0 0 1px white, 0 1px 3px rgba(0,0,0,0.1)' }
                      : { border: `1.5px ${b.pending ? 'dashed' : 'solid'} ${s.border}`, borderRadius: 7, boxShadow: 'none' }),
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: s.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: b.canceled ? 'line-through' : 'none' }}>{b.title}</div>
                  {h > 34 && <div style={{ fontSize: 10, color: s.text, opacity: 0.8, whiteSpace: 'nowrap' }}>{timeRange(b.start, b.end)}</div>}
                </button>
              );
            })}
            {d.date === today && nowTop > 0 && nowTop < height && (
              <div style={{ position: 'absolute', left: 0, right: 0, top: nowTop, height: 2, background: '#E11D48', zIndex: 3 }}>
                <div style={{ position: 'absolute', left: -4, top: -3, width: 8, height: 8, borderRadius: '50%', background: '#E11D48' }} />
              </div>
            )}
          </div>
        ))}
      </div>
      {legend}
    </Card>
  );
}

// ---------- coming up ----------
function ComingUp({ items }) {
  return (
    <Card title="Coming up">
      {items.length === 0 && <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>Nothing on the horizon.</p>}
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, position: 'relative' }}>
        {items.map((it, i) => (
          <li key={i} style={{ display: 'flex', gap: 12, paddingBottom: i === items.length - 1 ? 0 : 14, position: 'relative' }}>
            {i < items.length - 1 && <span style={{ position: 'absolute', left: 21, top: 44, bottom: 0, width: 2, background: HAIRLINE }} />}
            <div style={{ width: 44, flexShrink: 0, textAlign: 'center', borderRadius: 10, background: it.accentBg, padding: '5px 0' }}>
              <div style={{ fontSize: 9.5, fontWeight: 800, color: it.accent, letterSpacing: '0.05em' }}>{toDate(it.date).toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</div>
              <div style={{ fontFamily: BRAND_SERIF, fontSize: 17, fontWeight: 700, color: it.accent, lineHeight: 1.1 }}>{toDate(it.date).getDate()}</div>
            </div>
            <div style={{ minWidth: 0, paddingTop: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: INK }}>{it.title}</span>
                {it.badge}
              </div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{it.detail}</div>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

// ---------- my hours ----------
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function MyHoursCard({ isProvider, standing, changes, officeHours }) {
  const today = todayStr();
  const upcoming = changes.filter(c => !c.end_date || c.end_date >= today).slice(0, 3);
  const rows = isProvider ? standing : officeHours.map(o => ({ weekday: o.weekday, start_time: o.open_time, end_time: o.close_time }));
  const total = rows.reduce((sum, r) => sum + (mins(r.end_time) - mins(r.start_time)) / 60, 0);
  return (
    <Card title={isProvider ? 'My contracted hours' : 'Office hours'} action={isProvider && total > 0 ? <Pill bg={BRAND.tint} color={BRAND.forest}>{hoursLabel(Math.round(total * 100) / 100)} / week</Pill> : null}>
      {rows.length === 0 && <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>{isProvider ? 'No contracted hours are set up yet. Ask an admin.' : 'Office hours aren\'t set up yet.'}</p>}
      <div style={{ display: 'grid', gap: 4 }}>
        {WEEKDAY_ORDER.map(wd => {
          const r = rows.find(x => Number(x.weekday) === wd);
          if (!r && (wd === 0 || wd === 6)) return null;
          const todayWd = new Date().getDay() === wd;
          return (
            <div key={wd} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 8px', borderRadius: 7, background: todayWd ? BRAND.tint : 'transparent' }}>
              <span style={{ fontWeight: 600, color: todayWd ? BRAND.forest : INK }}>{WEEKDAY_NAMES[wd]}</span>
              <span style={{ color: r ? INK : '#A7A1B5' }}>{r ? timeRange(r.start_time, r.end_time) : 'Off'}</span>
            </div>
          );
        })}
      </div>
      {isProvider && upcoming.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${HAIRLINE}` }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: MUTED, marginBottom: 6 }}>SCHEDULED CHANGES</div>
          {upcoming.map(c => (
            <div key={c.id} style={{ fontSize: 12.5, color: INK, marginBottom: 4 }}>
              {c.end_date ? <>Temporary hours <b>{shortDate(c.start_date)} – {shortDate(c.end_date)}</b></> : <>New hours from <b>{shortDate(c.start_date)}</b></>}
              <span style={{ color: MUTED }}> · {c.schedule.length ? c.schedule.map(d => WEEKDAY_NAMES[d.weekday]).join(', ') : 'no days'}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------- provider snapshot ----------
function ThisWeekCard({ appointments, contractedHours }) {
  const active = appointments.filter(a => a.appointment_status !== 'Canceled');
  const canceled = appointments.length - active.length;
  const booked = active.reduce((s, a) => s + (Number(a.duration) || 30) / 60, 0);
  const pct = contractedHours > 0 ? Math.min(100, Math.round((booked / contractedHours) * 100)) : 0;
  return (
    <Card title="This week">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <div style={{ background: BRAND.tint, borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ fontFamily: BRAND_SERIF, fontSize: 24, fontWeight: 700, color: INK }}>{active.length}</div>
          <div style={{ fontSize: 11.5, color: MUTED }}>sessions</div>
        </div>
        <div style={{ background: '#FEF3F2', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ fontFamily: BRAND_SERIF, fontSize: 24, fontWeight: 700, color: '#B42318' }}>{canceled}</div>
          <div style={{ fontSize: 11.5, color: MUTED }}>canceled</div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: MUTED, marginBottom: 6 }}>
        <span>Booked vs contracted</span>
        <span style={{ color: INK, fontWeight: 700 }}>{hoursLabel(Math.round(booked * 100) / 100)} of {hoursLabel(Math.round(contractedHours * 100) / 100)}</span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: '#EEEAF6', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${BRAND.forest}, #A78BFA)` }} />
      </div>
    </Card>
  );
}

// ---------- page ----------
export default function MyTimePage() {
  const { user } = useAuth();
  const isMobile = useIsMobile(768);
  const isNarrow = useIsMobile(1024);
  const providerName = user?.providerName || null;
  const isProvider = !!providerName;

  const [weekStart, setWeekStart] = useState(() => mondayOf(todayStr()));
  const [data, setData] = useState(null);
  const [week, setWeek] = useState({ ooo: [], appointments: [], closed: [] });
  const [formToken, setFormToken] = useState(0);
  // Sessions and schedule blocks open the same popup as the daily schedule.
  const [scheduleModal, setScheduleModal] = useState(null); // { kind: 'appointment' | 'ooo', row, date }
  const [providers, setProviders] = useState([]);
  const [weekVersion, setWeekVersion] = useState(0);
  const navigate = useNavigate();
  const requestsRef = useRef(null);

  // Everything that doesn't depend on the week shown.
  const fetchBase = useCallback(async () => {
    const settled = await Promise.allSettled([
      api.getMyTimeOffBalances(), api.getMyTimeOffRequests(), api.getMyMeetings(),
      api.getMyProfile(), api.getOfficeHours(), api.getOfficeClosures(), api.getTimeOffPolicy(),
      providerName ? api.getProviderUsualSchedule(providerName) : Promise.resolve([]),
      providerName ? api.getScheduleChanges(providerName) : Promise.resolve([]),
    ]);
    const v = (i, fallback) => (settled[i].status === 'fulfilled' && settled[i].value) || fallback;
    return {
      balances: Object.fromEntries(v(0, []).map(b => [b.balance_type, Number(b.balance_hours)])),
      requests: v(1, []), meetings: v(2, []), profile: v(3, null),
      officeHours: v(4, []), closures: v(5, []), policy: v(6, null), standing: v(7, []), changes: v(8, []),
    };
  }, [providerName]);
  useEffect(() => {
    if (!providerName) return undefined;
    let alive = true;
    api.getProviders().then(p => { if (alive) setProviders(p || []); }).catch(() => {});
    return () => { alive = false; };
  }, [providerName]);

  useEffect(() => {
    let alive = true;
    fetchBase().then(d => { if (alive) setData(d); });
    return () => { alive = false; };
  }, [fetchBase]);
  const [historyKey, setHistoryKey] = useState(0);
  const loadBase = () => fetchBase().then(d => { setData(d); setHistoryKey(k => k + 1); });

  const weekEnd = addDays(weekStart, 6);
  useEffect(() => {
    let alive = true;
    (async () => {
      const settled = await Promise.allSettled([
        providerName ? api.getOOORange(providerName, weekStart, weekEnd) : Promise.resolve([]),
        providerName ? api.getAppointmentsRange(providerName, weekStart, weekEnd) : Promise.resolve([]),
        api.getClosedDates(weekStart, weekEnd),
      ]);
      if (!alive) return;
      const v = (i) => (settled[i].status === 'fulfilled' && settled[i].value) || [];
      setWeek({ ooo: v(0), appointments: v(1), closed: v(2) });
    })();
    return () => { alive = false; };
  }, [providerName, weekStart, weekEnd, data, weekVersion]);

  // "Change this" in an event's details: the request list below opens its
  // change form from the address (?edit=<id>&date=<day>).
  const changeRequest = (req, date) => {
    navigate(`/time?edit=${encodeURIComponent(req.id)}${req.is_recurring ? `&date=${date}` : ''}`, { replace: true });
    requestAnimationFrame(() => requestsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const openBlock = (b) => {
    if (b.appointment) setScheduleModal({ kind: 'appointment', row: b.appointment, date: b.date });
    else if (b.ooo) setScheduleModal({ kind: 'ooo', row: b.ooo, date: b.date });
    else if (b.request) {
      // Not on the schedule (a pending request, or someone who isn't a
      // provider): the same popup, built from the request itself.
      const r = b.request;
      setScheduleModal({
        kind: 'ooo', requestOnly: true, date: b.date,
        row: {
          id: null, is_virtual: false, provider: fullName, ooo_date: b.date,
          start_time: b.start, end_time: b.end, type: r.request_type, time_off_request_id: r.id,
        },
      });
    }
  };
  const refreshWeek = () => setWeekVersion(v => v + 1);
  const closeScheduleModal = () => setScheduleModal(null);

  const openNewRequest = () => {
    setFormToken(t => t + 1);
    requestAnimationFrame(() => requestsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const derived = useMemo(() => {
    if (!data) return null;
    const today = todayStr();
    const pendingByType = {};
    data.requests.filter(r => r.status === 'pending').forEach(r => { pendingByType[r.request_type] = (pendingByType[r.request_type] || 0) + requestHours(r); });

    const upcomingApproved = data.requests
      .filter(r => r.status === 'approved' && r.is_balance_type && (lastDayOf(r) || '9999') >= today)
      .sort((a, b) => firstDayOf(a).localeCompare(firstDayOf(b)));
    const next = upcomingApproved[0] || null;

    // Coming up: time off (approved + pending), one-off meetings, closures.
    const items = [];
    data.requests.forEach(r => {
      if (r.is_recurring || r.status === 'denied') return;
      const first = firstDayOf(r);
      if (!first || (lastDayOf(r) || first) < today) return;
      const s = typeStyle(r.request_type);
      items.push({
        date: first < today ? today : first, title: r.request_type, accent: s.text, accentBg: s.bg,
        detail: r.is_balance_type
          ? `${r.start_date === r.end_date ? longDate(r.start_date) : `${shortDate(r.start_date)} – ${shortDate(r.end_date)}`} · ${hoursLabel(requestHours(r))}`
          : `${longDate(r.ooo_date)} · ${timeRange(r.start_time, r.end_time)}`,
        badge: r.status === 'pending' ? <Pill bg="#FEF0C7" color="#93370D">Pending</Pill> : null,
      });
    });
    data.meetings.forEach(m => {
      if (m.is_recurring || m.username === user?.username || !m.ooo_date || m.ooo_date < today) return;
      const s = typeStyle('Meeting');
      items.push({ date: m.ooo_date, title: 'Meeting', accent: s.text, accentBg: s.bg, detail: `${longDate(m.ooo_date)} · ${timeRange(m.start_time, m.end_time)}${m.notes ? ` · ${m.notes}` : ''}` });
    });
    data.closures.forEach(c => {
      if (c.closure_date < today || c.closure_date > addDays(today, 120)) return;
      items.push({ date: c.closure_date, title: 'Office closed', accent: '#4B4659', accentBg: '#F1F0F4', detail: c.reason || longDate(c.closure_date) });
    });
    items.sort((a, b) => a.date.localeCompare(b.date));

    return { pendingByType, next, comingUp: items.slice(0, 7) };
  }, [data, user]);

  const days = useMemo(() => {
    if (!data) return [];
    const closedByDate = Object.fromEntries(week.closed.map(c => [c.date, c.reason]));
    const closureDates = new Set(data.closures.map(c => c.closure_date));
    const list = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(weekStart, i);
      const wd = toDate(date).getDay();
      const contract = isProvider ? hoursOn(date, data.standing, data.changes) : null;
      let blocks = [];
      if (isProvider) {
        const allRequests = [...data.requests, ...data.meetings];
        blocks = week.ooo.filter(o => o.ooo_date === date).map(o => ({
          type: o.type, start: o.start_time, end: o.end_time, title: o.type, date, ooo: o,
          request: o.time_off_request_id ? allRequests.find(r => String(r.id) === String(o.time_off_request_id)) || null : null,
        }));
        blocks.push(...week.appointments.filter(a => a.appointment_date === date).map(a => {
          const start = a.appointment_time;
          const endMins = mins(start) + (Number(a.duration) || 30);
          return { type: 'Appointment', start, end: `${Math.floor(endMins / 60)}:${String(endMins % 60).padStart(2, '0')}`, title: a.patient_name || 'Session', canceled: a.appointment_status === 'Canceled', date, appointment: a };
        }));
        // Pending requests aren't on the schedule yet -- show them dashed.
        data.requests.filter(r => r.status === 'pending').forEach(r => blocks.push(...requestBlocksOn(r, date)));
      } else {
        data.requests.filter(r => r.status === 'approved' || r.status === 'pending').forEach(r => blocks.push(...requestBlocksOn(r, date)));
        data.meetings.filter(m => m.username !== user?.username && m.status === 'approved').forEach(m => blocks.push(...requestBlocksOn(m, date)));
      }
      // Only a specific closure date gets the hatched "closed" treatment --
      // a normally-closed weekday (weekends) is just left off the grid.
      const closed = closureDates.has(date) ? (closedByDate[date] || 'Office closed') : null;
      const weekendEmpty = (wd === 0 || wd === 6) && !contract && blocks.length === 0;
      const booked = blocks.filter(b => b.type === 'Appointment' && !b.canceled).length;
      list.push({ date, contract, blocks, closed, hide: weekendEmpty, bookedLabel: isProvider && booked ? `${booked} session${booked === 1 ? '' : 's'}` : '' });
    }
    return list.filter(d => !d.hide);
  }, [data, week, weekStart, isProvider, user]);

  const contractedThisWeek = useMemo(
    () => days.reduce((s, d) => s + (d.contract && !d.closed ? (mins(d.contract.end_time) - mins(d.contract.start_time)) / 60 : 0), 0),
    [days],
  );

  const firstName = user?.preferredName || user?.firstName || user?.username || '';
  const fullName = [user?.preferredName || user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.username || '';
  const tenure = calculateTenure(data?.profile?.hire_date);

  return (
    <div style={{ background: PAGE_BG, fontFamily: FONT, minHeight: '100%' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? '18px 14px 40px' : '28px 28px 56px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'flex-end', justifyContent: 'space-between', gap: 14, flexDirection: isMobile ? 'column' : 'row', marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: BRAND.forest, letterSpacing: '0.04em', marginBottom: 4 }}>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}
            </div>
            <h1 style={{ fontFamily: BRAND_SERIF, fontSize: isMobile ? 26 : 32, fontWeight: 700, color: INK, margin: 0 }}>
              {greeting()}{firstName ? `, ${firstName}` : ''}
            </h1>
            <div style={{ fontSize: 13.5, color: MUTED, marginTop: 4 }}>
              Your time, balances and schedule in one place{tenure ? ` · with us for ${tenure}` : ''}.
            </div>
          </div>
          <button
            type="button"
            onClick={openNewRequest}
            style={{ padding: '11px 18px', borderRadius: 10, border: 'none', background: BRAND.forest, color: 'white', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', boxShadow: '0 6px 16px rgba(109,40,217,0.28)', width: isMobile ? '100%' : 'auto' }}
          >
            + New request
          </button>
        </div>

        {!data || !derived ? (
          <p style={{ fontSize: 14, color: MUTED }}>Loading your time…</p>
        ) : (
          <>
            {/* Balances, forecast, next up */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : isNarrow ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: 14, marginBottom: 18 }}>
              <BalanceCard type="PTO" hours={data.balances.PTO ?? 0} pendingHours={derived.pendingByType.PTO || 0} policy={data.policy} />
              <BalanceCard type="UPTO" hours={data.balances.UPTO ?? 0} pendingHours={derived.pendingByType.UPTO || 0} policy={data.policy} />
              <NextUpCard next={derived.next} onNew={openNewRequest} />
              <ForecastCard balances={data.balances} pendingByType={derived.pendingByType} policy={data.policy} />
            </div>

            {/* Week + side column */}
            <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) 320px', gap: 18, marginBottom: 18, alignItems: 'start' }}>
              <WeekView weekStart={weekStart} setWeekStart={setWeekStart} days={days} isMobile={isMobile} isProvider={isProvider} onOpen={openBlock} />
              <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
                <ComingUp items={derived.comingUp} />
                {!isProvider && <MyHoursCard isProvider={false} standing={[]} changes={[]} officeHours={data.officeHours} />}
              </div>
            </div>

            {/* Providers: contracted hours + this week */}
            {isProvider && (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))', gap: 18, marginBottom: 28 }}>
                <MyHoursCard isProvider standing={data.standing} changes={data.changes} officeHours={data.officeHours} />
                <ThisWeekCard appointments={week.appointments} contractedHours={contractedThisWeek} />
              </div>
            )}
          </>
        )}

        {scheduleModal?.kind === 'appointment' && (
          <AppointmentModal
            providers={providers}
            existing={scheduleModal.row}
            defaultDate={toDate(scheduleModal.date)}
            onClose={closeScheduleModal}
            onSaved={() => { closeScheduleModal(); refreshWeek(); }}
            onCommentsSynced={refreshWeek}
          />
        )}
        {scheduleModal?.kind === 'ooo' && (
          <OOOModal
            existing={scheduleModal.row}
            requestOnly={!!scheduleModal.requestOnly}
            onEdit={(req, weekDate) => { closeScheduleModal(); changeRequest(req, weekDate || scheduleModal.date); }}
            onClose={closeScheduleModal}
            onSaved={() => { closeScheduleModal(); refreshWeek(); loadBase(); }}
            onCommentsSynced={refreshWeek}
          />
        )}
        {data && (
          <Card title="Balance history" style={{ marginBottom: 28 }}>
            <p style={{ fontSize: 12.5, color: MUTED, margin: '-4px 0 12px' }}>
              PTO is earned every Sunday for the hours you worked Monday-Friday -- open a week to see how it was worked out.
            </p>
            <TimeOffHistory refreshKey={historyKey} />
          </Card>
        )}

        {/* Requests: the form, list and meetings */}
        <div ref={requestsRef} style={{ scrollMarginTop: 16 }}>
          <Card title="My requests">
            <TimeOffTab isMobile={isMobile} compact openFormToken={formToken} onChanged={loadBase} />
          </Card>
        </div>
      </div>
    </div>
  );
}
