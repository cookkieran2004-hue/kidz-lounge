// Employment type (mirrors kidz-lounge-api lib/employment.js): which
// paid/unpaid time off someone can take. Oct 2026 policy.
export const EMPLOYMENT_TYPES = ['salaried', 'hourly', 'neither'];
export const EMPLOYMENT_LABELS = { salaried: 'Salaried', hourly: 'Hourly', neither: 'Neither' };
export const EMPLOYMENT_HINTS = {
  salaried: 'PTO and UPTO.',
  hourly: 'UPTO only.',
  neither: 'No PTO or UPTO. Lunch, meetings and other time off still work.',
};
export const employmentLabel = (type) => EMPLOYMENT_LABELS[type] || 'Neither';
// The balance types someone may request.
export const allowedBalanceTypes = (type) => (type === 'salaried' ? ['PTO', 'UPTO'] : type === 'hourly' ? ['UPTO'] : []);
