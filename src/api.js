const API_BASE = import.meta.env.VITE_API_URL;
const TOKEN_KEY = 'kidz_lounge_token';

// sessionStorage (not localStorage) is deliberate: it persists across page
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
  // Inbox: the support owner (KJC135) only.
  getSupportOpenCount: () => request('/support/tickets/open-count'),
  getSupportTickets: (status) => request(`/support/tickets${status ? `?status=${status}` : ''}`),
  updateSupportTicket: (id, record) => request(`/support/tickets/${id}`, { method: 'PUT', body: JSON.stringify(record) }),
  // "Your ticket was resolved" popups for the signed-in sender.
  getMySupportNotices: () => request('/support/my-notices'),
  markSupportNoticeSeen: (id) => request(`/support/my-notices/${id}/seen`, { method: 'PUT' }),

  // ---- Auth ----
  login: (username, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  me: () => request('/auth/me'),
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
  deletePatient: (id, force = false) => request(`/patients/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' }),

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
  setTimeOffBalance: (username, balanceType, balanceHours) =>
    request('/time-off/balances', { method: 'PUT', body: JSON.stringify({ username, balance_type: balanceType, balance_hours: balanceHours }) }),

  getMyProfile: () => request('/staff/me'),
  updateMyProfile: (record) => request('/staff/me', { method: 'PUT', body: JSON.stringify(record) }),
  getMyCredentials: () => request('/staff/credentials'),
  addCredential: (record) => request('/staff/credentials', { method: 'POST', body: JSON.stringify(record) }),
  updateCredential: (id, record) => request(`/staff/credentials/${id}`, { method: 'PUT', body: JSON.stringify(record) }),
  deleteCredential: (id) => request(`/staff/credentials/${id}`, { method: 'DELETE' }),

  getOfficeHours: () => request('/office-hours'),
  getClosedDates: (start, end) => request(`/office-hours/closed-dates?start=${start}&end=${end}`),
  getProviderContractedGaps: (providerName, start, end) =>
    request(`/providers/${encodeURIComponent(providerName)}/contracted-gaps?start=${start}&end=${end}`),
  getContractedGapsBatch: (start, end) => request(`/providers/contracted-gaps-batch?start=${start}&end=${end}`),
  setOfficeHours: (record) => request('/office-hours', { method: 'PUT', body: JSON.stringify(record) }),
  getOfficeClosures: () => request('/office-closures'),
  addOfficeClosure: (closureDate, reason) => request('/office-closures', { method: 'POST', body: JSON.stringify({ closure_date: closureDate, reason }) }),
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