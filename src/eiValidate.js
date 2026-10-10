// Checks for EI billing details as they're typed, mirroring the server's
// (kidz-lounge-api lib/eiHubCodes.js and routes/eiHub.js cleanChild /
// cleanReferral). The server checks again on save; these just say so sooner.

// A 10-digit NPI with a valid check digit (Luhn over "80840" + the first 9).
export function validNpi(value) {
  const v = String(value || '');
  if (!/^\d{10}$/.test(v)) return false;
  const s = `80840${v.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    let d = Number(s[s.length - 1 - i]);
    if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return (10 - (sum % 10)) % 10 === Number(v[9]);
}

// A message for each field that's filled in but wrong, or null.
export function npiProblem(value) {
  const v = String(value || '').replace(/\D/g, '');
  if (!v) return null;
  if (v.length !== 10) return 'An NPI is 10 digits.';
  return validNpi(v) ? null : "This NPI isn't valid. Check it for a typo.";
}

export function diagnosisProblem(value) {
  for (const part of String(value || '').split(/[,;\n]/)) {
    const code = part.trim().toUpperCase().replace(/\s+/g, '');
    if (code && !/^[A-Z]\d[0-9A-Z]\.?[0-9A-Z]{0,4}$/.test(code)) return `"${part.trim()}" isn't an ICD-10 code. Codes look like F80.2.`;
  }
  return null;
}

export function zipProblem(value) {
  const z = String(value || '').replace(/\D/g, '');
  return z && z.length !== 5 && z.length !== 9 ? 'ZIP code must be 5 or 9 digits.' : null;
}

export function stateProblem(value) {
  const s = String(value || '').trim();
  return s && !/^[A-Za-z]{2}$/.test(s) ? 'Use the 2-letter abbreviation, like NY.' : null;
}

// Every problem in a child's EI details form, by field.
export function childProblems(form) {
  const out = {};
  const dx = diagnosisProblem(form.diagnosis_codes); if (dx) out.diagnosis_codes = dx;
  const zip = zipProblem(form.zip); if (zip) out.zip = zip;
  const st = stateProblem(form.state); if (st) out.state = st;
  return out;
}
