// The credentials the owner asked every provider to keep on file (Kieran,
// Oct 2026), picked from a list so everyone's entries look the same.
// Mirrors kidz-lounge-api lib/credentialTypes.js. The expiration date is
// always typed in; `hint` is the owner's rule for which date to enter
// ("I do not want expirations to auto calculate"). `notes` labels the Notes
// box for that credential.

export const CREDENTIAL_TYPES = [
  { name: 'Physical', hint: 'Enter the date 1 year after your physical.' },
  { name: 'License/Registration', hint: 'Enter the expiration date on your license or registration.', notes: 'License or registration number' },
  { name: 'Liability Insurance', hint: 'Enter the expiration date on your policy.' },
  { name: 'Mandated Reporter', hint: 'Enter the date 2 years after you completed it.' },
  { name: 'OSHA Training', hint: 'Enter the date 2 years after you completed it.' },
  { name: 'SCR', hint: 'Enter the date 3 years after the date on your SCR.' },
  { name: 'Trainings', hint: "Enter all of this year's trainings in one entry. 2026 trainings expire Nov 30, 2026.", notes: 'Hours and course for each training (e.g. 2 hrs – TKL training)' },
];

// Compared without case, spaces or punctuation; a few older spellings
// count too ("OSHA", "2026 Trainings").
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const ALIASES = { 'OSHA Training': [/^osha(training)?$/], Trainings: [/^(\d{4})?trainings?$/] };
export function credentialType(name) {
  const n = norm(name);
  return CREDENTIAL_TYPES.find(t => norm(t.name) === n || (ALIASES[t.name] || []).some(re => re.test(n))) || null;
}
// The required credentials not on file yet.
export function missingCredentials(credentials) {
  const have = new Set(credentials.map(c => credentialType(c.credential_name)?.name).filter(Boolean));
  return CREDENTIAL_TYPES.filter(t => !have.has(t.name));
}
