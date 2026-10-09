// Mock API for the user-manual screenshots. Every person and patient here is
// made up. The token in sessionStorage picks who's signed in: staff |
// reception | admin.
const http = require('http');

const MON = '2026-09-28';
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

const STAFF = [
  { id: 1, username: 'alee', role: 'staff', first_name: 'Amy', last_name: 'Lee', position: 'Speech-Language Pathologist', provider_name: 'Amy Lee', phone: '(555) 201-1001', email: 'alee@example.com', hire_date: '2023-08-14' },
  { id: 2, username: 'jreyes', role: 'staff', first_name: 'Jordan', last_name: 'Reyes', position: 'Occupational Therapist', provider_name: 'Jordan Reyes', hire_date: '2022-02-01' },
  { id: 3, username: 'pshah', role: 'staff', first_name: 'Priya', last_name: 'Shah', position: 'Physical Therapist', provider_name: 'Priya Shah', hire_date: '2024-01-08' },
  { id: 4, username: 'treed', role: 'staff', first_name: 'Tom', last_name: 'Reed', position: 'Special Education Teacher', provider_name: 'Tom Reed', hire_date: '2021-09-01' },
  { id: 5, username: 'cmorgan', role: 'reception', first_name: 'Casey', last_name: 'Morgan', position: 'Front Desk Coordinator', provider_name: null, phone: '(555) 201-1005', email: 'cmorgan@example.com', hire_date: '2024-05-20' },
  { id: 6, username: 'dwhitfield', role: 'admin', first_name: 'Dana', last_name: 'Whitfield', position: 'Clinic Director', provider_name: null, phone: '(555) 201-1006', email: 'dwhitfield@example.com', hire_date: '2020-03-02' },
];
const WHO = { staff: 'alee', reception: 'cmorgan', admin: 'dwhitfield' };
const nameOf = (u) => { const s = STAFF.find(x => x.username === u); return s ? `${s.first_name} ${s.last_name}` : u; };

const PROVIDERS = [
  { id: 1, Name: 'Amy Lee', first_name: 'Amy', last_name: 'Lee', specialty: 'ST', credentials: 'CCC-SLP' },
  { id: 2, Name: 'Jordan Reyes', first_name: 'Jordan', last_name: 'Reyes', specialty: 'OT', credentials: 'OTR/L' },
  { id: 3, Name: 'Priya Shah', first_name: 'Priya', last_name: 'Shah', specialty: 'PT', credentials: 'DPT' },
  { id: 4, Name: 'Tom Reed', first_name: 'Tom', last_name: 'Reed', specialty: 'SI', credentials: 'M.Ed.' },
];

const pt = (i, Name, Program, Status, Services, extra = {}) => ({
  id: 'p' + i, Name, Program, Status, Services, mrn: String(10234560 + i), Date_of_Birth: `202${2 + (i % 3)}-0${1 + (i % 8)}-1${i % 9}`,
  Parent_Name: ['Maria', 'James', 'Wei', 'Rosa', 'Grace', 'Liam', 'Sara', 'Nina', 'Omar', 'Ruth'][i % 10] + ' ' + Name.split(' ')[1],
  Relationship_To_Patient: i % 2 ? 'Father' : 'Mother', Parent_Phone: `(555) 310-${String(4000 + i * 37).slice(0, 4)}`, Parent_Email: `family${i}@example.com`,
  Case_Manager: 'Casey Morgan', case_manager_username: 'cmorgan', RX_Expiration: addDays(MON, 20 + i * 9), IFSP_End_Date: Program === 'EI' ? addDays(MON, 60 + i * 11) : null,
  Report_Date: addDays(MON, 30 + i * 5), Picture_Consent: i % 3 !== 0, ...extra,
});
const PATIENTS = [
  pt(1, 'Ava Brown', 'EI', 'On Program', 'ST, OT', { allergies: 'Peanuts', Google_Link: JSON.stringify([{ text: 'Intake folder', url: 'https://example.com/intake' }, { text: 'Home program', url: 'https://example.com/home-program' }]) }),
  pt(2, 'Leo Park', 'CPSE', 'On Program', 'PT'),
  pt(3, 'Mia Chen', 'BCBS/Anthem', 'On Program', 'ST'),
  pt(4, 'Sam Diaz', 'EI', 'On Program', 'SI, ST'),
  pt(5, 'Noah Kim', 'CIGNA', 'On Program', 'OT'),
  pt(6, 'Ella Grant', 'EI', 'On Program', 'PT, OT'),
  pt(7, 'Owen Hayes', 'CSE', 'On Program', 'ST'),
  pt(8, 'Lily Moore', 'EI', 'Awaiting Approval', 'SI'),
  pt(9, 'Ethan Cruz', 'GHI', 'On Program', 'OT'),
  pt(10, 'Zoe Patel', 'EI', 'Off Program', 'ST'),
  { id: 'hold', Name: 'HOLD - see comments', mrn: '82712070', Program: 'NONE', Status: 'On Program' },
];

