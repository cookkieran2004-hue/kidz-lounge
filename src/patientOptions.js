import { CLINIC } from './brand';

// The lists a clinic sets for its patients and schedule (Oct 2026): one
// place, read from the clinic's brand file (`patientOptions` in
// src/brands/<clinic>.js). Kidz Lounge's are its long-standing lists;
// PedsDesk's fit an NYC Early Intervention agency.
const o = CLINIC.patientOptions || {};

export const PROGRAM_OPTIONS = o.programs || ['EI', 'BCBS/Anthem', 'CIGNA', 'CPSE', 'CSE', 'GHI', 'P', 'PP', 'NONE'];
// "On Program" and "Off Program" must be in every list: the API and the
// waitlist use them.
export const PATIENT_STATUS_OPTIONS = o.statuses || ['On Program', 'Awaiting Approval', 'Awaiting Family Paperwork', 'Awaiting Supervision Form', 'Off Program', 'Awaiting EI HUB'];
// Programs the patient list's "Insurance" filter matches.
export const INSURANCE_PROGRAM_VALUES = o.insurancePrograms || ['BCBS/Anthem', 'BCBS/Anthen', 'PP', 'P', 'GHI', 'CIGNA'];
// In-office rooms (the schedule's Room view and the appointment form).
export const ROOM_OPTIONS = o.rooms || ['Green', 'Yellow', 'Orange A', 'Orange B', 'Purple', 'Gym A', 'Gym B', 'Gym Table'];
// The patient list's case manager pills: a fixed list ({ label,
// caseManager: first name }), or, when the clinic sets none, one pill per
// case manager the patients actually have.
export const CASE_MANAGER_PILLS = o.caseManagerPills || null;

const programsOf = (value) => (Array.isArray(value) ? value : String(value || '').split(',')).map(s => String(s).trim()).filter(Boolean);
// Whether the prescription (RX) fields apply to a patient with these
// programs and services: always, unless the clinic limits them. PedsDesk:
// insurance, and any child getting PT or OT (NYC EI requires a physician's
// or NP's order for those: 10 NYCRR 69-4.11(a)(10); NYC citation #5).
export const rxApplies = (programs, services) => !o.rxOnlyFor
  || programsOf(programs).some(p => o.rxOnlyFor.includes(p))
  || programsOf(services).some(s => (o.rxServices || []).includes(s));
