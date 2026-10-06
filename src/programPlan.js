// A patient's programs with a mandate per service (kidz-lounge-api
// lib/patientPrograms.js). In the form a plan is
//   [{ program: 'EI', mandates: [{ service: 'ST', sessions: '2', minutes: 30 }] }]
// and the history rows come from api.getPatientPrograms.

export const MANDATE_SERVICES = ['ST', 'OT', 'PT', 'SI'];
export const MINUTE_OPTIONS = [15, 30, 45, 60, 90];

// The current plan from history rows (rows still running: no end date).
export function planFromRows(rows) {
  const byProgram = new Map();
  for (const r of rows || []) {
    if (r.end_date) continue;
    if (!byProgram.has(r.program)) byProgram.set(r.program, { program: r.program, mandates: [], legacy: r.legacy_mandate || null });
    if (r.service) byProgram.get(r.program).mandates.push({ service: r.service, sessions: r.sessions, minutes: r.minutes });
  }
  return [...byProgram.values()];
}

// Plans compared by what's saved (order doesn't matter).
export function planKey(plan) {
  return JSON.stringify((plan || []).map(p => ({ program: p.program, m: [...p.mandates].map(m => `${m.service}:${m.sessions}x${m.minutes}`).sort() })).sort((a, b) => a.program.localeCompare(b.program)));
}

export const mandateLabel = (m) => `${m.service} ${m.sessions}x${m.minutes}`;
