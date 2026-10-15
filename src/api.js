const API_BASE = import.meta.env.VITE_API_URL;
const TOKEN_KEY = 'kidz_lounge_token';

// sessionStorages (not localStorage) is deliberate: it persists across page
// reloads within the same tab, but is cleared as soon as the tab or browser
// is closed -- so a reload keeps you logged in, closing the tab logs you out.
export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

// AWS sometimes turns requests away for a moment (503, often reported by
// the browser as a CORS error / "Failed to fetch"), mostly when many go out
// at once while the server is waking up. Reads (GET) are retried twice
// with a short, growing wait. Saves are never retried automatically, so
// nothing is ever saved twice.
const RETRY_STATUSES = new Set([429, 502, 503, 504]);
const RETRY_WAITS_MS = [500, 1500];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const OFFLINE_MESSAGE = "Couldn't reach the server. Check your internet connection and try again in a moment.";

async function request(path, options = {}) {
  const token = getToken();
  const canRetry = !options.method || options.method === 'GET';
  let res;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(options.headers || {}),
        },
      });
    } catch (networkErr) {
      // Couldn't get a readable answer at all (AWS 503 without CORS
      // headers, dropped connection, offline).
      if (canRetry && attempt < RETRY_WAITS_MS.length) { await sleep(RETRY_WAITS_MS[attempt] + Math.random() * 300); continue; }
      const err = new Error(OFFLINE_MESSAGE);
      err.status = 0;
      err.cause = networkErr;
      throw err;
    }
    if (canRetry && RETRY_STATUSES.has(res.status) && attempt < RETRY_WAITS_MS.length) {
      await sleep(RETRY_WAITS_MS[attempt] + Math.random() * 300);
      continue;
    }
    break;
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  // ---- Help & Support ----
  // Submitting works signed in or not (the server lets this one through).
  submitSupportTicket: (record) => request('/support/tickets', { method: 'POST', body: JSON.stringify(record) }),
  // Inbox: Developers only.
  getSupportOpenCount: () => request('/support/tickets/open-count'),
  getSupportTickets: (status) => request(`/support/tickets${status ? `?status=${status}` : ''}`),
  updateSupportTicket: (id, record) => request(`/support/tickets/${id}`, { method: 'PUT', body: JSON.stringify(record) }),
  deleteSupportTicket: (id) => request(`/support/tickets/${id}`, { method: 'DELETE' }),
  // "Your ticket was resolved" popups for the signed-in sender.
  getMySupportNotices: () => request('/support/my-notices'),
  markSupportNoticeSeen: (id) => request(`/support/my-notices/${id}/seen`, { method: 'PUT' }),

  // ---- Auth ----
  login: (username, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  me: () => request('/auth/me'),
  // Only so the audit log shows when a session ended.
  logout: (reason) => request('/auth/logout', { method: 'POST', body: JSON.stringify({ reason }) }),

  // ---- Audit log (Developers only) ----
  getAuditLog: (filters = {}) => request(`/audit-log?${new URLSearchParams(Object.entries(filters).filter(([, v]) => v))}`),
  // The same filters as a CSV file, saved through the browser.
  downloadAuditLogCsv: async (filters = {}) => {
    const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), format: 'csv' });
    const res = await fetch(`${API_BASE}/audit-log?${qs}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) throw new Error('The audit log export failed. Try again.');
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url; a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  setPassword: (new_password) => request('/auth/set-password', { method: 'POST', body: JSON.stringify({ new_password }) }),
  getStaff: () => request('/auth/users'),
  createStaff: (record) => request('/auth/users', { method: 'POST', body: JSON.stringify(record) }),
  updateStaff: (id, record) => request(`/auth/users/${id}`, { method: 'PUT', body: JSON.stringify(record) }),

  // ---- Providers ----
  // Default: active providers only (archived accounts' providers are left out).
  // includeArchived: everyone, each with `archived` and `linked_username`.
  getProviders: (includeArchived = false) => request(`/providers${includeArchived ? '?include_archived=true' : ''}`),
  createProvider: (record) => request('/providers', { method: 'POST', body: JSON.stringify(record) }),
  updateProvider: (id, record) => request(`/providers/${id}`, { method: 'PUT', body: JSON.stringify(record) }),
  deleteProvider: (id, force = false) => request(`/providers/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' }),

  // ---- Patients ----
  getPatients: () => request('/patients'),
  searchPatients: (q) => request(`/patients/search?q=${encodeURIComponent(q)}`),
  getPatient: (name) => request(`/patients/${encodeURIComponent(name)}`),
  // Patients with an allergy or immunization note (for schedule card icons).
  getPatientAlerts: () => request('/patients/alerts'),
  getPatientAppointments: (name) => request(`/patients/${encodeURIComponent(name)}/appointments`),
  createPatient: (record) => request('/patients', { method: 'POST', body: JSON.stringify(record) }),
  updatePatient: (id, record) => request(`/patients/${id}`, { method: 'PUT', body: JSON.stringify(record) }),
  // Program history with a mandate per service ('new' = a patient not saved yet).
  getPatientPrograms: (id) => request(`/patients/${id || 'new'}/programs`),
  // Fix a mistake: delete one history entry (Admin / Developer). A current one brings back what it replaced.
  deletePatientProgram: (patientId, entryId) => request(`/patients/${patientId}/programs/${entryId}`, { method: 'DELETE' }),
  deletePatient: (id, force = false) => request(`/patients/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' }),

  // ---- Waitlist ----
  // view: 'active' (waiting / contacted) or 'history' (scheduled / removed).
  // patient: one patient's active entries (by name, like appointments).
  getWaitlist: (view = 'active', patient) => request(`/waitlist?${new URLSearchParams({ view, ...(patient ? { patient } : {}) })}`),
  // One entry per specialty: { patient_id, specialties, providers: { ST: name }, ... }.
  createWaitlistEntries: (record) => request('/waitlist', { method: 'POST', body: JSON.stringify(record) }),
  updateWaitlistEntry: (id, record) => request(`/waitlist/${id}`, { method: 'PUT', body: JSON.stringify(record) }),
  deleteWaitlistEntry: (id) => request(`/waitlist/${id}`, { method: 'DELETE' }),

  // The provider directory (footer, everyone signed in; routes/providers.js).
  getProviderDirectory: () => request('/providers/directory'),

  // ---- Power Forms (kidz-lounge-api routes/powerForms.js) ----
  getPowerFormSetup: () => request('/power-forms/setup'),
  getPowerFormTemplates: (all) => request(`/power-forms/templates${all ? '?all=1' : ''}`),
  createPowerFormTemplate: (data) => request('/power-forms/templates', { method: 'POST', body: JSON.stringify(data) }),
  updatePowerFormTemplate: (id, data) => request(`/power-forms/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  archivePowerFormTemplate: (id, archived) => request(`/power-forms/templates/${id}/archive`, { method: 'POST', body: JSON.stringify({ archived }) }),
  getPowerFormPackages: (all) => request(`/power-forms/packages${all ? '?all=1' : ''}`),
  createPowerFormPackage: (data) => request('/power-forms/packages', { method: 'POST', body: JSON.stringify(data) }),
  updatePowerFormPackage: (id, data) => request(`/power-forms/packages/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  archivePowerFormPackage: (id, archived) => request(`/power-forms/packages/${id}/archive`, { method: 'POST', body: JSON.stringify({ archived }) }),
  getPatientPowerForms: (patientId) => request(`/power-forms/patient/${patientId}`),
  sendPowerForm: (data) => request('/power-forms/requests', { method: 'POST', body: JSON.stringify(data) }),
  newPowerFormLink: (id, days) => request(`/power-forms/requests/${id}/new-link`, { method: 'POST', body: JSON.stringify({ days }) }),
  cancelPowerForm: (id) => request(`/power-forms/requests/${id}/cancel`, { method: 'POST', body: '{}' }),
  getPowerForm: (id) => request(`/power-forms/requests/${id}`),
  applyPowerForm: (id, fields) => request(`/power-forms/requests/${id}/apply`, { method: 'POST', body: JSON.stringify({ fields }) }),
  reviewPowerForm: (id) => request(`/power-forms/requests/${id}/review`, { method: 'POST', body: '{}' }),
  deletePowerForm: (id) => request(`/power-forms/requests/${id}`, { method: 'DELETE' }),
  linkPowerFormDocument: (id, documentId) => request(`/power-forms/requests/${id}/document`, { method: 'POST', body: JSON.stringify({ document_id: documentId }) }),
  // The parent's side (no sign-in): the link's token, the child's date of birth, the answers.
  getPublicPowerForm: (token) => request(`/forms/${encodeURIComponent(token)}`),
  unlockPowerForm: (token, dob) => request(`/forms/${encodeURIComponent(token)}/unlock`, { method: 'POST', body: JSON.stringify({ dob }) }),
  submitPowerForm: (token, access, answers, requestId) => request(`/forms/${encodeURIComponent(token)}/submit`, { method: 'POST', body: JSON.stringify({ access, answers, request_id: requestId ?? undefined }) }),

  // ---- Patient Documents ----
  getPatientDocuments: (patientId) => request(`/patients/${patientId}/documents`),
  getDocumentUploadUrl: (patientId, filename, contentType) =>
    request(`/patients/${patientId}/documents/upload-url`, { method: 'POST', body: JSON.stringify({ filename, content_type: contentType }) }),
  registerPatientDocument: (patientId, record) => request(`/patients/${patientId}/documents`, { method: 'POST', body: JSON.stringify(record) }),
  getDocumentDownloadUrl: (documentId) => request(`/documents/${documentId}/download-url`),
  deletePatientDocument: (documentId) => request(`/documents/${documentId}`, { method: 'DELETE' }),

  // ---- Clinical Documents (authored/signed notes, distinct from uploaded files) ----
  getClinicalDocuments: (patientId) => request(`/patients/${patientId}/clinical-documents`),
  createClinicalDocument: (patientId, record) => request(`/patients/${patientId}/clinical-documents`, { method: 'POST', body: JSON.stringify(record) }),
  updateClinicalDocument: (id, record) => request(`/clinical-documents/${id}`, { method: 'PUT', body: JSON.stringify(record) }),
  deleteClinicalDocument: (id) => request(`/clinical-documents/${id}`, { method: 'DELETE' }),

  // ---- Appointments ----
  getAppointments: (date) => request(`/appointments?date=${date}`),
  // { 'lower-cased location': 'Center' | 'School' | 'Home' }: the setting last saved with each offsite location.
  getOffsiteSettings: () => request('/appointments/offsite-settings'),
  getAppointmentsRange: (provider, start, end) => request(`/appointments/range?provider=${encodeURIComponent(provider || '')}&start=${start}&end=${end}`),
  getAppointmentsWindow: (start, end, patientName) => request(`/appointments/window?start=${start}&end=${end}${patientName ? `&patient_name=${encodeURIComponent(patientName)}` : ''}`),
  getSeriesMatches: (patientName, provider, time, after) =>
    request(`/appointments/series-matches?patient_name=${encodeURIComponent(patientName)}&provider=${encodeURIComponent(provider)}&time=${time}&after=${after}`),
  getStaffDirectory: () => request('/staff/directory'),
  // Everyone, archived included -- only for turning usernames into names.
  getAllStaffNames: () => request('/staff/directory?include_archived=true'),
  getFinMatches: (fin, after) => request(`/appointments/fin-matches?fin=${encodeURIComponent(fin)}&after=${after}`),
  createAppointment: (record) => request('/appointments', { method: 'POST', body: JSON.stringify(record) }),
  updateAppointment: (id, record) => request(`/appointments/${id}`, { method: 'PUT', body: JSON.stringify(record) }),

  // ---- Recurring Series (new rule-based recurring model) ----
  createRecurringSeries: (record) => request('/recurring-series', { method: 'POST', body: JSON.stringify(record) }),
  endRecurringSeries: (id, endDate) => request(`/recurring-series/${id}/end`, { method: 'PUT', body: JSON.stringify({ end_date: endDate }) }),
  purgeFutureRecurringExceptions: (id, fromDate) => request(`/recurring-series/${id}/purge-future-exceptions`, { method: 'PUT', body: JSON.stringify({ from_date: fromDate }) }),
  createRecurringException: (seriesId, record) => request(`/recurring-series/${seriesId}/exceptions`, { method: 'POST', body: JSON.stringify(record) }),
  markAppointmentDeleted: (id) => request(`/appointments/${id}/mark-deleted`, { method: 'PUT' }),

  appendAppointmentComment: (id, text) => request(`/appointments/${id}/comments`, { method: 'PUT', body: JSON.stringify({ action: 'append', text }) }),
  deleteAppointmentComment: (id, commentId) => request(`/appointments/${id}/comments`, { method: 'PUT', body: JSON.stringify({ action: 'delete', commentId }) }),
  deleteAppointment: (id) => request(`/appointments/${id}`, { method: 'DELETE' }),

  // ---- Out of Office ----
  getOOO: (date) => request(`/ooo?date=${date}`),
  getOOORange: (provider, start, end) => request(`/ooo/range?provider=${encodeURIComponent(provider || '')}&start=${start}&end=${end}`),
  getOOOWindow: (start, end) => request(`/ooo/window?start=${start}&end=${end}`),
  getOOOSeriesMatches: (provider, type, startTime, endTime, after) =>
    request(`/ooo/series-matches?provider=${encodeURIComponent(provider)}&type=${encodeURIComponent(type)}&start_time=${startTime}&end_time=${endTime}&after=${after}`),
  getOOOFinMatches: (fin, after) => request(`/ooo/fin-matches?fin=${encodeURIComponent(fin)}&after=${after}`),
  // ---- OOO Recurring Series (new rule-based recurring model) ----
  createOOOSeries: (record) => request('/ooo-series', { method: 'POST', body: JSON.stringify(record) }),
  endOOOSeries: (id, endDate) => request(`/ooo-series/${id}/end`, { method: 'PUT', body: JSON.stringify({ end_date: endDate }) }),
  purgeFutureOOOExceptions: (id, fromDate) => request(`/ooo-series/${id}/purge-future-exceptions`, { method: 'PUT', body: JSON.stringify({ from_date: fromDate }) }),
  createOOOException: (seriesId, record) => request(`/ooo-series/${seriesId}/exceptions`, { method: 'POST', body: JSON.stringify(record) }),
  markOOODeleted: (id) => request(`/ooo/${id}/mark-deleted`, { method: 'PUT' }),
  appendOOOComment: (id, text) => request(`/ooo/${id}/comments`, { method: 'PUT', body: JSON.stringify({ action: 'append', text }) }),
  deleteOOOComment: (id, commentId) => request(`/ooo/${id}/comments`, { method: 'PUT', body: JSON.stringify({ action: 'delete', commentId }) }),
  createOOO: (record) => request('/ooo', { method: 'POST', body: JSON.stringify(record) }),
  updateOOO: (id, record) => request(`/ooo/${id}`, { method: 'PUT', body: JSON.stringify(record) }),
  deleteOOO: (id) => request(`/ooo/${id}`, { method: 'DELETE' }),
  // ---- Tasks ----
  getMyTasks: () => request('/tasks'),
  getTaskBoard: () => request('/tasks/board'),
  createTask: (record) => request('/tasks', { method: 'POST', body: JSON.stringify(record) }),
  updateTask: (id, record) => request(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(record) }),
  appendTaskComment: (id, text) => request(`/tasks/${id}/comments`, { method: 'PUT', body: JSON.stringify({ action: 'append', text }) }),
  editTaskComment: (id, commentId, text) => request(`/tasks/${id}/comments`, { method: 'PUT', body: JSON.stringify({ action: 'edit', commentId, text }) }),
  deleteTaskComment: (id, commentId) => request(`/tasks/${id}/comments`, { method: 'PUT', body: JSON.stringify({ action: 'delete', commentId }) }),
  deleteTask: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),

  // ---- Chat ----
  getChatDirectory: () => request('/chat/directory'),
  getConversations: () => request('/chat/conversations'),
  createConversation: (record) => request('/chat/conversations', { method: 'POST', body: JSON.stringify(record) }),
  getMessages: (conversationId) => request(`/chat/conversations/${conversationId}/messages`),
  sendMessage: (conversationId, text) => request(`/chat/conversations/${conversationId}/messages`, { method: 'POST', body: JSON.stringify({ text }) }),
  addChatParticipant: (conversationId, username) => request(`/chat/conversations/${conversationId}/participants`, { method: 'POST', body: JSON.stringify({ username }) }),
  markConversationRead: (conversationId) => request(`/chat/conversations/${conversationId}/read`, { method: 'PUT' }),
  deleteConversation: (conversationId) => request(`/chat/conversations/${conversationId}`, { method: 'DELETE' }),

  submitTimeOffRequest: (record) => request('/time-off/requests', { method: 'POST', body: JSON.stringify(record) }),
  getMyTimeOffRequests: () => request('/time-off/requests'),
  getAllTimeOffRequests: (status) => request(`/time-off/requests?all=true${status ? `&status=${status}` : ''}`),
  approveTimeOffRequest: (id) => request(`/time-off/requests/${id}/approve`, { method: 'PUT' }),
  denyTimeOffRequest: (id, reviewNote) => request(`/time-off/requests/${id}/deny`, { method: 'PUT', body: JSON.stringify({ review_note: reviewNote }) }),
  editTimeOffRequest: (id, record) => request(`/time-off/requests/${id}`, { method: 'PUT', body: JSON.stringify(record) }),
  deleteTimeOffRequest: (id) => request(`/time-off/requests/${id}`, { method: 'DELETE' }),
  // Which approved My time entry a schedule block came from (for "Edit in My time").
  lookupTimeOffForOOO: ({ time_off_request_id, ooo_id, series_id, provider, type, date }) => {
    const params = new URLSearchParams();
    Object.entries({ time_off_request_id, ooo_id, series_id, provider, type, date }).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') params.set(k, String(v)); });
    return request(`/time-off/lookup?${params.toString()}`);
  },
  // Meeting agendas: recurring agenda + "this week only", or one agenda for a one-time meeting.
  getMeetingAgenda: (requestId, date) => request(`/time-off/requests/${requestId}/agenda${date ? `?date=${date}` : ''}`),
  saveMeetingAgenda: (requestId, record) => request(`/time-off/requests/${requestId}/agenda`, { method: 'PUT', body: JSON.stringify(record) }),
  // Agendas for older meeting blocks not linked to a My time entry.
  getBlockAgenda: ({ series_id, ooo_id, date }) => {
    const params = new URLSearchParams();
    Object.entries({ series_id, ooo_id, date }).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') params.set(k, String(v)); });
    return request(`/meeting-blocks/agenda?${params.toString()}`);
  },
  saveBlockAgenda: (record) => request('/meeting-blocks/agenda', { method: 'PUT', body: JSON.stringify(record) }),
  // One comment thread per meeting (per week for a recurring one), shared by everyone in it.
  getMeetingComments: (requestId, date) => request(`/time-off/requests/${requestId}/comments${date ? `?date=${date}` : ''}`),
  appendMeetingComment: (requestId, date, text) => request(`/time-off/requests/${requestId}/comments`, { method: 'PUT', body: JSON.stringify({ date, action: 'append', text }) }),
  deleteMeetingComment: (requestId, date, commentId) => request(`/time-off/requests/${requestId}/comments`, { method: 'PUT', body: JSON.stringify({ date, action: 'delete', commentId }) }),
  // Meetings someone else organized that I'm in.
  getMyMeetings: () => request('/time-off/meetings'),
  getMyTimeOffBalances: () => request('/time-off/balances'),
  getTimeOffBalancesFor: (username) => request(`/time-off/balances?username=${encodeURIComponent(username)}`),
  // Balance history (newest first) and the accrual rules for someone.
  // Without a username: your own. With one: admins only.
  // An admin correcting a week's hours worked: days = [{ date, worked }].
  editTimeOffWeekHours: (entryId, { username, days, reason }) => request(`/time-off/ledger/${encodeURIComponent(entryId)}/hours`, { method: 'PUT', body: JSON.stringify({ username, days, reason }) }),
  getTimeOffLedger: (username, type) => request(`/time-off/ledger?${new URLSearchParams({ ...(username ? { username } : {}), ...(type ? { type } : {}) })}`),
  // Scheduled hours a PTO/UPTO span would cost ({ hours }).
  getTimeOffEstimate: (record, username) => request(`/time-off/estimate?${new URLSearchParams({ start_date: record.start_date, end_date: record.end_date, start_time: record.start_time, end_time: record.end_time, ...(username ? { username } : {}) })}`),
  getTimeOffPolicy: (username) => request(`/time-off/policy${username ? `?username=${encodeURIComponent(username)}` : ''}`),
  // note: optional reason, shown in their Balance history.
  setTimeOffBalance: (username, balanceType, balanceHours, note) =>
    request('/time-off/balances', { method: 'PUT', body: JSON.stringify({ username, balance_type: balanceType, balance_hours: balanceHours, ...(note ? { note } : {}) }) }),
  // Admin: set someone's PTO to `hours` as of `asOfDate`; PTO taken since is subtracted.
  setPtoAsOf: (username, hours, asOfDate) => request('/time-off/balances/as-of', { method: 'PUT', body: JSON.stringify({ username, hours, as_of_date: asOfDate }) }),
  // Admin: every active employee's employment type, PTO, UPTO used this year and pending hours.
  getAllTimeOffBalances: () => request('/time-off/balances/all'),

  getMyProfile: () => request('/staff/me'),
  updateMyProfile: (record) => request('/staff/me', { method: 'PUT', body: JSON.stringify(record) }),
  getMyCredentials: () => request('/staff/credentials'),
  // Admin / Developer: someone else's credentials (their staff profile).
  // Everyone's credentials, providers first (Credentials page; Reception, Admin, Developer).
  getCredentialOverview: () => request('/credentials/overview'),
  getCredentialsFor: (username) => request(`/staff/credentials?username=${encodeURIComponent(username)}`),
  addCredential: (record) => request('/staff/credentials', { method: 'POST', body: JSON.stringify(record) }),
  updateCredential: (id, record) => request(`/staff/credentials/${id}`, { method: 'PUT', body: JSON.stringify(record) }),
  deleteCredential: (id) => request(`/staff/credentials/${id}`, { method: 'DELETE' }),

  getOfficeHours: () => request('/office-hours'),
  getClosedDates: (start, end) => request(`/office-hours/closed-dates?start=${start}&end=${end}`),
  getProviderContractedGaps: (providerName, start, end) =>
    request(`/providers/${encodeURIComponent(providerName)}/contracted-gaps?start=${start}&end=${end}`),
  // { start_time, end_time } or null: a provider's contracted hours on one date.
  getContractedHours: (providerName, date) => request(`/providers/${encodeURIComponent(providerName)}/contracted-hours?date=${date}`),
  // A provider's Outside hours sessions in a month: { sessions, hours } (My time).
  getOutsideHoursSummary: (month, provider) => request(`/appointments/outside-hours?month=${month}${provider ? `&provider=${encodeURIComponent(provider)}` : ''}`),
  getContractedGapsBatch: (start, end) => request(`/providers/contracted-gaps-batch?start=${start}&end=${end}`),
  setOfficeHours: (record) => request('/office-hours', { method: 'PUT', body: JSON.stringify(record) }),
  getOfficeClosures: () => request('/office-closures'),
  addOfficeClosure: (closureDate, reason, closureType = 'holiday') => request('/office-closures', { method: 'POST', body: JSON.stringify({ closure_date: closureDate, reason, closure_type: closureType }) }),

  // ---- Billing (routes/billing.js) ----
  // A provider's caseload now: patient, program, status, next appointment.
  getProviderCaseload: (provider) => request(`/providers/${encodeURIComponent(provider)}/caseload`),
  getBillingSheet: (provider, month) => request(`/billing?provider=${encodeURIComponent(provider || '')}&month=${month}`),
  setBillingReviewed: (provider, month, reviewed) => request('/billing/review', { method: 'PUT', body: JSON.stringify({ provider, month, reviewed }) }),
  // The "mandates" feature (src/brand.js featureOn): every provider's month,
  // each child's mandate week by week, and what needs attention.
  getBillingOverview: (month) => request(`/billing/overview?month=${month}`),
  getBillingMandates: (month) => request(`/billing/mandates?month=${month}`),
  getBillingAttention: (month) => request(`/billing/attention?month=${month}`),
  // The program a session bills under (EI asks why a child was absent).
  getBillingProgramOn: (patient, provider, date) => request(`/billing/program-on?${new URLSearchParams({ patient, provider, date })}`),
  // EI-Hub entry list (Billing page): a month's EI sessions, and ticking one as entered.
  getEiHubSessions: (month) => request(`/billing/ei-hub?month=${month}`),
  setEiHubEntered: (payload) => request('/billing/ei-hub/entered', { method: 'PUT', body: JSON.stringify(payload) }),
  // EI-Hub billing details (Admins and Developers): agency, providers, EI children.
  getEiSetup: () => request('/ei-hub/setup'),
  saveEiAgency: (data) => request('/ei-hub/setup/agency', { method: 'PUT', body: JSON.stringify(data) }),
  saveEiProvider: (name, data) => request(`/ei-hub/setup/providers/${encodeURIComponent(name)}`, { method: 'PUT', body: JSON.stringify(data) }),
  getEiChildren: () => request('/ei-hub/children'),
  saveEiChild: (id, data) => request(`/ei-hub/children/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  saveEiReferral: (authorization, data) => request(`/ei-hub/referrals/${encodeURIComponent(authorization)}`, { method: 'PUT', body: JSON.stringify(data) }),
  // Dated versions: correct one, or take back the newest.
  correctEiChildVersion: (id, versionId, data) => request(`/ei-hub/children/${id}/versions/${versionId}`, { method: 'PUT', body: JSON.stringify(data) }),
  takeBackEiChildVersion: (id, versionId) => request(`/ei-hub/children/${id}/versions/${versionId}`, { method: 'DELETE' }),
  correctEiReferral: (authorization, periodId, data) => request(`/ei-hub/referrals/${encodeURIComponent(authorization)}/periods/${periodId}`, { method: 'PUT', body: JSON.stringify(data) }),
  takeBackEiReferral: (authorization, periodId) => request(`/ei-hub/referrals/${encodeURIComponent(authorization)}/periods/${periodId}`, { method: 'DELETE' }),
  // Reception, Admins and Developers: one child's EI billing details (the chart's EI Billing tab).
  getEiPatient: (id) => request(`/ei-hub/patient/${id}`),
  // IFSP records and turning 3 (the "ei" feature, PedsDesk; API routes/ifsp.js).
  getIfsp: (patientId) => request(`/patients/${patientId}/ifsp`),
  addIfsp: (patientId, record) => request(`/patients/${patientId}/ifsps`, { method: 'POST', body: JSON.stringify(record) }),
  updateIfsp: (patientId, id, record) => request(`/patients/${patientId}/ifsps/${id}`, { method: 'PUT', body: JSON.stringify(record) }),
  deleteIfsp: (patientId, id) => request(`/patients/${patientId}/ifsps/${id}`, { method: 'DELETE' }),
  saveTransition: (patientId, record) => request(`/patients/${patientId}/transition`, { method: 'PUT', body: JSON.stringify(record) }),
  // EI session notes (the "ei" feature, PedsDesk; API routes/sessionNotes.js).
  getSessionNotes: (month, { provider, patientId } = {}) => request(`/session-notes?month=${month}${provider ? `&provider=${encodeURIComponent(provider)}` : ''}${patientId ? `&patient_id=${patientId}` : ''}`),
  getSessionNote: (key) => request(`/session-notes/note?key=${encodeURIComponent(key)}`),
  saveSessionNote: (record) => request('/session-notes/note', { method: 'PUT', body: JSON.stringify(record) }),
  parentSignSessionNote: (record) => request('/session-notes/note/parent-sign', { method: 'POST', body: JSON.stringify(record) }),
  providerSignSessionNote: (record) => request('/session-notes/note/provider-sign', { method: 'POST', body: JSON.stringify(record) }),
  addSessionNoteAddendum: (key, body) => request('/session-notes/note/addenda', { method: 'POST', body: JSON.stringify({ key, body }) }),
  sessionNoteParentLink: (key) => request('/session-notes/note/parent-link', { method: 'POST', body: JSON.stringify({ key }) }),
  supervisorSignSessionNote: (record) => request('/session-notes/note/supervisor-sign', { method: 'POST', body: JSON.stringify(record) }),
  getSessionNotesToCosign: () => request('/session-notes/cosign?mine=1'),
  getProgressReportsToCosign: () => request('/progress-reports/cosign?mine=1'),
  // A telehealth parent signs a session note from a secure link (no sign-in).
  getPublicSessionSign: (token) => request(`/sign/${encodeURIComponent(token)}`),
  unlockSessionSign: (token, dob) => request(`/sign/${encodeURIComponent(token)}/unlock`, { method: 'POST', body: JSON.stringify({ dob }) }),
  submitSessionSign: (token, record) => request(`/sign/${encodeURIComponent(token)}/submit`, { method: 'POST', body: JSON.stringify(record) }),
  // EI progress reports (the "ei" feature, PedsDesk; API routes/progressReports.js).
  getProgressReports: ({ patientId, provider } = {}) => request(`/progress-reports?${patientId ? `patient_id=${patientId}` : ''}${provider ? `&provider=${encodeURIComponent(provider)}` : ''}`),
  startProgressReport: (record) => request('/progress-reports', { method: 'POST', body: JSON.stringify(record) }),
  getProgressReport: (id) => request(`/progress-reports/${id}`),
  saveProgressReport: (id, record) => request(`/progress-reports/${id}`, { method: 'PUT', body: JSON.stringify(record) }),
  progressReportStep: (id, step, record) => request(`/progress-reports/${id}/${step}`, { method: 'POST', body: JSON.stringify(record || {}) }),
  // EI evaluation reports and the compliance dashboard (PedsDesk).
  getEvalReports: (month, provider) => request(`/eval-reports?month=${month}${provider ? `&provider=${encodeURIComponent(provider)}` : ''}`),
  getEvalReport: (key) => request(`/eval-reports/report?key=${encodeURIComponent(key)}`),
  saveEvalReport: (record) => request('/eval-reports/report', { method: 'PUT', body: JSON.stringify(record) }),
  evalReportStep: (step, record) => request(`/eval-reports/report/${step}`, { method: 'POST', body: JSON.stringify(record) }),
  getCompliance: () => request('/compliance'),
  getPatientRecord: (patientId) => request(`/session-notes/record?patient_id=${patientId}`),
  getServiceLog: (patientId, provider, month) => request(`/session-notes/service-log?patient_id=${patientId}&provider=${encodeURIComponent(provider)}&month=${month}`),
  // EI-Hub's Child Info and Authorizations report (Reception too): what it would change, then apply the ticked changes.
  previewEiImport: (file) => request('/ei-hub/import/preview', { method: 'POST', body: JSON.stringify(file) }),
  applyEiImport: (file, ids) => request('/ei-hub/import/apply', { method: 'POST', body: JSON.stringify({ ...file, ids }) }),
  getEiClaims: (month) => request(`/ei-hub/claims?month=${month}`),
  saveEiSessionCodes: (data) => request('/ei-hub/claims/codes', { method: 'PUT', body: JSON.stringify(data) }),
  createEiClaimFile: (data) => request('/ei-hub/claim-files', { method: 'POST', body: JSON.stringify(data) }),
  getEiClaimFile: (id) => request(`/ei-hub/claim-files/${id}`),
  deleteOfficeClosure: (id) => request(`/office-closures/${id}`, { method: 'DELETE' }),
  getProviderUsualSchedule: (providerName) => request(`/providers/${encodeURIComponent(providerName)}/usual-schedule`),
  // Scheduled changes to contracted hours (start date, optional end date, weekly hours).
  getScheduleChanges: (providerName) => request(`/providers/${encodeURIComponent(providerName)}/schedule-changes`),
  createScheduleChange: (providerName, record) => request(`/providers/${encodeURIComponent(providerName)}/schedule-changes`, { method: 'POST', body: JSON.stringify(record) }),
  updateScheduleChange: (id, record) => request(`/schedule-changes/${id}`, { method: 'PUT', body: JSON.stringify(record) }),
  deleteScheduleChange: (id) => request(`/schedule-changes/${id}`, { method: 'DELETE' }),
  setProviderUsualSchedule: (providerName, schedule) =>
    request(`/providers/${encodeURIComponent(providerName)}/usual-schedule`, { method: 'PUT', body: JSON.stringify({ schedule }) }),
};