// Shared look for the admin staff directory, staff profile, and new-staff
// flow. Colors match the rest of the app (BRAND in StaffPage/SchedulePage).
import { BRAND, BRAND_SERIF } from '../StaffPage';

export { BRAND, BRAND_SERIF };

export const INK = '#241A33';        // headings / names
export const BODY = '#374151';       // body text
export const HAIRLINE = '#E7E2F3';   // soft purple-grey borders
export const PAGE_BG = '#FAF9FD';    // very faint lilac behind cards
export const DANGER = '#B42318';
export const DANGER_BG = '#FEF3F2';
export const SUCCESS = '#067647';

export const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export function displayName(s) {
  if (!s) return '';
  const first = s.preferred_name || s.first_name;
  return first ? `${first} ${s.last_name || ''}`.trim() : s.username;
}

export function legalName(s) {
  return [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(' ');
}

export function cardStyle(extra) {
  return { background: 'white', border: `1px solid ${HAIRLINE}`, borderRadius: 14, ...extra };
}

export function btn(kind = 'secondary', extra) {
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'inherit', lineHeight: 1.2, whiteSpace: 'nowrap',
  };
  const kinds = {
    primary: { border: 'none', background: BRAND.forest, color: 'white' },
    secondary: { border: `1px solid ${HAIRLINE}`, background: 'white', color: BODY },
    ghost: { border: 'none', background: 'transparent', color: BRAND.brassText },
    danger: { border: `1px solid #FECDCA`, background: 'white', color: DANGER },
  };
  return { ...base, ...kinds[kind], ...extra };
}

export function inputStyle(extra) {
  return {
    width: '100%', padding: '9px 11px', borderRadius: 8, border: `1px solid ${HAIRLINE}`,
    fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit', color: INK, background: 'white', ...extra,
  };
}

export function labelStyle() {
  return { display: 'block', fontSize: 12, fontWeight: 600, color: BODY, margin: '0 0 5px' };
}

export function pill(kind = 'neutral') {
  const kinds = {
    neutral: { background: '#F3F2F7', color: '#5F5A6B' },
    brand: { background: BRAND.tint, color: BRAND.brassText },
    alert: { background: DANGER_BG, color: DANGER },
    warn: { background: '#FFFAEB', color: '#93370D' },
  };
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600,
    padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap', ...kinds[kind],
  };
}

export function sectionTitleStyle() {
  return { fontSize: 16, fontWeight: 700, color: INK, margin: 0 };
}

export function hintStyle() {
  return { fontSize: 12.5, color: BRAND.muted, margin: '4px 0 0', lineHeight: 1.5 };
}

export function overlayStyle() {
  return { position: 'fixed', inset: 0, background: 'rgba(36,26,51,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 10000, padding: '40px 16px', overflowY: 'auto' };
}

export function dateOnly(v) {
  return v ? String(v).slice(0, 10) : '';
}

export function formatLongDate(v) {
  const d = dateOnly(v);
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Staff saves send the whole record (same shape the old Edit Staff modal
// sent), so a save that only meant to change one thing never blanks others.
export function staffSavePayload(staff, overrides, adminPassword) {
  const merged = { ...staff, ...overrides };
  return {
    role: merged.role,
    provider_name: merged.provider_name || '',
    first_name: (merged.first_name || '').trim() || undefined,
    middle_name: (merged.middle_name || '').trim() || undefined,
    last_name: (merged.last_name || '').trim() || undefined,
    // Always sent, even empty: an empty value clears the preferred name.
    preferred_name: (merged.preferred_name || '').trim(),
    position: (merged.position || '').trim() || undefined,
    hire_date: dateOnly(merged.hire_date),
    admin_password: adminPassword,
  };
}

// How a person's provider is named on the schedule. Must match the
// backend rule in lambda lib/providerNames.js: preferred name if set,
// otherwise first name, plus last name.
export function scheduleNameFor(s) {
  const first = ((s.preferred_name || '').trim() || (s.first_name || '').trim());
  const last = (s.last_name || '').trim();
  return first && last ? `${first} ${last}` : '';
}

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
