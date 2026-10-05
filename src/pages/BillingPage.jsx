import { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { useIsMobile } from '../useIsMobile';
import { canManage, canAdminister } from '../roles';
import { PageHeader } from '../dashboardUi';
import { INK, MUTED, SUBTLE, HAIRLINE, PAGE_BG, FONT, NUMERIC, TONES, buttonStyle } from '../uiTokens';
import { useStickyHeight } from '../stickyLayout';

// Billing: one provider's month, laid out like the paper billing invoice
// (kidz-lounge-api routes/billing.js). Same access as the Weekly view:
// staff see their own provider; reception, admin and developer pick any.
// Each day shows the key letter once the day has ended:
//   X session provided, A child absent, PA provider absent, H holiday,
//   Z emergency closure, M make-up. A dot = booked, day not over yet.
// Patients seen on a day that has ended stay on the sheet for the month.

const GROUPS = [
  { key: 'EI', label: 'EI', footer: 'EI Center' },
  { key: 'DOE', label: 'DOE (CPSE / CSE)', footer: 'DOE' },
  { key: 'Insurance', label: 'Insurance', footer: 'Insurance' },
  { key: 'Other', label: 'Other', footer: 'Other' },
];
const MARK_STYLE = {
  X: { bg: '#52525B', fg: 'white', title: 'Session provided' },
  A: { bg: '#DC2626', fg: 'white', title: 'Child absent' },
  PA: { bg: '#D97706', fg: 'white', title: 'Provider absent' },
  H: { bg: '#7C3AED', fg: 'white', title: 'Holiday' },
  Z: { bg: '#0F766E', fg: 'white', title: 'Emergency closure' },
  M: { bg: '#2563EB', fg: 'white', title: 'Make-up' },
};
const pad = (n) => String(n).padStart(2, '0');
const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const monthLabel = (key) => new Date(`${key}-01T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const shiftMonth = (key, n) => { const d = new Date(`${key}-01T00:00:00`); d.setMonth(d.getMonth() + n); return monthKey(d); };
const shortDate = (s) => new Date(`${s}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const fmtTime = (t) => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`; };

function Mark({ entry }) {
  if (!entry.mark) {
    return <span title={`Booked ${fmtTime(entry.time)} · ${entry.status}`} style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 3, background: SUBTLE }} />;
  }
  const s = MARK_STYLE[entry.mark] || MARK_STYLE.X;
  return (
    <span title={`${s.title} · ${fmtTime(entry.time)} · ${entry.status}`}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 18, height: 18, padding: entry.mark.length > 1 ? '0 3px' : 0, boxSizing: 'border-box', borderRadius: 9, background: s.bg, color: s.fg, fontSize: 10, fontWeight: 700, lineHeight: 1 }}>
      {entry.mark}
    </span>
  );
}

export default function BillingPage() {
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
  const headerRef = useRef(null);
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
    if (!active) return undefined;
    let alive = true;
    api.getBillingSheet(active, month)
      .then(s => { if (alive) { setSheet(s); setError(null); } })
      .catch(err => { if (alive) { setSheet(null); setError(err.message); } });
    return () => { alive = false; };
  }, [active, month, version]);

  const grouped = useMemo(() => {
    if (!sheet) return [];
    return GROUPS.map(g => {
      const rows = sheet.rows.filter(r => r.group === g.key);
      return { ...g, rows, scheduled: rows.reduce((t, r) => t + r.scheduled, 0), total: rows.reduce((t, r) => t + r.total_sessions, 0) };
    }).filter(g => g.rows.length);
  }, [sheet]);

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
  const head = { ...cell, height: 'auto', padding: '6px 4px', fontSize: 11.5, fontWeight: 600, color: MUTED, background: '#FAFAFA', position: 'sticky', top: 0, zIndex: 2 };
  const stickyName = { position: 'sticky', left: 0, zIndex: 1, background: 'white', minWidth: NAME_W, maxWidth: NAME_W, overflow: 'hidden', textOverflow: 'ellipsis' };
  const dayBg = (d) => (sheet?.closures?.[dateOf(d)] ? '#F5F3FF' : (weekday(d) === 0 || weekday(d) === 6) ? '#F4F4F5' : dateOf(d) === sheet?.today ? '#FFFBEB' : undefined);
  const grand = grouped.reduce((t, g) => ({ scheduled: t.scheduled + g.scheduled, total: t.total + g.total }), { scheduled: 0, total: 0 });
  const colCount = 4 + days.length + 4;

  return (
    <div style={{ background: PAGE_BG, minHeight: '100%', fontFamily: FONT }}>
      <div style={{ padding: isMobile ? 16 : '24px 28px 40px', maxWidth: 1600, margin: '0 auto' }}>
        <div ref={headerRef}>
          <PageHeader
            title="Billing"
            isMobile={isMobile}
            actions={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {manager && (
                  <select value={provider} onChange={e => setProvider(e.target.value)} aria-label="Provider"
                    style={{ padding: '7px 10px', borderRadius: 6, border: `1px solid ${HAIRLINE}`, fontSize: 13, fontFamily: 'inherit', background: 'white' }}>
                    {providers.map(p => <option key={p.Name} value={p.Name}>{p.Name}</option>)}
                  </select>
                )}
                <button type="button" aria-label="Previous month" onClick={() => setMonth(m => shiftMonth(m, -1))} style={buttonStyle('secondary', { padding: '6px 10px' })}>‹</button>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: INK, minWidth: 130, textAlign: 'center' }}>{monthLabel(month)}</span>
                <button type="button" aria-label="Next month" onClick={() => setMonth(m => shiftMonth(m, 1))} style={buttonStyle('secondary', { padding: '6px 10px' })}>›</button>
                {month !== monthKey(new Date()) && <button type="button" onClick={() => setMonth(monthKey(new Date()))} style={buttonStyle('secondary')}>This month</button>}
                <button type="button" onClick={() => window.print()} style={buttonStyle('secondary')}>Print</button>
              </div>
            }
          />
        </div>

        {error && <p role="alert" style={{ fontSize: 13, color: TONES.danger.fg }}>{error}</p>}
        {!sheet && !error && <p style={{ fontSize: 13, color: MUTED }}>Loading billing...</p>}

        {sheet && (
          <div style={{ background: 'white', border: `1px solid ${HAIRLINE}`, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))', gap: '6px 20px', padding: '14px 16px', borderBottom: `1px solid ${HAIRLINE}`, fontSize: 13, color: MUTED }}>
              <span>Provider: <strong style={{ color: INK, fontWeight: 600 }}>{sheet.provider}</strong></span>
              <span>Discipline: <strong style={{ color: INK, fontWeight: 600 }}>{sheet.discipline || '—'}</strong></span>
              <span>Phone: <strong style={{ color: INK, fontWeight: 600 }}>{sheet.phone || '—'}</strong></span>
              <span>Billing dates: <strong style={{ color: INK, fontWeight: 600 }}>{shortDate(sheet.start)} – {shortDate(sheet.end)}</strong></span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', ...NUMERIC }}>
                <thead>
                  <tr>
                    <th style={{ ...head, ...stickyName, background: '#FAFAFA', zIndex: 3, textAlign: 'left', padding: '6px 10px' }}>Name</th>
                    <th style={{ ...head, textAlign: 'left' }}>Mandate</th>
                    <th style={{ ...head, textAlign: 'left' }}>Program</th>
                    <th style={head} title="C = center (an in-office room)">Setting</th>
                    {days.map(d => (
                      <th key={d} style={{ ...head, minWidth: 24, textAlign: 'center', padding: '6px 2px', background: dayBg(d) || head.background }}
                        title={sheet.closures[dateOf(d)] ? `Office closed${sheet.closures[dateOf(d)].reason ? `: ${sheet.closures[dateOf(d)].reason}` : ''}` : undefined}>
                        {d}
                      </th>
                    ))}
                    <th style={{ ...head, textAlign: 'right' }}>Rate</th>
                    <th style={{ ...head, textAlign: 'right' }} title="Sessions booked this month">Sched.</th>
                    <th style={{ ...head, textAlign: 'right' }}>Sessions</th>
                    <th style={{ ...head, textAlign: 'right', borderRight: 'none' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.length === 0 && (
                    <tr><td colSpan={colCount} style={{ ...cell, height: 60, textAlign: 'center', color: MUTED, borderRight: 'none' }}>No sessions this month.</td></tr>
                  )}
                  {grouped.map(g => (
                    <GroupRows key={g.key} group={g} days={days} cell={cell} stickyName={stickyName} dayBg={dayBg} />
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', alignItems: 'center', padding: '12px 16px', borderTop: `1px solid ${HAIRLINE}`, fontSize: 12.5, color: MUTED }}>
              <span style={{ fontWeight: 600, color: INK }}>Key</span>
              {Object.entries(MARK_STYLE).map(([k, s]) => (
                <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Mark entry={{ mark: k, time: '00:00', status: '' }} /> {s.title}</span>
              ))}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Mark entry={{ mark: null, time: '00:00', status: '' }} /> Booked, day not over</span>
              <span>C = center</span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', padding: '12px 16px', borderTop: `1px solid ${HAIRLINE}`, background: '#FAFAFA', fontSize: 13, ...NUMERIC }}>
              {GROUPS.map(g => {
                const found = grouped.find(x => x.key === g.key);
                return (
                  <span key={g.key} style={{ border: `1px solid ${HAIRLINE}`, borderRadius: 6, padding: '5px 10px', background: 'white', color: MUTED }}>
                    {g.footer} <strong style={{ color: INK, marginLeft: 6 }}>{found ? found.total : 0}</strong>
                  </span>
                );
              })}
              <span style={{ border: `1px solid ${HAIRLINE}`, borderRadius: 6, padding: '5px 10px', background: 'white', color: MUTED }}>
                Sessions <strong style={{ color: INK, marginLeft: 6 }}>{grand.total} of {grand.scheduled}</strong>
              </span>
              <label style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, color: INK, fontWeight: 600, cursor: canAdminister(user) ? 'pointer' : 'default' }}
                title={canAdminister(user) ? undefined : 'Only an Admin or Developer can mark a sheet reviewed.'}>
                <input type="checkbox" checked={!!sheet.reviewed} disabled={!canAdminister(user) || savingReview} onChange={toggleReviewed} />
                Reviewed
                {sheet.reviewed && <span style={{ fontWeight: 400, color: MUTED }}>by {sheet.reviewed.reviewed_by} on {new Date(sheet.reviewed.reviewed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function GroupRows({ group, days, cell, stickyName, dayBg }) {
  return (
    <>
      <tr>
        <td colSpan={4} style={{ ...cell, ...stickyName, maxWidth: 'none', background: '#F4F4F5', fontWeight: 600, fontSize: 12, color: MUTED, padding: '0 10px', height: 28 }}>{group.label}</td>
        <td colSpan={days.length + 4} style={{ ...cell, background: '#F4F4F5', height: 28, borderRight: 'none' }} />
      </tr>
      {group.rows.map(r => (
        <tr key={r.patient_name}>
          <td style={{ ...cell, ...stickyName, padding: '0 10px', fontWeight: 500 }} title={r.locked ? `${r.patient_name} · on this sheet for the month` : r.patient_name}>{r.patient_name}</td>
          <td style={cell}>{r.mandate || ''}</td>
          <td style={cell}>{r.program || ''}</td>
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
          <td style={{ ...cell, textAlign: 'right', color: SUBTLE }} />
          <td style={{ ...cell, textAlign: 'right' }}>{r.scheduled}</td>
          <td style={{ ...cell, textAlign: 'right', fontWeight: 600 }}>{r.total_sessions}</td>
          <td style={{ ...cell, textAlign: 'right', borderRight: 'none' }} />
        </tr>
      ))}
      <tr>
        <td colSpan={4} style={{ ...cell, ...stickyName, maxWidth: 'none', fontWeight: 600, padding: '0 10px', background: '#FAFAFA' }}>Total</td>
        <td colSpan={days.length + 1} style={{ ...cell, background: '#FAFAFA' }} />
        <td style={{ ...cell, textAlign: 'right', fontWeight: 600, background: '#FAFAFA' }}>{group.scheduled}</td>
        <td style={{ ...cell, textAlign: 'right', fontWeight: 600, background: '#FAFAFA' }}>{group.total}</td>
        <td style={{ ...cell, background: '#FAFAFA', borderRight: 'none' }} />
      </tr>
    </>
  );
}