let aptId = 100;
const apt = (date, provider, patient, time, duration = 30, area = null, status = 'Scheduled', comments = null) => ({
  id: aptId++, appointment_date: date, provider, patient_name: patient, appointment_time: time + ':00', duration, treatment_area: area, appointment_status: status, comments,
});
function dayAppointments(date) {
  const wd = new Date(date + 'T12:00:00').getDay();
  if (wd === 0 || wd === 6) return [];
  const shift = wd - 1;
  const rot = (arr) => arr.map((_, i) => arr[(i + shift) % arr.length]);
  const [a, b, c, d, e, f] = rot(['Ava Brown', 'Mia Chen', 'Owen Hayes', 'Sam Diaz', 'Zoe Patel', 'Lily Moore']);
  return [
    apt(date, 'Amy Lee', a, '08:30', 30, 'Green', 'Confirmed'),
    apt(date, 'Amy Lee', b, '09:00', 45, 'Green', 'Scheduled'),
    apt(date, 'Amy Lee', c, '10:00', 30, 'Yellow', 'Left Message'),
    apt(date, 'Amy Lee', d, '13:00', 30, null, 'Scheduled'),
    apt(date, 'Amy Lee', 'HOLD - see comments', '15:00', 60, null, '*HOLD*', JSON.stringify([{ id: 1, author_username: 'cmorgan', author_display: 'Casey Morgan', timestamp: '2026-09-25T15:00:00Z', text: 'Holding for a new EI evaluation' }])),
    apt(date, 'Jordan Reyes', 'Noah Kim', '08:00', 45, 'Orange A', 'Confirmed'),
    apt(date, 'Jordan Reyes', 'Ella Grant', '09:00', 30, 'Orange A', 'Scheduled'),
    apt(date, 'Jordan Reyes', 'Ava Brown', '10:30', 30, 'Orange B', 'Scheduled'),
    { ...apt(date, 'Jordan Reyes', 'Ethan Cruz', '13:30', 45, null, 'Canceled'), makeup: { id: 1, appointment_date: addDays(date, 1), appointment_time: '15:00:00', provider: 'Jordan Reyes' } },
    apt(date, 'Priya Shah', 'Leo Park', '08:30', 60, 'Gym A', 'Confirmed'),
    apt(date, 'Priya Shah', 'Ella Grant', '10:00', 45, 'Gym A', 'Scheduled'),
    // A make-up (MU) for Ethan Cruz's canceled 1:30 with Jordan, below.
    { ...apt(date, 'Priya Shah', e === 'Zoe Patel' ? 'Leo Park' : 'Ella Grant', '14:00', 30, 'Gym B', 'Scheduled'), is_makeup: true },
    apt(date, 'Tom Reed', 'Sam Diaz', '09:00', 60, 'Purple', 'Confirmed'),
    { ...apt(date, 'Tom Reed', f, '11:00', 45, null, 'Scheduled'), is_eval: true },
    apt(date, 'Tom Reed', 'Lily Moore', '14:30', 30, 'Purple', 'No Show'),
  ].map((a, i) => ({ ...a, id: Number(date.replace(/-/g, '').slice(4)) * 100 + i }));
}
function dayOOO(date) {
  const wd = new Date(date + 'T12:00:00').getDay();
  if (wd === 0 || wd === 6) return [];
  return [
    { id: 900 + wd * 10, provider: 'Amy Lee', ooo_date: date, start_time: '12:00:00', end_time: '12:30:00', type: 'Lunch', notes: null },
    { id: 901 + wd * 10, provider: 'Jordan Reyes', ooo_date: date, start_time: '12:00:00', end_time: '13:00:00', type: 'Lunch', notes: null },
    { id: 902 + wd * 10, provider: 'Priya Shah', ooo_date: date, start_time: '15:00:00', end_time: '16:00:00', type: 'Meeting', notes: 'Team meeting', time_off_request_id: 77 },
    ...(wd === 5 ? [{ id: 903 + wd * 10, provider: 'Tom Reed', ooo_date: date, start_time: '13:00:00', end_time: '18:00:00', type: 'PTO', notes: null }] : []),
  ];
}
function range(start, end, fn, provider) {
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(...fn(d));
  return provider ? out.filter(x => x.provider === provider) : out;
}

