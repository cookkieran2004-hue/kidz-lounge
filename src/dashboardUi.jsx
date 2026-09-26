// Building blocks shared by the personal dashboards (My time, My profile):
// white rounded cards with a serif title, and small status pills.
export const INK = '#241A33';
export const MUTED = '#6B6280';
export const HAIRLINE = '#E7E2F3';
export const PAGE_BG = '#FAF9FD';
export const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';

export function Card({ children, style, title, action, pad = 18 }) {
  return (
    <section style={{ minWidth: 0, background: 'white', border: `1px solid ${HAIRLINE}`, borderRadius: 14, boxShadow: '0 1px 2px rgba(36,26,51,0.04), 0 6px 20px rgba(36,26,51,0.05)', padding: pad, ...style }}>
      {(title || action) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {title && <h2 style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 700, color: INK, margin: 0 }}>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Pill({ children, bg, color }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: bg, color, whiteSpace: 'nowrap' }}>{children}</span>;
}
