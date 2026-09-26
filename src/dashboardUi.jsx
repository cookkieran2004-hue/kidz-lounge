// Building blocks for the personal and admin pages (My time, My profile,
// Admin), styled with the tokens in uiTokens.js.
import { INK, MUTED, SUBTLE, HAIRLINE, ACCENT, NUMERIC, TONES } from './uiTokens';

// Page title row: title, a line of context, and actions on the right.
export function PageHeader({ title, subtitle, actions, isMobile, children }) {
  return (
    <div style={{ display: 'flex', alignItems: isMobile ? 'stretch' : 'flex-end', justifyContent: 'space-between', gap: 12, flexDirection: isMobile ? 'column' : 'row', marginBottom: 20 }}>
      <div style={{ minWidth: 0 }}>
        {children}
        <h1 style={{ fontSize: isMobile ? 20 : 22, fontWeight: 600, color: INK, margin: 0, letterSpacing: '-0.01em' }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 13.5, color: MUTED, margin: '4px 0 0' }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  );
}

// A panel with an optional header (title, a short description, actions).
export function Card({ children, style, title, subtitle, action, pad = 20 }) {
  return (
    <section style={{ minWidth: 0, background: 'white', border: `1px solid ${HAIRLINE}`, borderRadius: 8, padding: pad, ...style }}>
      {(title || action) && (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            {title && <h2 style={{ fontSize: 14, fontWeight: 600, color: INK, margin: 0 }}>{title}</h2>}
            {subtitle && <p style={{ fontSize: 12.5, color: MUTED, margin: '3px 0 0' }}>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

// Small status tag. `tone` is a key of TONES; bg/color override it.
export function Tag({ tone = 'neutral', bg, color, children, title }) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <span title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 500, padding: '1px 7px', borderRadius: 4, background: bg || t.bg, color: color || t.fg, whiteSpace: 'nowrap', lineHeight: 1.5 }}>
      {children}
    </span>
  );
}
// Older name, kept for the pages that still use it.
export const Pill = Tag;

// A row of figures inside one panel, split by thin dividers.
export function StatStrip({ children, columns, isMobile }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : `repeat(${columns}, minmax(0, 1fr))`,
      background: 'white', border: `1px solid ${HAIRLINE}`, borderRadius: 8, marginBottom: 20,
    }}>
      {children}
    </div>
  );
}
export function Stat({ label, value, sub, children, first, isMobile, valueColor }) {
  return (
    <div style={{
      padding: '16px 20px', minWidth: 0,
      borderLeft: !isMobile && !first ? `1px solid ${HAIRLINE}` : 'none',
      borderTop: isMobile && !first ? `1px solid ${HAIRLINE}` : 'none',
    }}>
      <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: valueColor || INK, lineHeight: 1.2, overflowWrap: 'anywhere', ...NUMERIC }}>{value}</div>
      {sub && <div style={{ fontSize: 12.5, color: MUTED, marginTop: 4 }}>{sub}</div>}
      {children}
    </div>
  );
}

// Underlined tabs with optional counts: [{ key, label, count, warn, alert }].
// `warn` colors the count; `alert` ('danger' | 'warning') puts it in a
// filled circle of that color to draw attention to the tab.
export function UnderlineTabs({ tabs, active, onPick, label, style }) {
  return (
    <div role="tablist" aria-label={label} style={{ display: 'flex', gap: 20, borderBottom: `1px solid ${HAIRLINE}`, overflowX: 'auto', ...style }}>
      {tabs.map(t => {
        const on = t.key === active;
        return (
          <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => onPick(t.key)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 0', marginBottom: -1,
              border: 'none', borderBottom: `2px solid ${on ? ACCENT : 'transparent'}`, background: 'none', cursor: 'pointer',
              fontSize: 13.5, fontWeight: on ? 600 : 500, fontFamily: 'inherit', color: on ? INK : MUTED, whiteSpace: 'nowrap',
            }}>
            {t.label}
            {t.count !== undefined && t.count !== null && (t.alert ? (
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 18, height: 18, padding: '0 5px', boxSizing: 'border-box',
                borderRadius: 999, background: t.alert === 'danger' ? '#D92D20' : '#DC6803', color: 'white', fontSize: 11, fontWeight: 600, ...NUMERIC,
              }}>{t.count}</span>
            ) : (
              <span style={{ fontSize: 12, fontWeight: 500, color: t.warn ? TONES.warning.fg : SUBTLE, ...NUMERIC }}>{t.count}</span>
            ))}
          </button>
        );
      })}
    </div>
  );
}
