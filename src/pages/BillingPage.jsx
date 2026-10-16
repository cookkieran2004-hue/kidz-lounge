import { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { useIsMobile } from '../useIsMobile';
import { canManage, canAdminister, canUseEiHub } from '../roles';
import { PageHeader, UnderlineTabs } from '../dashboardUi';
import EiHubPanel from '../EiHubPanel';
import BillingOverview from '../BillingOverview';
import BillingMandates from '../BillingMandates';
import BillingAttention from '../BillingAttention';
import { featureOn } from '../brand';
import { INK, MUTED, SUBTLE, HAIRLINE, PAGE_BG, FONT, NUMERIC, TONES, buttonStyle } from '../uiTokens';
import { useStickyHeight, STACK_TOP } from '../stickyLayout';
import { statusColor } from './SchedulePage';

// Billing: one provider's month, laid out like the paper billing invoice
// (kidz-lounge-api routes/billing.js). Same access as the Weekly view:
// staff see their own provider; reception, admin and developer pick any.
// Each day shows the key letter once the day has ended:
//   X session provided, A child absent, PA provider absent, H holiday,
//   Z emergency closure, M make-up. A dot = booked, day not over yet.
// Rows: the provider's caseload that month (kidz-lounge-api lib/caseload.js).

const GROUPS = [
  { key: 'EI', label: 'EI', footer: 'EI Center' },
  { key: 'DOE', label: 'DOE (CPSE / CSE)', footer: 'DOE' },
  // Insurance, P, PP and no program (Oct 2026: one section).
  { key: 'Other', label: 'Other', footer: 'Other' },
];
const MARK_STYLE = {
  X: { bg: '#52525B', fg: 'white', title: 'Session provided' },
  // Same as the schedule: A = the Canceled status color, M = the make-up
  // green (MU), E = the eval blue (Eval tag) -- SchedulePage.jsx.
  A: { bg: statusColor('Canceled'), fg: 'white', title: 'Child absent' },
  PA: { bg: '#D97706', fg: 'white', title: 'Provider absent' },
  H: { bg: 'var(--brand-primary-bright)', fg: 'white', title: 'Holiday' },
  Z: { bg: '#0F766E', fg: 'white', title: 'Emergency closure' },
  M: { bg: '#15803D', fg: 'white', title: 'Make-up' },
  E: { bg: '#1D4ED8', fg: 'white', title: 'Eval' },
};
// US Letter landscape (11in) less 0.3in margins each side, in CSS px.
const PRINTABLE_WIDTH_PX = 10.4 * 96;
const PRINT_CSS = `
@media print {
  @page { size: letter landscape; margin: 0.3in; }
  html, body { background: white !important; }
  body * { visibility: hidden !important; }
  .kl-billing-print, .kl-billing-print * { visibility: visible !important; }
  .kl-billing-print {
    position: absolute !important; left: 0; top: 0;
    width: var(--kl-print-width, auto) !important;
    zoom: var(--kl-print-zoom, 1);
    border-radius: 0 !important;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .kl-billing-print > div { overflow: visible !important; }
  .kl-billing-print th, .kl-billing-print .kl-billing-head { position: static !important; }
  .kl-print-only { display: block !important; }
}`;
// A session's setting from its room, as the API's settingOf
// (routes/billing.js): an office room = C; offsite = its Center / School /
// Home (C / S / H); an older offsite session with none, or no room = ''.
const settingOf = (room) => {
  const a = String(room || '').trim();
  if (!a) return '';
  const m = a.match(/^Offsite(?: \((Center|School|Home)\))?(?::|$)/i);
  if (!m) return 'C';
  return m[1] ? m[1][0].toUpperCase() : '';
};
// Marks that count as a session provided (the sheet's Total).
const COUNTED = ['X', 'M', 'E'];

const pad = (n) => String(n).padStart(2, '0');
const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const monthLabel = (key) => new Date(`${key}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const shiftMonth = (key, n) => { const d = new Date(`${key}-01T00:00:00`); d.setMonth(d.getMonth() + n); return monthKey(d); };
const shortDate = (s) => new Date(`${s}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const fmtTime = (t) => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`; };

function Mark({ entry }) {
  if (!entry.mark) {
    const f = entry.flags || [];
    return <span title={`Booked ${fmtTime(entry.time)} · ${entry.status}${f.length ? `\n${f.join('\n')}` : ''}`} style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 3, background: f.length ? TONES.danger.fg : SUBTLE, ...(f.length ? { outline: `2px solid ${TONES.danger.fg}`, outlineOffset: 1 } : {}) }} />;
  }
  const s = MARK_STYLE[entry.mark] || MARK_STYLE.X;
  // A problem the mandates check found (make-up past its 14 days or on a
  // regular session's day, more than the mandate): a red ring, explained on hover.
  const flags = entry.flags || [];
  return (
    <span title={`${s.title} · ${fmtTime(entry.time)} · ${entry.status}${flags.length ? `\n${flags.join('\n')}` : ''}`}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 18, height: 18, padding: entry.mark.length > 1 ? '0 3px' : 0, boxSizing: 'border-box', borderRadius: 9, background: s.bg, color: s.fg, fontSize: 10, fontWeight: 700, lineHeight: 1, ...(flags.length ? { outline: `2px solid ${TONES.danger.fg}`, outlineOffset: 1 } : {}) }}>
      {entry.mark}
      {/* Outside hours session (Oct 2026): counted the same, marked with a corner dot. */}
    </span>
  );
}

// With the "mandates" feature (PedsDesk) Billing is three pages, one per
// job (Kieran, Oct 2026: one page was combining too much): Payroll
// (/billing: Overview, Billing sheets), Mandates (/mandates: Mandates, Needs
// attention) and EI-Hub claims (/ei-hub). Without it (Kidz Lounge) /billing
// is the one page it always was, and `section` is ignored.
const SECTIONS = {
  payroll: { title: 'Payroll', views: [['overview', 'Overview'], ['sheet', 'Billing sheets']] },
  mandates: { title: 'Mandates', views: [['mandates', 'Mandates'], ['attention', 'Needs attention']] },
  eihub: { title: 'EI-Hub claims', views: [['eihub', 'EI-Hub Entry']] },
};

export default function BillingPage({ section = 'payroll' }) {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const manager = canManage(user);
  const lockedProvider = !manager ? user?.providerName : null;
  const [providers, setProviders] = useState([]);
  const [provider, setProvider] = useState(lockedProvider || '');
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [sheet, setSheet] = useState(null);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);
  const [savingReview, setSavingReview] = useState(false);
  // Admins and Developers also get the EI-Hub Entry tab (EiHubPanel.jsx;
  // src/roles.js canUseEiHub). Reception gets it with just Import (EI-Hub's
  // Child Info and Authorizations report; Kieran, Oct 2026).
  const eiHubFull = canUseEiHub(user);
  const eiHubAllowed = eiHubFull || canManage(user);
  // The "mandates" feature (src/brand.js; PedsDesk first, Oct 2026): opens
  // on the month overview, with Mandates and Needs attention tabs, the
  // payroll totals above the sheet and problem sessions flagged on it.
  const mandatesOn = featureOn('mandates');
  const split = mandatesOn ? SECTIONS[section] || SECTIONS.payroll : null;
  const [view, setView] = useState(split ? split.views[0][0] : 'sheet');
  const eiHub = eiHubAllowed && view === 'eihub';
  const onSheet = view === 'sheet';
  const headerRef = useRef(null);
  const sheetRef = useRef(null);
  // The column header (Name, Mandate, ... day numbers) is its own strip
  // that sticks under the page header. A sideways-scrolling table can't have
  // a sticky header, so the strip is a separate table with the same column
  // widths, kept level with the rows' sideways scroll.
  const headScrollRef = useRef(null);
  const syncHeader = (e) => { if (headScrollRef.current) headScrollRef.current.scrollLeft = e.currentTarget.scrollLeft; };
  useStickyHeight(headerRef, '--kl-page-header-h');
  const active = manager ? provider : lockedProvider;

  useEffect(() => {
    if (!manager) return;
    api.getProviders().then(list => {
      setProviders(list || []);
      setProvider(p => p || list?.[0]?.Name || '');
    }).catch(() => setProviders([]));
  }, [manager]);

  useEffect(() => {
    if (!active || !onSheet) return undefined;
    let alive = true;
    api.getBillingSheet(active, month)
      .then(s => { if (alive) { setSheet(s); setError(null); } })
      .catch(err => { if (alive) { setSheet(null); setError(err.message); } });
    return () => { alive = false; };
  }, [active, month, version, onSheet]);

  const grouped = useMemo(() => {
    if (!sheet) return [];
    return GROUPS.map(g => {
      const rows = sheet.rows.filter(r => r.group === g.key);
      return { ...g, rows, scheduled: rows.reduce((t, r) => t + r.scheduled, 0), total: rows.reduce((t, r) => t + r.total_sessions, 0) };
    }).filter(g => g.rows.length);
  }, [sheet]);

  // The totals under the key (Kieran, Oct 2026; Oct 15: EI Center and EI
  // School separate again), in 30-minute units: a 30-minute session is 1,
  // 45 minutes 1.5, 60 minutes 2 (minutes / 30). Only sessions provided
  // (X, M, E) count:
  //   EI Center  EI sessions at a center (a room, or offsite at a center)
  //   EI School  EI sessions at a school
  //   EI Home    EI sessions at home
  //   DOE 30     every DOE session as 30-minute units (45 = 1.5, 60 = 2)
  //   Insurance  every row with a billing code (C-1 ... C-#), or still
  //              missing one (the red #)
  // Not counted lists sessions that need fixing to be counted: EI with no
  // setting, and DOE that isn't 30, 45 or 60 minutes.
  const totals = useMemo(() => {
    // With mandates on, the API works the totals out (kidz-lounge-api
    // lib/billingTotals.js, the same figures as the overview and export).
    const t = sheet?.totals;
    if (mandatesOn && t) {
      return {
        eiCenter: t.ei_center, eiSchool: t.ei_school, eiHome: t.ei_home, doe: t.doe, insurance: t.insurance,
        missed: t.missed.map(m => ({ name: m.patient_name, day: m.day, time: m.time, reason: m.reason })),
      };
    }
    const out = { eiCenter: 0, eiSchool: 0, eiHome: 0, doe: 0, insurance: 0, missed: [] };
    const miss = (r, day, e, reason) => out.missed.push({ name: r.patient_name, day: Number(day), time: e.time, reason });
    for (const r of sheet?.rows || []) {
      const pay = r.pay_group || r.group;
      const coded = r.needs_code || /^C-/.test(String(r.program || ''));
      for (const [day, entries] of Object.entries(r.days || {})) {
        for (const e of entries) {
          if (!COUNTED.includes(e.mark)) continue;
          const minutes = Number(e.duration) || 30;
          const units = minutes / 30;
          if (pay === 'EI') {
            const setting = settingOf(e.room);
            if (setting === 'H') out.eiHome += units;
            else if (setting === 'S') out.eiSchool += units;
            else if (setting === 'C') out.eiCenter += units;
            else miss(r, day, e, 'EI, no setting (Center / School / Home)');
          } else if (pay === 'DOE') {
            if (minutes === 30 || minutes === 45 || minutes === 60) out.doe += units;
            else miss(r, day, e, `DOE, ${minutes} min (only 30, 45 and 60 count)`);
          } else if (coded) out.insurance += units;
        }
      }
    }
    out.missed.sort((a, b) => (a.day - b.day) || String(a.time).localeCompare(String(b.time)));
    return out;
  }, [sheet, mandatesOn]);

  // Print exactly what's on screen: the sheet alone, landscape, at its
  // on-screen width scaled down to fit the page (PRINT_CSS). Also applies
  // to Cmd/Ctrl+P.
  useEffect(() => {
    const before = () => {
      const el = sheetRef.current;
      if (!el) return;
      // The whole table, even the part scrolled out of view on a narrow screen.
      const table = el.querySelector('table');
      const width = Math.max(el.getBoundingClientRect().width, table ? table.scrollWidth + 2 : 0);
      el.style.setProperty('--kl-print-width', `${width}px`);
      el.style.setProperty('--kl-print-zoom', String(Math.min(1, PRINTABLE_WIDTH_PX / width)));
    };
    window.addEventListener('beforeprint', before);
    return () => window.removeEventListener('beforeprint', before);
  }, []);

  const toggleReviewed = async () => {
    setSavingReview(true);
    try {
      await api.setBillingReviewed(active, month, !sheet.reviewed);
      setVersion(v => v + 1);
    } catch (err) {
      setError(err.message);
    }
    setSavingReview(false);
  };

  if (!manager && !lockedProvider) {
    return (
      <div style={{ padding: 28, fontFamily: FONT }}>
        <p style={{ fontSize: 14, color: MUTED }}>Billing needs a provider linked to your account. Ask an admin.</p>
      </div>
    );
  }

  const days = sheet ? Array.from({ length: sheet.days_in_month }, (_, i) => i + 1) : [];
  const dateOf = (d) => `${month}-${pad(d)}`;
  const weekday = (d) => new Date(`${dateOf(d)}T00:00:00`).getDay();
  const NAME_W = isMobile ? 130 : 160;
  const cell = { borderBottom: `1px solid ${HAIRLINE}`, borderRight: `1px solid ${HAIRLINE}`, padding: '0 4px', height: 34, fontSize: 12.5, color: INK, boxSizing: 'border-box', whiteSpace: 'nowrap' };
  const head = { ...cell, height: 'auto', padding: '6px 4px', fontSize: 11.5, fontWeight: 600, color: MUTED, background: '#FAFAFA', overflow: 'hidden', textOverflow: 'ellipsis' };
  // Fixed column widths, shared by the header strip and the rows.
  const widths = [NAME_W, 72, 60, 62, ...days.map(() => 26), 58, 70];
  const tableWidth = widths.reduce((t, w) => t + w, 0);
  const colgroup = <colgroup>{widths.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>;
  const tableStyle = { borderCollapse: 'separate', borderSpacing: 0, width: '100%', minWidth: tableWidth, tableLayout: 'fixed', ...NUMERIC };
  const stickyName = { position: 'sticky', left: 0, zIndex: 1, background: 'white', minWidth: NAME_W, maxWidth: NAME_W, overflow: 'hidden', textOverflow: 'ellipsis' };
  const dayBg = (d) => (sheet?.closures?.[dateOf(d)] ? 'var(--brand-tint)' : (weekday(d) === 0 || weekday(d) === 6) ? '#F4F4F5' : dateOf(d) === sheet?.today ? '#FFFBEB' : undefined);
  // Sessions provided (X, M or E) on each day, across every patient.
  // Sessions provided each day by setting, every program and every child
  // (Kieran, Oct 2026): the Home and Center & School rows above Daily total.
  // Every session is in one of them, so together they make Daily total: Home
  // is a session set to Home; Center & School is everything else, including
  // a session with no room or an older offsite one with no setting.
  const perSetting = (atHome) => Object.fromEntries(days.map(d => [d, (sheet?.rows || []).reduce((t, r) => t + (r.days[d] || []).filter(e => COUNTED.includes(e.mark) && (settingOf(e.room) === 'H') === atHome).length, 0)]));
  const settingRows = [['Home', perSetting(true), 'Home sessions provided each day'], ['Center & School', perSetting(false), 'Every other session provided each day: center, school, or no setting']];
  const perDay = Object.fromEntries(days.map(d => [d, (sheet?.rows || []).reduce((t, r) => t + (r.days[d] || []).filter(e => e.mark === 'X' || e.mark === 'M' || e.mark === 'E').length, 0)]));
  const grand = grouped.reduce((t, g) => ({ scheduled: t.scheduled + g.scheduled, total: t.total + g.total }), { scheduled: 0, total: 0 });
  const colCount = 4 + days.length + 2;
  // The payroll totals, PTO / UPTO and Reviewed: under the key, or (with
  // mandates on) at the top of the sheet, where payroll looks first.
  const renderTotals = (atTop) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', padding: '12px 16px', [atTop ? 'borderBottom' : 'borderTop']: `1px solid ${HAIRLINE}`, background: '#FAFAFA', fontSize: 13, ...NUMERIC }}>
      {[
        ['EI Center', totals.eiCenter, 'EI sessions provided at a center, in 30-minute units (45 min = 1.5, 60 min = 2)'],
        ['EI School', totals.eiSchool, 'EI sessions provided at a school, in 30-minute units (45 min = 1.5, 60 min = 2)'],
        ['EI Home', totals.eiHome, 'EI sessions provided at home, in 30-minute units (45 min = 1.5, 60 min = 2)'],
        ['DOE 30', totals.doe, 'Every DOE session provided, in 30-minute units: 30 min = 1, 45 min = 1.5, 60 min = 2'],
        ['Insurance', totals.insurance, 'Sessions provided for every billing code (C-1 ... C-#), in 30-minute units'],
      ].map(([label, value, title]) => (
        <span key={label} title={title}
          style={{ border: `1px solid ${HAIRLINE}`, borderRadius: 6, padding: '5px 10px', background: 'white', color: MUTED }}>
          {label} <strong style={{ color: INK, marginLeft: 6 }}>{Math.round(value * 10) / 10}</strong>
        </span>
      ))}
      {/* Provided sessions that need fixing before they count; hover for the list. */}
      {(() => {
        const n = totals.missed.length;
        const monthName = new Date(`${month}-01T00:00:00`).toLocaleDateString('en-US', { month: 'short' });
        const list = totals.missed.map(m => `${m.name} \u00b7 ${monthName} ${m.day}${m.time ? `, ${fmtTime(m.time)}` : ''} \u00b7 ${m.reason}`).join('\n');
        return (
          <span title={n ? `Needs fixing on the appointment before it counts:\n${list}` : 'Nothing needs fixing.'}
            style={{ border: `1px solid ${n ? TONES.warning.fg : HAIRLINE}`, borderRadius: 6, padding: '5px 10px', background: n ? TONES.warning.bg : 'white', color: n ? TONES.warning.fg : MUTED, cursor: n ? 'help' : 'default' }}>
            Not counted <strong style={{ color: n ? TONES.warning.fg : INK, marginLeft: 6 }}>{n}</strong>
          </span>
        );
      })()}
      {/* The provider's approved PTO / UPTO for days in this month. */}
      {['PTO', 'UPTO'].map(t => {
        const reqs = (sheet.time_off?.requests || []).filter(x => x.type === t);
        return (
          <span key={t} style={{ border: `1px solid ${HAIRLINE}`, borderRadius: 6, padding: '5px 10px', background: 'white', color: MUTED }}
            title={reqs.length ? reqs.map(x => `${shortDate(x.start_date)}${x.end_date !== x.start_date ? ` – ${shortDate(x.end_date)}` : ''}: ${x.hours} h`).join('\n') : `No ${t} this month`}>
            {t} taken <strong style={{ color: INK, marginLeft: 6 }}>{sheet.time_off?.[t] ?? 0} h</strong>
          </span>
        );
      })}
      <label style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, color: INK, fontWeight: 600, cursor: canAdminister(user) ? 'pointer' : 'default' }}
        title={canAdminister(user) ? undefined : 'Only an Admin or Developer can mark a sheet reviewed.'}>
        <input type="checkbox" checked={!!sheet.reviewed} disabled={!canAdminister(user) || savingReview} onChange={toggleReviewed} />
        Reviewed
        {sheet.reviewed && <span style={{ fontWeight: 400, color: MUTED }}>by {sheet.reviewed.reviewed_by} on {new Date(sheet.reviewed.reviewed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
      </label>
    </div>
  );

  return (
    <div style={{ background: PAGE_BG, minHeight: '100%', fontFamily: FONT }}>
      <div style={{ padding: isMobile ? 16 : '24px 28px 40px', maxWidth: 1600, margin: '0 auto' }}>
        {/* Title, month, provider and billing dates stay under the nav bar
            while the sheet scrolls (src/stickyLayout.js). */}
        <div ref={headerRef} style={{
          position: 'sticky', top: 'var(--kl-nav-h, 0px)', zIndex: 30, background: PAGE_BG,
          margin: isMobile ? '-16px -16px 0' : '-24px -28px 0', padding: isMobile ? '16px 16px 12px' : '24px 28px 12px',
        }}>
          <PageHeader
            title={split ? split.title : 'Billing'}
            isMobile={isMobile}
            actions={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {manager && onSheet && (
                  <select value={provider} onChange={e => setProvider(e.target.value)} aria-label="Provider"
                    style={{ padding: '7px 10px', borderRadius: 6, border: `1px solid ${HAIRLINE}`, fontSize: 13, fontFamily: 'inherit', background: 'white' }}>
                    {providers.map(p => <option key={p.Name} value={p.Name}>{p.Name}</option>)}
                  </select>
                )}
                <button type="button" aria-label="Previous month" onClick={() => setMonth(m => shiftMonth(m, -1))} style={buttonStyle('secondary', { padding: '6px 10px' })}>‹</button>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: INK, minWidth: 130, textAlign: 'center' }}>{monthLabel(month)}</span>
                <button type="button" aria-label="Next month" onClick={() => setMonth(m => shiftMonth(m, 1))} style={buttonStyle('secondary', { padding: '6px 10px' })}>›</button>
                {month !== monthKey(new Date()) && <button type="button" onClick={() => setMonth(monthKey(new Date()))} style={buttonStyle('secondary')}>This month</button>}
                {onSheet && <button type="button" onClick={() => window.print()} style={buttonStyle('secondary')}>Print</button>}
              </div>
            }
          />
          {split && split.views.length > 1 && (
            <UnderlineTabs label={`${split.title} views`} active={view} onPick={setView} style={{ marginBottom: 12 }}
              tabs={split.views.map(([key, label]) => ({ key, label }))} />
          )}
          {!split && eiHubAllowed && (
            <UnderlineTabs label="Billing views" active={view} onPick={setView} style={{ marginBottom: 12 }}
              tabs={[
                { key: 'sheet', label: 'Billing sheets' },
                { key: 'eihub', label: 'EI-Hub Entry' },
              ]} />
          )}
          {sheet && onSheet && (
            <div style={{ background: 'white', border: `1px solid ${HAIRLINE}`, borderRadius: 12 }}>
              <SheetInfo sheet={sheet} isMobile={isMobile} />
            </div>
          )}
        </div>

        {eiHub && <EiHubPanel month={month} full={eiHubFull} />}
        {view === 'overview' && mandatesOn && (
          <BillingOverview month={month} manager={manager} isMobile={isMobile}
            onOpenProvider={(name) => { if (manager) setProvider(name); setView('sheet'); }} />
        )}
        {view === 'mandates' && mandatesOn && <BillingMandates month={month} manager={manager} />}
        {view === 'attention' && mandatesOn && <BillingAttention month={month} />}
        {onSheet && error && <p role="alert" style={{ fontSize: 13, color: TONES.danger.fg }}>{error}</p>}
        {onSheet && !sheet && !error && <p style={{ fontSize: 13, color: MUTED }}>Loading billing...</p>}

        <style>{PRINT_CSS}</style>
        {sheet && onSheet && (
          <div ref={sheetRef} className="kl-billing-print" style={{ background: 'white', border: `1px solid ${HAIRLINE}`, borderRadius: 12, overflow: 'clip' }}>
            <div className="kl-print-only" style={{ display: 'none', padding: '12px 16px 0', fontSize: 16, fontWeight: 600, color: INK }}>Billing Invoice · {monthLabel(month)}</div>
            {/* On screen this line is in the sticky header above; printed here. */}
            <div className="kl-print-only" style={{ display: 'none' }}>
              <SheetInfo sheet={sheet} isMobile={isMobile} />
            </div>
            {mandatesOn && renderTotals(true)}

            <div ref={headScrollRef} className="kl-billing-head" style={{ position: 'sticky', top: STACK_TOP, zIndex: 5, overflow: 'hidden', background: '#FAFAFA' }}>
              <table style={tableStyle}>
                {colgroup}
                <thead>
                  <tr>
                    <th style={{ ...head, ...stickyName, background: '#FAFAFA', zIndex: 3, textAlign: 'left', padding: '6px 10px' }}>Name</th>
                    <th style={{ ...head, textAlign: 'left' }}>Mandate</th>
                    <th style={{ ...head, textAlign: 'left' }}>Program</th>
                    <th style={head} title="C center (a room, or offsite at a center), S school, H home">Setting</th>
                    {days.map(d => (
                      <th key={d} style={{ ...head, minWidth: 24, textAlign: 'center', padding: '6px 2px', background: dayBg(d) || head.background }}
                        title={sheet.closures[dateOf(d)] ? `Office closed${sheet.closures[dateOf(d)].reason ? `: ${sheet.closures[dateOf(d)].reason}` : ''}` : undefined}>
                        {d}
                      </th>
                    ))}
                    <th style={{ ...head, textAlign: 'right' }} title="Sessions booked this month">Sched.</th>
                    <th style={{ ...head, textAlign: 'right', borderRight: 'none' }}>Sessions</th>
                  </tr>
                </thead>
              </table>
            </div>
            <div onScroll={syncHeader} style={{ overflowX: 'auto' }}>
              <table style={tableStyle}>
                {colgroup}
                <tbody>
                  {grouped.length === 0 && (
                    <tr><td colSpan={colCount} style={{ ...cell, height: 60, textAlign: 'center', color: MUTED, borderRight: 'none' }}>No sessions this month.</td></tr>
                  )}
                  {grouped.map(g => (
                    <GroupRows key={g.key} group={g} days={days} cell={cell} stickyName={stickyName} dayBg={dayBg} />
                  ))}
                  {grouped.length > 0 && settingRows.map(([label, counts, title], i) => {
                    const top = i === 0 ? { borderTop: `2px solid ${INK}` } : {};
                    const sum = days.reduce((t, d) => t + counts[d], 0);
                    return (
                      <tr key={label}>
                        <td colSpan={4} style={{ ...cell, ...stickyName, ...top, maxWidth: 'none', fontWeight: 600, padding: '0 10px', background: '#FAFAFA' }} title={title}>{label}</td>
                        {days.map(d => (
                          <td key={d} style={{ ...cell, ...top, textAlign: 'center', padding: '0 2px', fontWeight: 600, background: '#FAFAFA', color: counts[d] ? INK : SUBTLE }}>
                            {counts[d] || ''}
                          </td>
                        ))}
                        <td style={{ ...cell, ...top, background: '#FAFAFA' }} />
                        <td style={{ ...cell, ...top, textAlign: 'right', fontWeight: 600, background: '#FAFAFA', borderRight: 'none' }}>{sum}</td>
                      </tr>
                    );
                  })}
                  {grouped.length > 0 && (
                    <tr>
                      <td colSpan={4} style={{ ...cell, ...stickyName, maxWidth: 'none', fontWeight: 700, padding: '0 10px', background: '#F4F4F5' }}
                        title="Sessions provided (X, M or E) each day">Daily total</td>
                      {days.map(d => (
                        <td key={d} style={{ ...cell, textAlign: 'center', padding: '0 2px', fontWeight: 700, background: '#F4F4F5', color: perDay[d] ? INK : SUBTLE }}>
                          {perDay[d] || ''}
                        </td>
                      ))}
                      <td style={{ ...cell, textAlign: 'right', fontWeight: 700, background: '#F4F4F5' }}>{grand.scheduled}</td>
                      <td style={{ ...cell, textAlign: 'right', fontWeight: 700, background: '#F4F4F5', borderRight: 'none' }}>{grand.total}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', alignItems: 'center', padding: '12px 16px', borderTop: `1px solid ${HAIRLINE}`, fontSize: 12.5, color: MUTED }}>
              <span style={{ fontWeight: 600, color: INK }}>Key</span>
              {Object.entries(MARK_STYLE).map(([k, s]) => (
                <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Mark entry={{ mark: k, time: '00:00', status: '' }} /> {s.title}</span>
              ))}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Mark entry={{ mark: null, time: '00:00', status: '' }} /> Booked, day not over</span>
              <span>Setting: C center, S school, H home</span>
              {mandatesOn && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Mark entry={{ mark: 'M', time: '00:00', status: '', flags: ['Example'] }} /> Needs checking (hover it)</span>}
            </div>

            {!mandatesOn && renderTotals(false)}
          </div>
        )}
      </div>
    </div>
  );
}

function SheetInfo({ sheet, isMobile }) {
  const strong = { color: INK, fontWeight: 600 };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))', gap: '6px 20px', padding: '12px 16px', fontSize: 13, color: MUTED }}>
      <span>Provider: <strong style={strong}>{sheet.provider}</strong></span>
      <span>Discipline: <strong style={strong}>{sheet.discipline || '—'}</strong></span>
      <span>Phone: <strong style={strong}>{sheet.phone || '—'}</strong></span>
      <span>Billing dates: <strong style={strong}>{shortDate(sheet.start)} – {shortDate(sheet.end)}</strong></span>
    </div>
  );
}

function GroupRows({ group, days, cell, stickyName, dayBg }) {
  return (
    <>
      <tr>
        <td colSpan={4} style={{ ...cell, ...stickyName, maxWidth: 'none', background: '#F4F4F5', fontWeight: 600, fontSize: 12, color: MUTED, padding: '0 10px', height: 28 }}>{group.label}</td>
        <td colSpan={days.length + 2} style={{ ...cell, background: '#F4F4F5', height: 28, borderRight: 'none' }} />
      </tr>
      {group.rows.map(r => (
        <tr key={`${r.patient_name}|${r.program || ''}|${r.mandate || ''}|${r.setting || ''}`}>
          <td style={{ ...cell, ...stickyName, padding: '0 10px', fontWeight: 500 }} title={r.patient_name}>{r.patient_name}</td>
          <td style={cell}>{r.mandate || ''}</td>
          {/* Program: EI, CPSE, CSE, NONE or a billing code (C-1 ... C-#). An
              insurance / P / PP program with no code yet shows just a red #. */}
          <td style={{ ...cell, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {r.needs_code ? <span style={{ color: '#DC2626', fontWeight: 700 }}>#</span> : (r.program || '')}
          </td>
          <td style={{ ...cell, textAlign: 'center', fontWeight: 600 }}>{r.setting}</td>
          {days.map(d => (
            <td key={d} style={{ ...cell, textAlign: 'center', padding: '0 2px', background: dayBg(d) }}>
              {(r.days[d] || []).length > 0 && (
                <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
                  {r.days[d].map(e => <Mark key={e.id} entry={e} />)}
                </span>
              )}
            </td>
          ))}
          <td style={{ ...cell, textAlign: 'right' }}>{r.scheduled}</td>
          <td style={{ ...cell, textAlign: 'right', fontWeight: 600, borderRight: 'none' }}>{r.total_sessions}</td>
        </tr>
      ))}
      <tr>
        <td colSpan={4} style={{ ...cell, ...stickyName, maxWidth: 'none', fontWeight: 600, padding: '0 10px', background: '#FAFAFA' }}>Total</td>
        <td colSpan={days.length} style={{ ...cell, background: '#FAFAFA' }} />
        <td style={{ ...cell, textAlign: 'right', fontWeight: 600, background: '#FAFAFA' }}>{group.scheduled}</td>
        <td style={{ ...cell, textAlign: 'right', fontWeight: 600, background: '#FAFAFA', borderRight: 'none' }}>{group.total}</td>
      </tr>
    </>
  );
}