const OFFICE_HOURS = [1, 2, 3, 4, 5].map(w => ({ weekday: w, open_time: '08:00:00', close_time: '18:00:00' }));
const USUAL = [1, 2, 3, 4, 5].map((w, i) => ({ id: i + 1, weekday: w, start_time: '08:00:00', end_time: w === 5 ? '13:00:00' : '17:00:00' }));

const WAITLIST = [
  { id: 1, patient_id: 'p8', patient_name: 'Lily Moore', program: 'EI', specialty: 'ST', preferred_provider: null, available_days: [1, 3], available_from: '15:00:00', available_to: null, referral_date: '2026-08-10', status: 'contacted', contacted_at: '2026-09-22T15:00:00Z', notes: 'Referred by Dr. Patel. Left voicemail 9/22.' },
  { id: 2, patient_id: 'p5', patient_name: 'Noah Kim', program: 'CIGNA', specialty: 'PT', preferred_provider: 'Priya Shah', available_days: [], available_from: null, available_to: null, referral_date: '2026-08-24', status: 'waiting', notes: null },
  { id: 3, patient_id: 'p7', patient_name: 'Owen Hayes', program: 'CSE', specialty: 'OT', preferred_provider: null, available_days: [2, 4], available_from: '09:00:00', available_to: '12:00:00', referral_date: '2026-09-08', status: 'waiting', notes: 'Mornings only' },
  { id: 4, patient_id: 'p10', patient_name: 'Zoe Patel', program: 'EI', specialty: 'SI', preferred_provider: 'Tom Reed', available_days: [5], available_from: null, available_to: '13:00:00', referral_date: '2026-09-21', status: 'waiting', notes: null },
];
const WAITLIST_HISTORY = [
  { id: 9, patient_id: 'p3', patient_name: 'Mia Chen', specialty: 'ST', preferred_provider: 'Amy Lee', available_days: [], referral_date: '2026-07-01', status: 'scheduled', closed_at: '2026-09-15T14:00:00Z', closed_by: 'cmorgan' },
];

const REQUESTS = [
  { id: 11, username: 'alee', request_type: 'PTO', status: 'approved', is_balance_type: true, start_date: '2026-10-23', end_date: '2026-10-23', start_time: '08:00:00', end_time: '17:00:00', charged_hours: 8, notes: 'Family event', requested_at: '2026-09-10T12:00:00Z', reviewed_by: 'dwhitfield' },
  { id: 12, username: 'alee', request_type: 'UPTO', status: 'pending', is_balance_type: true, start_date: '2026-11-25', end_date: '2026-11-25', start_time: '13:00:00', end_time: '17:00:00', charged_hours: 4, requested_at: '2026-09-24T12:00:00Z' },
  { id: 13, username: 'jreyes', request_type: 'PTO', status: 'pending', is_balance_type: true, start_date: '2026-10-12', end_date: '2026-10-13', start_time: '08:00:00', end_time: '17:00:00', charged_hours: 16, notes: 'Wedding', requested_at: '2026-09-20T12:00:00Z' },
  { id: 14, username: 'pshah', request_type: 'Other', status: 'pending', is_balance_type: false, is_recurring: false, ooo_date: '2026-10-07', start_time: '14:00:00', end_time: '16:00:00', notes: 'Continuing education course', requested_at: '2026-09-25T12:00:00Z' },
  { id: 15, username: 'treed', request_type: 'PTO', status: 'approved', is_balance_type: true, start_date: '2026-10-02', end_date: '2026-10-02', start_time: '13:00:00', end_time: '18:00:00', charged_hours: 5, requested_at: '2026-09-15T12:00:00Z', reviewed_by: 'dwhitfield' },
];
const BALANCES = { alee: { PTO: 42.5, UPTO: 9.75 }, jreyes: { PTO: 18.24, UPTO: 12 }, pshah: { PTO: 31, UPTO: 6.5 }, treed: { PTO: 120, UPTO: 3.25 }, cmorgan: { PTO: 22.4, UPTO: 9.75 }, dwhitfield: { PTO: 64, UPTO: 9.75 } };
const days = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'].map(d => ({ date: d, scheduled: 8, worked: 8 }));
const LEDGER = [
  { id: 31, balance_after: 42.5, balance_type: 'PTO', entry_date: '2026-09-27', kind: 'accrual', hours: 3.2, period_start: '2026-09-21', worked_hours: 40, note: '40h worked x 0.08', details: { rate: 0.08, days } },
  { id: 30, balance_after: 39.3, balance_type: 'PTO', entry_date: '2026-09-20', kind: 'accrual', hours: 2.56, period_start: '2026-09-14', worked_hours: 32, note: '32h worked x 0.08', details: { rate: 0.08, days: days.map(d => ({ ...d, date: addDays(d.date, -7), worked: d.date.endsWith('25') ? 0 : 8, noPatients: d.date.endsWith('25') })) } },
  { id: 29, balance_after: 36.74, balance_type: 'PTO', entry_date: '2026-09-15', kind: 'used', hours: -8, note: 'PTO on Sep 15' },
  { id: 28, balance_after: 44.74, balance_type: 'PTO', entry_date: '2026-09-13', kind: 'accrual', hours: 3.2, period_start: '2026-09-07', worked_hours: 40, note: '40h worked x 0.08', details: { rate: 0.08, days } },
  { id: 27, balance_after: 41.54, balance_type: 'PTO', entry_date: '2026-09-01', kind: 'reset', hours: 41.54, note: 'Starting PTO 41.54 h as of Sep 1, 2026' },
];

