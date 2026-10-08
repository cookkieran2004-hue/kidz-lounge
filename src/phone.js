// US phone numbers, always stored as (555) 555-5555 (kidz-lounge-api
// routes/staff.js normalizePhone). Only digits can be typed; a leading
// country code 1 is dropped.

// Digits only, without a leading US country code (1).
export function phoneDigits(value) {
  let d = String(value || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d.slice(0, 10);
}
// Formats as you type: (555, (555) 555, (555) 555-5555.
export function formatPhone(value) {
  const d = phoneDigits(value);
  if (d.length === 0) return '';
  if (d.length < 4) return `(${d}`;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
