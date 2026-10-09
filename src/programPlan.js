// A patient's programs with a mandate per service (kidz-lounge-api
// lib/patientPrograms.js). In the form a plan is
//   [{ program: 'EI', mandates: [{ service: 'ST', sessions: '2', minutes: 30, authorization: 'A123' }] }]
// (authorization: EI only -- the EI-Hub authorization number for that service)
// and the history rows come from api.getPatientPrograms.

export const MANDATE_SERVICES = ['ST', 'OT', 'PT', 'SI'];
export const MINUTE_OPTIONS = [15, 30, 45, 60, 90];

// The current plan from history rows (rows still running: no end date).
export function planFromRows(rows) {
  const byProgram = new Map();
  for (const r of rows || []) {
    if (r.end_date) continue;
    if (!byProgram.has(r.program)) byProgram.set(r.program, { program: r.program, billing_code: r.billing_code || '', mandates: [], legacy: r.legacy_mandate || null });
    if (r.service) byProgram.get(r.program).mandates.push({ service: r.service, sessions: r.sessions, minutes: r.minutes, authorization: r.authorization_number || '' });
  }
  return [...byProgram.values()];
}

// Plans compared by what's saved (order doesn't matter).
export function planKey(plan) {
  return JSON.stringify((plan || []).map(p => ({ program: p.program, c: p.billing_code || '', m: [...p.mandates].map(m => `${m.service}:${m.sessions}x${m.minutes}:${m.authorization || ''}`).sort() })).sort((a, b) => a.program.localeCompare(b.program)));
}

export const mandateLabel = (m) => `${m.service} ${m.sessions}x${m.minutes}${m.authorization ? ` (auth ${m.authorization})` : ''}`;

// EI services carry their EI-Hub authorization number (kidz-lounge-api
// lib/patientPrograms.js); the EI-Hub list on the Billing page shows it.
export const takesAuthorization = (program) => String(program || '').trim().toUpperCase() === 'EI';

// Whether the server keeps program history yet (before its migration it
// doesn't). Asked once per page load.
let availablePromise = null;
export function programHistoryAvailable(api) {
  if (!availablePromise) availablePromise = api.getPatientPrograms(null).then(r => !!r?.available).catch(() => { availablePromise = null; return false; });
  return availablePromise;
}

// True while a patient only has what the migration brought over (programs
// with the old free-text mandate, never changed). The first change can then
// replace them for all dates (kidz-lounge-api onlyOldMandates).
export function isFirstChange(rows) {
  return (rows || []).every(r => !r.service && !r.end_date && r.created_by === 'migration');
}

// Insurance, P and PP programs have a billing code, shown as the program on
// the billing sheet (kidz-lounge-api lib/patientPrograms.js). Optional: with
// none, billing shows a red # so someone fills it in.
export const BILLING_CODES = ['C-1', 'C-2', 'C-3', 'C-4', 'C-5', 'C-6', 'C-#'];
const NO_CODE_PROGRAMS = new Set(['EI', 'CPSE', 'CSE', 'DOE', 'NONE']);
export const takesBillingCode = (program) => !NO_CODE_PROGRAMS.has(String(program || '').trim().toUpperCase());
// What the form sends for a plan.
export const planPayload = (plan) => plan.map(({ program, billing_code, mandates }) => ({ program, billing_code: billing_code || null, mandates }));