const TASKS = (me) => [
  { id: 51, title: 'Credential expiring: CPR certification', description: 'Your CPR certification credential expires on Mon, Oct 5, 2026 (in 8 days). Please renew it and update the new expiration date under Credentials on My profile.', assigned_to: me, assigned_by: 'system', status: 'open', is_automated: true, due_date: '2026-10-05', created_at: '2026-09-21T11:00:00Z', comments: null },
  { id: 52, title: 'Send progress report for Mia Chen', description: 'Report due to the family before the review meeting.', assigned_to: me, assigned_by: 'cmorgan', status: 'open', is_automated: false, due_date: '2026-10-01', created_at: '2026-09-24T14:00:00Z', comments: JSON.stringify([{ id: 1, author_username: 'cmorgan', author_display: 'Casey Morgan', timestamp: '2026-09-24T14:05:00Z', text: 'Template is in the shared drive.' }]) },
  { id: 53, title: 'Update home program for Ava Brown', description: null, assigned_to: me, assigned_by: me, status: 'done', is_automated: false, due_date: null, created_at: '2026-09-18T14:00:00Z', completed_at: '2026-09-19T10:00:00Z', comments: null },
];

const CONVERSATIONS = [
  { id: 1, type: 'group', name: 'Front desk', participants: ['alee', 'cmorgan', 'jreyes'], unread_count: 2, last_message: { sender_username: 'cmorgan', text: 'Ava Brown’s mom called — running 10 minutes late.', created_at: '2026-09-28T13:20:00Z' }, created_at: '2026-09-01T00:00:00Z' },
  { id: 2, type: 'direct', participants: ['alee', 'pshah'], unread_count: 0, last_message: { sender_username: 'alee', text: 'Can we swap rooms at 10?', created_at: '2026-09-27T16:00:00Z' }, created_at: '2026-09-01T00:00:00Z' },
];
const MESSAGES = [
  { id: 1, sender_username: 'jreyes', text: 'Is the Orange A room free after lunch?', created_at: '2026-09-28T13:05:00Z' },
  { id: 2, sender_username: 'cmorgan', text: 'Yes, it is open from 1:00.', created_at: '2026-09-28T13:08:00Z' },
  { id: 3, sender_username: 'cmorgan', text: 'Ava Brown’s mom called — running 10 minutes late.', created_at: '2026-09-28T13:20:00Z' },
];

