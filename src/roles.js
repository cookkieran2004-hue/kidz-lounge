// Staff roles and what each may do. Mirrors kidz-lounge-api/lib/roles.js,
// which enforces the same rules on the server.
//
//   staff      Their own schedule, time off, tasks and profile.
//   reception  Everything an admin can do except the Admin area.
//   admin      Everything.
//   developer  Everything an admin can; never gets the system's
//              patient-related tasks (RX / IFSP deadlines, reports).

export const ROLES = ['staff', 'reception', 'admin', 'developer'];
export const ROLE_LABELS = { staff: 'Staff', reception: 'Reception', admin: 'Admin', developer: 'Developer' };
export const ROLE_HINTS = {
  staff: 'Their own schedule, time off, tasks and profile.',
  reception: 'Same as Admin everywhere except the Admin area (staff accounts, time-off approvals, office hours).',
  admin: 'Full access, including the Admin area.',
  developer: 'Full access, plus support tickets. Never assigned the system\'s patient tasks (RX, IFSP, reports) and can\'t be a case manager.',
};
export const roleLabel = (role) => ROLE_LABELS[role] || 'Staff';

// Admin-level actions outside the Admin area (anyone's schedule, patients,
// tasks, comments).
export const canManage = (user) => ['reception', 'admin', 'developer'].includes(user?.role);
// Who can be picked as a patient's case manager: not Developers. Directory
// entries carry the server's `can_case_manage`; `keep` is the patient's
// current case manager, still listed so an existing link shows (and saves)
// as-is.
export const caseManagerChoices = (directory, keep) =>
  directory.filter(s => s.can_case_manage !== false || s.username === keep);
// The HIPAA audit log tab in Admin (mirrors the API's canViewAuditLog).
export const canViewAuditLog = (user) => user?.role === 'developer';
// The EI-Hub Entry tab on the Billing page: Admins and Developers (Kieran,
// Oct 2026), not Reception. Mirrors the API's canUseEiHub.
export const canUseEiHub = (user) => ['admin', 'developer'].includes(user?.role);
// The Admin area: the Admin page and what's behind it.
export const canAdminister = (user) => ['admin', 'developer'].includes(user?.role);
