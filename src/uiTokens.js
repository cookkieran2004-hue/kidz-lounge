// Design tokens for the personal and admin pages (My time, My profile,
// Admin): colors, status tones and button styles. The components that use
// them are in dashboardUi.jsx. Plain and businesslike on purpose -- white
// panels, thin grey borders, no shadows or gradients, one system font with
// aligned figures, and the brand purple only for primary actions, links
// and the selected tab.
export const INK = '#18181B';
export const MUTED = '#71717A';
export const SUBTLE = '#A1A1AA';
export const HAIRLINE = '#E4E4E7';
export const PAGE_BG = 'var(--brand-page-bg)';
export const ACCENT = 'var(--brand-primary)';
export const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';
export const NUMERIC = { fontVariantNumeric: 'tabular-nums' };

// Status tones for tags and short status text.
export const TONES = {
  neutral: { bg: '#F4F4F5', fg: '#52525B' },
  success: { bg: '#ECFDF3', fg: '#067647' },
  warning: { bg: '#FFFAEB', fg: '#B54708' },
  danger: { bg: '#FEF3F2', fg: '#B42318' },
  accent: { bg: 'var(--brand-tint)', fg: 'var(--brand-primary-strong)' },
};

export const buttonStyle = (variant = 'secondary', extra = {}) => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '7px 12px', borderRadius: 6, fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
  cursor: 'pointer', whiteSpace: 'nowrap', lineHeight: 1.3,
  ...(variant === 'primary' ? { background: ACCENT, color: 'white', border: `1px solid ${ACCENT}` }
    : variant === 'danger' ? { background: 'white', color: '#B42318', border: `1px solid ${HAIRLINE}` }
    : variant === 'text' ? { background: 'transparent', color: ACCENT, border: '1px solid transparent', padding: '4px 6px' }
    : { background: 'white', color: INK, border: `1px solid ${HAIRLINE}` }),
  ...extra,
});

// Toggle buttons for a multi-choice field (the patient form's Services and
// Program): square-ish, the selected ones tinted, never pill-shaped.
export const choiceStyle = (selected) => ({
  padding: '5px 11px', borderRadius: 6, fontSize: 13, fontWeight: selected ? 600 : 500, cursor: 'pointer', fontFamily: 'inherit',
  border: `1px solid ${selected ? ACCENT : '#D4D4D8'}`,
  background: selected ? TONES.accent.bg : 'white',
  color: selected ? TONES.accent.fg : INK,
});