// Billing sheet (BillingPage.jsx): one provider's month, made up.
function billingSheet(provider, month) {
  const [y, m] = month.split('-').map(Number);
  const daysIn = new Date(y, m, 0).getDate();
  const today = '2026-10-08';
  const rowsDef = [
    ['Ava Brown', 'EI', '2x30', 'EI', [1, 3], 'X'],
    ['Sam Diaz', 'EI', '1x30', 'EI', [2], 'X'],
    ['Owen Hayes', 'DOE', '2x30', 'CSE', [1, 4], 'X'],
    ['Mia Chen', 'Other', '1x45', 'C-2', [5], 'X'],
    ['Zoe Patel', 'Other', '1x30', null, [3], 'X'],
  ];
  let id = 1;
  const rows = rowsDef.map(([name, group, mandate, program, weekdays], ri) => {
    const daysMap = {};
    let scheduled = 0; let total = 0;
    for (let d = 1; d <= daysIn; d++) {
      const date = `${month}-${String(d).padStart(2, '0')}`;
      const wd = new Date(date + 'T12:00:00').getDay();
      if (!weekdays.includes(wd)) continue;
      let mark = date < today ? 'X' : null;
      if (mark && ri === 0 && d === 7) mark = 'A';
      if (mark && ri === 2 && d === 2) mark = 'PA';
      if (mark && ri === 3 && d === 2) mark = 'E';
      daysMap[d] = [{ id: id++, mark, time: '10:00', status: mark === 'A' ? 'Canceled' : 'Scheduled' }];
      scheduled++;
      if (mark === 'X' || mark === 'E') total++;
      if (ri === 0 && d === 7) { daysMap[9] = [{ id: id++, mark: null, time: '15:00', status: 'Scheduled' }]; }
    }
    if (ri === 0) { daysMap[6] = [{ id: id++, mark: 'M', time: '15:00', status: 'Scheduled' }]; total++; }
    return { patient_name: name, group, mandate, program, needs_code: program === null, setting: ri === 3 ? 'C, H' : 'C', days: daysMap, scheduled, total_sessions: total };
  });
  return {
    provider, discipline: 'ST', phone: '(555) 201-1001', start: `${month}-01`, end: `${month}-${daysIn}`, days_in_month: daysIn, today,
    closures: { [`${month}-12`]: { reason: 'Columbus Day', closure_type: 'holiday' } },
    time_off: { PTO: 8, UPTO: 0, requests: [{ type: 'PTO', start_date: `${month}-23`, end_date: `${month}-23`, hours: 8 }] },
    rows, reviewed: null,
  };
}

// EI-Hub entry list (EiHubList.jsx): the month's EI sessions so far, made up.
function eiHub(month) {
  const ei = { 'Ava Brown': ['1023456', { ST: '4471029', OT: '4471030' }], 'Sam Diaz': ['1029981', { ST: '4470112', SI: '4470113' }], 'Lily Moore': [null, {}], 'Zoe Patel': ['1031207', { ST: '4472210' }] };
  const svc = { 'Amy Lee': 'ST', 'Jordan Reyes': 'OT', 'Priya Shah': 'PT', 'Tom Reed': 'SI' };
  const sessions = [];
  for (let d = `${month}-01`; d < '2026-10-09'; d = addDays(d, 1)) {
    for (const a of dayAppointments(d)) {
      const info = ei[a.patient_name];
      if (!info || ['Canceled', 'No Show', '*HOLD*'].includes(a.appointment_status)) continue;
      const [h, m] = a.appointment_time.split(':').map(Number);
      const endM = h * 60 + m + a.duration;
      const service = svc[a.provider];
      const auth = info[1][service] || null;
      const setting = a.treatment_area ? (/^Offsite/.test(a.treatment_area) ? 'School' : 'Center') : null;
      const problems = [!info[0] && 'No ID # (EI child ID) on the patient', !auth && `No EI authorization number for ${service} on this date`, !setting && 'No room or offsite setting'].filter(Boolean);
      const done = d < '2026-10-06';
      sessions.push({ key: `appt:${a.id}`, appointment_id: a.id, date: d, start_time: a.appointment_time.slice(0, 5), end_time: `${String(Math.floor(endM / 60)).padStart(2, '0')}:${String(endM % 60).padStart(2, '0')}`, duration: a.duration,
        patient_name: a.patient_name, ei_child_id: info[0], provider: a.provider, service, service_options: null, authorization: auth, setting, is_makeup: !!a.is_makeup, is_eval: !!a.is_eval, problems,
        entered: done ? { by: 'cmorgan', at: `${addDays(d, 1)}T15:00:00Z`, changed: d === '2026-10-05' && a.patient_name === 'Ava Brown' } : null });
    }
  }
  return { month, start: `${month}-01`, end: `${month}-31`, today: '2026-10-09', tracking: true, sessions };
}

const handlers = [
  [/^\/billing\/ei-hub$/, (role, q) => eiHub(q.get('month') || '2026-10')],
  [/^\/billing$/, (role, q) => billingSheet(q.get('provider') || 'Amy Lee', q.get('month') || '2026-10')],
  [/^\/office-closures$/, () => [
    { id: 1, closure_date: '2026-10-12', reason: 'Columbus Day', closure_type: 'holiday' },
    { id: 2, closure_date: '2026-11-26', reason: 'Thanksgiving', closure_type: 'holiday' },
    { id: 3, closure_date: '2026-10-29', reason: 'Power outage', closure_type: 'emergency' },
  ]],
  [/^\/patients\/[^/]+\/programs$/, () => ({ available: true, rows: [
    { id: 3, program: 'EI', service: 'ST', sessions: '2', minutes: 30, start_date: '2026-09-01', end_date: null, authorization_number: '4471029' },
    { id: 2, program: 'EI', service: 'OT', sessions: '1', minutes: 30, start_date: '2026-09-01', end_date: null, authorization_number: '4471030' },
    { id: 1, program: 'EI', service: 'ST', sessions: '1', minutes: 30, start_date: null, end_date: '2026-08-31' },
  ] })],
  [/^\/auth\/me$/, (role) => { const s = STAFF.find(x => x.username === WHO[role]); return { id: s.id, username: s.username, role: s.role, mustResetPassword: false, providerName: s.provider_name, firstName: s.first_name, lastName: s.last_name, position: s.position }; }],
  [/^\/auth\/users$/, () => STAFF.map(s => ({ ...s, archived: false, must_reset_password: false, created_at: '2024-01-01T00:00:00Z', last_login: '2026-09-26T13:00:00Z' }))],
  [/^\/staff\/directory$/, () => STAFF.map(s => ({ username: s.username, display_name: nameOf(s.username), role: s.role, archived: false, can_case_manage: s.role !== 'developer' }))],
  [/^\/chat\/directory$/, (role) => STAFF.filter(s => s.username !== WHO[role]).map(s => ({ username: s.username, display_name: nameOf(s.username) }))],
  [/^\/staff\/me$/, (role) => STAFF.find(x => x.username === WHO[role])],
  [/^\/staff\/credentials$/, () => [
    { id: 1, credential_name: 'CPR certification', expiration_date: '2026-10-05', notes: null },
    { id: 2, credential_name: 'State license', expiration_date: '2027-06-30', notes: 'License #SLP-10442' },
  ]],
  [/^\/providers$/, () => PROVIDERS],
  [/^\/providers\/[^/]+\/usual-schedule$/, () => USUAL],
  [/^\/providers\/[^/]+\/schedule-changes$/, () => []],
  [/^\/office-hours$/, () => OFFICE_HOURS],
  [/^\/patients$/, () => PATIENTS],
  [/^\/patients\/search$/, (role, q) => PATIENTS.filter(p => p.Name.toLowerCase().includes((q.get('q') || '').toLowerCase()))],
  [/^\/patients\/alerts$/, () => [{ Name: 'Ava Brown', allergies: 'Peanuts', immunizations: null }]],
  [/^\/patients\/[^/]+\/appointments$/, () => [dayAppointments(MON)[0], dayAppointments(addDays(MON, 7))[0]]],
  [/^\/patients\/[^/]+$/, (role, q, path) => PATIENTS.find(p => p.Name === decodeURIComponent(path.split('/')[2])) || null],
  [/^\/appointments$/, (role, q) => dayAppointments(q.get('date') || MON)],
  [/^\/appointments\/range$/, (role, q) => range(q.get('start'), q.get('end'), dayAppointments, q.get('provider') || null)],
  [/^\/appointments\/window$/, (role, q) => range(q.get('start'), q.get('end'), dayAppointments)],
  [/^\/ooo$/, (role, q) => dayOOO(q.get('date') || MON)],
  [/^\/ooo\/range$/, (role, q) => range(q.get('start'), q.get('end'), dayOOO, q.get('provider') || null)],
  [/^\/ooo\/window$/, (role, q) => range(q.get('start'), q.get('end'), dayOOO)],
  [/^\/waitlist$/, (role, q) => ({ entries: q.get('view') === 'history' ? WAITLIST_HISTORY : (q.get('patient') ? WAITLIST.filter(w => w.patient_name === q.get('patient')) : WAITLIST) })],
  [/^\/time-off\/requests$/, (role, q) => (q.get('all') === 'true' ? REQUESTS : REQUESTS.filter(r => r.username === WHO[role]))],
  [/^\/time-off\/balances\/all$/, () => ({ balance_cap: 120, rows: STAFF.map(s => ({ username: s.username, display_name: nameOf(s.username), pto: BALANCES[s.username].PTO, upto: BALANCES[s.username].UPTO, pending_pto: REQUESTS.filter(r => r.username === s.username && r.status === 'pending' && r.request_type === 'PTO').reduce((t, r) => t + r.charged_hours, 0), pending_upto: REQUESTS.filter(r => r.username === s.username && r.status === 'pending' && r.request_type === 'UPTO').reduce((t, r) => t + r.charged_hours, 0), weekly_scheduled_hours: s.provider_name ? 37 : 40, weekly_pto_credit: s.provider_name ? 2.96 : 3.2 })) })],
  [/^\/time-off\/balances$/, (role, q) => { const b = BALANCES[q.get('username') || WHO[role]] || { PTO: 0, UPTO: 0 }; return [{ balance_type: 'PTO', balance_hours: b.PTO }, { balance_type: 'UPTO', balance_hours: b.UPTO }]; }],
  [/^\/time-off\/policy$/, () => ({ schedule_kind: 'provider', weekly_scheduled_hours: 37, pto: { rate: 0.08, balance_cap: 120, carryover_max: 40, policy_start: '2026-09-01', estimated_weekly_credit: 2.96, max_consecutive_hours: 74 }, upto: { monthly_hours: 3.25 } })],
  [/^\/time-off\/ledger$/, () => LEDGER],
  [/^\/time-off\/estimate$/, () => ({ hours: 8 })],
  [/^\/time-off\/meetings$/, () => []],
  [/^\/time-off\/lookup$/, () => ({ request: { id: 77, username: 'pshah', request_type: 'Meeting', status: 'approved', is_recurring: true, notes: 'Team meeting', attendees: ['alee', 'jreyes'] }, can_change: false, can_edit_agenda: true })],
  [/^\/time-off\/requests\/\d+\/agenda$/, () => ({ kind: 'recurring', recurring_agenda: '1. Caseload updates\n2. Room schedule for October', week_date: '2026-09-28', week_agenda: 'Welcome our new PT aide' })],
  [/^\/tasks$/, (role) => TASKS(WHO[role])],
  [/^\/tasks\/board$/, () => [...TASKS('alee'), { id: 61, title: 'Call Lily Moore’s family about the waitlist', description: null, assigned_to: 'cmorgan', assigned_by: 'dwhitfield', status: 'open', is_automated: false, due_date: '2026-09-29', created_at: '2026-09-26T14:00:00Z' }, { id: 62, title: 'RX expiring for Owen Hayes', description: 'Owen Hayes’s RX expires on Oct 8, 2026. Please arrange for renewal.', assigned_to: 'cmorgan', assigned_by: 'system', status: 'open', is_automated: true, due_date: '2026-10-08', created_at: '2026-09-24T11:00:00Z' }].map(t => ({ ...t, assigned_to_first_name: nameOf(t.assigned_to).split(' ')[0], assigned_to_last_name: nameOf(t.assigned_to).split(' ')[1] }))],
  [/^\/chat\/conversations$/, () => CONVERSATIONS],
  [/^\/chat\/conversations\/\d+\/messages$/, () => MESSAGES],
  [/^\/chat\/conversations\/\d+$/, () => CONVERSATIONS[0]],
  [/^\/support\/tickets\/open-count$/, () => ({ open: 0 })],
  [/^\/support\/my-notices$/, () => []],
];

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') { res.end(); return; }
  res.setHeader('Content-Type', 'application/json');
  const role = ((req.headers.authorization || '').split(' ')[1] || 'staff').replace(/[^a-z]/g, '');
  const url = new URL(req.url, 'http://x');
  let body = ''; req.on('data', c => { body += c; }); req.on('end', () => {
    if (req.method !== 'GET') { res.end(JSON.stringify({ ok: true, id: 999 })); return; }
    for (const [re, fn] of handlers) {
      if (re.test(url.pathname)) { res.end(JSON.stringify(fn(WHO[role] ? role : 'staff', url.searchParams, url.pathname))); return; }
    }
    res.end('[]');
  });
}).listen(8787, () => console.log('manual mock on 8787'));
