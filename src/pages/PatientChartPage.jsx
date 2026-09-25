import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useTasks } from '../TasksContext';
import { useChat } from '../ChatContext';
import { useAuth } from '../AuthContext';
import { PatientModal } from './ManageDataPage';
import { useIsMobile } from '../useIsMobile';
import { PatientAlertsInline } from '../patientAlerts';
import { roomDisplayText, AppointmentModal, STATUS_OPTIONS, dateToInputValue } from './SchedulePage';

const PATIENT_CHART_PHONE_BREAKPOINT = 768;

const BRAND = { forest: '#6D28D9', brass: '#7C3AED', brassText: '#5B21B6', tint: '#F5F3FF', muted: '#6B6280', box: '#D6CCEF' };
const BRAND_SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';

function programColor(programValue) {
  const map = {
    EI: '#3b82f6', 'BCBS/Anthem': '#059669', 'BCBS/Anthen': '#059669', CIGNA: '#059669', CPSE: '#8b5cf6', CSE: '#8b5cf6',
    GHI: '#059669', P: '#059669', PP: '#059669', NONE: '#6b7280',
  };
  const first = (programValue || '').split(',')[0].trim();
  return map[first] || '#6b7280';
}

function formatDateMMDDYYYY(dateStr) {
  if (!dateStr) return dateStr;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!match) return dateStr;
  const [, year, month, day] = match;
  return `${month}.${day}.${year}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '--';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
function formatTime(timeStr) {
  if (!timeStr) return '--';
  const [h, m] = timeStr.slice(0, 5).split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayHour = h % 12 || 12;
  return `${displayHour}:${String(m).padStart(2, '0')} ${period}`;
}

function sectionHeaderStyle() {
  return { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: BRAND.muted, margin: '0 0 8px 0' };
}
function cardStyle() {
  return { border: `1.5px solid ${BRAND.box}`, borderRadius: 3, background: '#FCFBFE', padding: '12px 16px', marginBottom: 20 };
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, padding: '5px 0', borderBottom: '1px solid #EDE9F7' }}>
      <span style={{ color: BRAND.muted }}>{label}</span>
      <span style={{ color: '#241A33', fontWeight: 500, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function EmptyNote({ children }) {
  return <p style={{ fontSize: 13, color: BRAND.muted, margin: 0, fontStyle: 'italic' }}>{children}</p>;
}

// One appointment in the chart's lists. Click (or Enter) opens it in the
// same appointment window the schedule uses. Comments show as the red *
// after the time -- the same marker as the schedule's appointment cards.
function AppointmentRow({ apt, onOpen }) {
  const hasComments = !!(apt.comments && apt.comments.trim().length > 0);
  const bad = apt.appointment_status === 'Canceled' || apt.appointment_status === 'No Show';
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(apt)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(apt); } }}
      title="Open appointment"
      className="kl-chart-appt"
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 6px', margin: '0 -6px', borderBottom: '1px solid #EDE9F7', gap: 12, cursor: 'pointer', borderRadius: 6 }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#241A33', display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span>{formatDate(apt.appointment_date)} &middot; {formatTime(apt.appointment_time)}</span>
          {hasComments && <span title="Has comments" aria-label="Has comments" style={{ color: '#dc2626', fontWeight: 700, fontSize: 13, lineHeight: 1 }}>*</span>}
        </div>
        <div style={{ fontSize: 12, color: BRAND.muted, marginTop: 2 }}>
          {apt.provider}{apt.treatment_area ? ` \u00b7 ${roomDisplayText(apt.treatment_area)}` : ''} &middot; {apt.duration}min
        </div>
      </div>
      <span style={{
        fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap',
        color: bad ? '#A32D2D' : BRAND.brassText,
        border: `1.5px solid ${bad ? '#A32D2D' : BRAND.brass}`,
        borderRadius: 20, padding: '3px 10px',
      }}>
        {apt.appointment_status}
      </span>
    </div>
  );
}

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'documents', label: 'Documents' },
  { key: 'care-team', label: 'Care Team' },
];

function calculateAge(dobStr) {
  if (!dobStr) return null;
  const dob = new Date(dobStr + 'T00:00:00');
  const now = new Date();
  let years = now.getFullYear() - dob.getFullYear();
  let months = now.getMonth() - dob.getMonth();
  if (now.getDate() < dob.getDate()) months--;
  if (months < 0) { years--; months += 12; }
  // Pediatric therapy context: months matter a lot for very young children
  // (2y0m vs 2y9m is developmentally meaningful), less so once older.
  if (years < 1) return `${months} mo`;
  if (years < 3) return `${years}y ${months}mo`;
  return `${years} yrs`;
}

function findNextAppointment(appointments) {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const nowTime = now.toTimeString().slice(0, 8);
  const upcoming = (appointments || [])
    .filter(a => a.appointment_status !== 'Canceled')
    .filter(a => a.appointment_date > todayStr || (a.appointment_date === todayStr && a.appointment_time >= nowTime))
    .sort((a, b) => (a.appointment_date + a.appointment_time).localeCompare(b.appointment_date + b.appointment_time));
  return upcoming[0] || null;
}

function PatientBanner({ patient, appointments }) {
  const isMobile = useIsMobile(PATIENT_CHART_PHONE_BREAKPOINT);
  const age = calculateAge(patient.Date_of_Birth);
  const nextAppt = findNextAppointment(appointments);
  const programValues = (patient.Program || '').split(',').map(s => s.trim()).filter(Boolean);

  const facts = [
    { label: 'Age', value: age || '--' },
    { label: 'Next Appointment', value: nextAppt ? `${formatDate(nextAppt.appointment_date)} at ${formatTime(nextAppt.appointment_time)}` : 'None scheduled' },
    { label: 'RX Expiration', value: formatDateMMDDYYYY(patient.RX_Expiration) || '--' },
    { label: 'IFSP End Date', value: formatDateMMDDYYYY(patient.IFSP_End_Date) || '--' },
    { label: 'Report Date', value: formatDateMMDDYYYY(patient.Report_Date) || '--' },
    { label: 'Picture Consent', value: patient.Picture_Consent === true ? 'Yes' : patient.Picture_Consent === false ? 'No' : '--' },
  ];


  return (
    <div style={{ padding: isMobile ? '12px 16px 8px' : '14px 24px 10px', borderBottom: `1.5px solid ${BRAND.box}`, background: '#FCFBFE', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 14, flexWrap: 'wrap', marginBottom: 10 }}>
        <h1 style={{ fontFamily: BRAND_SERIF, fontSize: isMobile ? 19 : 26, fontWeight: 700, color: '#241A33', margin: 0, lineHeight: 1.15 }}>
          {patient.Name}
        </h1>
        {patient.mrn && (
          <span style={{ fontFamily: 'monospace', fontSize: 12, color: BRAND.muted }}>MRN {patient.mrn}</span>
        )}
        {programValues.map(prog => (
          <span key={prog} style={{
            fontSize: 10.5, fontWeight: 700, borderRadius: 4, padding: '3px 9px', letterSpacing: '0.02em', textTransform: 'uppercase',
            background: `color-mix(in srgb, ${programColor(prog)} 16%, white)`, color: programColor(prog),
          }}>
            {prog}
          </span>
        ))}
        {patient.Status && (
          <span style={{
            fontSize: 10.5, fontWeight: 700, color: BRAND.brassText, border: `1.5px solid ${BRAND.brass}`,
            borderRadius: 20, padding: '3px 10px', letterSpacing: '0.02em', textTransform: 'uppercase',
          }}>
            {patient.Status}
          </span>
        )}
        <PatientAlertsInline allergies={patient.Allergies} immunizations={patient.Immunizations} maxWidth={isMobile ? '100%' : '55%'} />
      </div>

      <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', flexWrap: 'wrap', rowGap: isMobile ? 4 : 6 }}>
        {facts.map((f, i) => (
          <div
            key={f.label}
            style={isMobile ? { display: 'flex', alignItems: 'baseline', gap: 6 } : {
              display: 'flex', alignItems: 'baseline', gap: 6, paddingRight: 20, marginRight: 20,
              borderRight: i < facts.length - 1 ? `1px solid ${BRAND.box}` : 'none',
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: BRAND.muted, whiteSpace: 'nowrap' }}>
              {f.label}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#241A33', whiteSpace: 'nowrap' }}>{f.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Sidebar({ patient, activeTab, setActiveTab, onBack, onEdit }) {
  const isMobile = useIsMobile(PATIENT_CHART_PHONE_BREAKPOINT);
  const programValues = (patient.Program || '').split(',').map(s => s.trim()).filter(Boolean);

  if (isMobile) {
    // The name/MRN/program badges are already shown in PatientBanner right
    // above this, so repeating them here would just take up scarce vertical
    // space on a phone. Back/Edit collapse to a single row, and tabs become
    // a horizontally scrollable strip instead of a vertical list.
    return (
      <div style={{ borderBottom: `1.5px solid ${BRAND.box}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px' }}>
          <button
            onClick={onBack}
            style={{ fontSize: 12.5, color: BRAND.muted, background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
          >
            &larr; Back
          </button>
          <button
            onClick={onEdit}
            style={{
              padding: '6px 12px', borderRadius: 4, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              border: `1.5px solid ${BRAND.forest}`, background: 'white', color: BRAND.forest,
            }}
          >
            Edit Patient
          </button>
        </div>
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', padding: '0 12px 10px', WebkitOverflowScrolling: 'touch' }}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                whiteSpace: 'nowrap', padding: '7px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: activeTab === tab.key ? 700 : 500,
                background: activeTab === tab.key ? BRAND.tint : 'transparent',
                color: activeTab === tab.key ? BRAND.brassText : '#374151',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: 240, flexShrink: 0, borderRight: `1.5px solid ${BRAND.box}`, padding: '24px 18px', boxSizing: 'border-box' }}>
      <button
        onClick={onBack}
        style={{ fontSize: 12.5, color: BRAND.muted, background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 4 }}
      >
        &larr; Back
      </button>

      <div style={{ fontFamily: BRAND_SERIF, fontSize: 22, fontWeight: 700, color: '#241A33', lineHeight: 1.2, marginBottom: 6 }}>
        {patient.Name}
      </div>
      {patient.mrn && (
        <div style={{ fontFamily: 'monospace', fontSize: 11, color: BRAND.muted, marginBottom: 10 }}>MRN {patient.mrn}</div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 14 }}>
        {programValues.map(prog => (
          <span key={prog} style={{
            fontSize: 10, fontWeight: 700, borderRadius: 3, padding: '2px 8px', letterSpacing: '0.02em', textTransform: 'uppercase',
            background: `color-mix(in srgb, ${programColor(prog)} 14%, white)`, color: programColor(prog),
          }}>
            {prog}
          </span>
        ))}
        {patient.Status && (
          <span style={{ fontSize: 10, color: BRAND.brassText, fontWeight: 700, border: `1.5px solid ${BRAND.brass}`, borderRadius: 20, padding: '2px 8px' }}>
            {patient.Status}
          </span>
        )}
      </div>

      <button
        onClick={onEdit}
        style={{
          width: '100%', padding: '7px 10px', borderRadius: 4, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
          border: `1.5px solid ${BRAND.forest}`, background: 'white', color: BRAND.forest, marginBottom: 22,
        }}
      >
        Edit Patient
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              textAlign: 'left', padding: '9px 12px', borderRadius: 4, border: 'none', cursor: 'pointer',
              fontSize: 13.5, fontWeight: activeTab === tab.key ? 700 : 500,
              background: activeTab === tab.key ? BRAND.tint : 'transparent',
              color: activeTab === tab.key ? BRAND.brassText : '#374151',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function OverviewTab({ patient, isMobile }) {
  return (
    <div>
      <p style={sectionHeaderStyle()}>Demographics</p>
      <div style={cardStyle()}>
        <InfoRow label="Date of Birth" value={formatDateMMDDYYYY(patient.Date_of_Birth)} />
        <InfoRow label="MRN" value={patient.mrn} />
        <InfoRow label="ID Number" value={patient.ID_Number} />
        <InfoRow label="Services" value={patient.Services} />
        <InfoRow label="Mandate" value={patient.Mandate} />
        <InfoRow label="Picture Consent" value={patient.Picture_Consent === true ? 'Yes' : patient.Picture_Consent === false ? 'No' : null} />
        {!patient.Date_of_Birth && !patient.ID_Number && !patient.Services && <EmptyNote>None on file</EmptyNote>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20 }}>
        <div>
          <p style={sectionHeaderStyle()}>Parent / Guardian</p>
          <div style={cardStyle()}>
            <InfoRow label="Name" value={patient.Parent_Name} />
            <InfoRow label="Relationship" value={patient.Relationship_To_Patient} />
            <InfoRow label="Phone" value={patient.Parent_Phone} />
            <InfoRow label="Email" value={patient.Parent_Email} />
            {!patient.Parent_Name && !patient.Parent_Phone && !patient.Parent_Email && <EmptyNote>None on file</EmptyNote>}
          </div>
        </div>
        <div>
          <p style={sectionHeaderStyle()}>SC / Admin Contact</p>
          <div style={cardStyle()}>
            <InfoRow label="Name" value={patient.SC_Admin_Name} />
            <InfoRow label="Phone" value={patient.SC_Admin_Phone} />
            <InfoRow label="Email" value={patient.SC_Admin_Email} />
            {!patient.SC_Admin_Name && !patient.SC_Admin_Phone && <EmptyNote>None on file</EmptyNote>}
          </div>
        </div>
      </div>

      <p style={sectionHeaderStyle()}>IFSP & Authorization</p>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20 }}>
        <div style={cardStyle()}>
          <InfoRow label="IFSP Type" value={patient.IFSP_Type} />
          <InfoRow label="IFSP Start" value={formatDateMMDDYYYY(patient.IFSP_Start_Date)} />
          <InfoRow label="IFSP End" value={formatDateMMDDYYYY(patient.IFSP_End_Date)} />
          <InfoRow label="Report Date" value={formatDateMMDDYYYY(patient.Report_Date)} />
          {!patient.IFSP_Type && !patient.IFSP_Start_Date && <EmptyNote>None on file</EmptyNote>}
        </div>
        <div style={cardStyle()}>
          <InfoRow label="RX Date" value={formatDateMMDDYYYY(patient.RX_Date)} />
          <InfoRow label="RX Expiration" value={formatDateMMDDYYYY(patient.RX_Expiration)} />
          <InfoRow label="Case Manager" value={patient.Case_Manager} />
          {!patient.RX_Date && !patient.Case_Manager && <EmptyNote>None on file</EmptyNote>}
        </div>
      </div>

      {patient.Scheduling_Notes && (
        <>
          <p style={sectionHeaderStyle()}>Notes</p>
          <div style={cardStyle()}>
            <p style={{ fontSize: 13, color: '#374151', whiteSpace: 'pre-wrap', margin: 0 }}>{patient.Scheduling_Notes}</p>
          </div>
        </>
      )}

      {patient.Google_Link && (
        <>
          <p style={sectionHeaderStyle()}>Google Link</p>
          <div style={cardStyle()}>
            <a
              href={patient.Google_Link}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 13, color: BRAND.forest, fontWeight: 600, wordBreak: 'break-all' }}
            >
              {patient.Google_Link}
            </a>
          </div>
        </>
      )}
    </div>
  );
}

// Appointments tab:
//   Upcoming (next 2 weeks) -- today + 13 days, earliest first, weekly
//                              recurring sessions included (computed on the
//                              server, like the schedule does)
//   Previous appointments   -- before today, most recent first
// Both narrowed by the Provider / Status filters.
const chronological = (a, b) => (a.appointment_date + (a.appointment_time || '')).localeCompare(b.appointment_date + (b.appointment_time || ''));

function AppointmentsTab({ patient, appointments, onChanged }) {
  // Fixed when the tab opens: today through 13 days out.
  const [{ todayStr, endStr }] = useState(() => {
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + 13);
    return { todayStr: dateToInputValue(now), endStr: dateToInputValue(end) };
  });
  const [nextTwoWeeks, setNextTwoWeeks] = useState(null); // null while loading
  const [providers, setProviders] = useState([]);
  const [providerFilter, setProviderFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [openAppt, setOpenAppt] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.getAppointmentsWindow(todayStr, endStr, patient.Name)
      .then(rows => { if (!cancelled) setNextTwoWeeks((rows || []).filter(a => a.patient_name === patient.Name)); })
      .catch(() => { if (!cancelled) setNextTwoWeeks([]); });
    return () => { cancelled = true; };
  }, [patient.Name, todayStr, endStr, reloadKey]);

  useEffect(() => { api.getProviders(true).then(p => setProviders(p || [])).catch(() => setProviders([])); }, []);

  // For the filter choices: everything on file plus this fortnight's
  // recurring sessions (computed weeks, not saved rows).
  const all = [...appointments, ...(nextTwoWeeks || [])];

  const providerOptions = [...new Set(all.map(a => a.provider).filter(Boolean))].sort();
  const statusOptions = [...new Set([...STATUS_OPTIONS, ...all.map(a => a.appointment_status).filter(Boolean)])];
  const matches = (a) => (!providerFilter || a.provider === providerFilter) && (!statusFilter || a.appointment_status === statusFilter);
  const upcoming = (nextTwoWeeks || []).filter(matches).sort(chronological);
  const past = appointments.filter(a => a.appointment_date < todayStr).filter(matches).sort((a, b) => chronological(b, a));
  const filtering = !!(providerFilter || statusFilter);

  const selectStyle = { padding: '6px 9px', borderRadius: 6, border: '1px solid #D6CCEF', fontSize: 12.5, background: 'white', color: '#241A33' };

  return (
    <div>
      <style>{'.kl-chart-appt:hover, .kl-chart-appt:focus-visible { background: #F5F3FF; outline: none; }'}</style>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, display: 'flex', alignItems: 'center', gap: 6 }}>
          Provider
          <select value={providerFilter} onChange={e => setProviderFilter(e.target.value)} style={selectStyle}>
            <option value="">All providers</option>
            {providerOptions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 12, fontWeight: 600, color: BRAND.muted, display: 'flex', alignItems: 'center', gap: 6 }}>
          Status
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectStyle}>
            <option value="">All statuses</option>
            {statusOptions.map(st => <option key={st} value={st}>{st}</option>)}
          </select>
        </label>
        {filtering && (
          <button type="button" onClick={() => { setProviderFilter(''); setStatusFilter(''); }} style={{ border: 'none', background: 'none', color: '#991B1B', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
            Clear filters
          </button>
        )}
      </div>

      <p style={sectionHeaderStyle()}>Upcoming (Next 2 Weeks)</p>
      <div style={{ ...cardStyle(), padding: '4px 16px' }}>
        {nextTwoWeeks === null ? (
          <EmptyNote>Loading...</EmptyNote>
        ) : upcoming.length === 0 ? (
          <EmptyNote>{filtering ? 'No appointments in the next 2 weeks match these filters.' : 'No appointments in the next 2 weeks.'}</EmptyNote>
        ) : (
          upcoming.map(apt => <AppointmentRow key={apt.id} apt={apt} onOpen={setOpenAppt} />)
        )}
      </div>

      <p style={sectionHeaderStyle()}>Previous Appointments</p>
      <div style={{ ...cardStyle(), padding: '4px 16px', maxHeight: 460, overflowY: 'auto' }}>
        {past.length === 0 ? (
          <EmptyNote>{filtering ? 'No previous appointments match these filters.' : 'No previous appointments on file.'}</EmptyNote>
        ) : (
          past.map(apt => <AppointmentRow key={apt.id} apt={apt} onOpen={setOpenAppt} />)
        )}
      </div>

      {openAppt && (
        <AppointmentModal
          providers={providers.filter(p => !p.archived)}
          existing={openAppt}
          defaultDate={new Date(openAppt.appointment_date + 'T00:00:00')}
          onClose={() => setOpenAppt(null)}
          onSaved={() => { setOpenAppt(null); setReloadKey(k => k + 1); onChanged?.(); }}
          onCommentsSynced={() => { setReloadKey(k => k + 1); onChanged?.(); }}
        />
      )}
    </div>
  );
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUploadedAt(isoString) {
  if (!isoString) return '';
  return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const DOCUMENT_TYPE_OPTIONS = ['Session Note', 'Treatment Goals', 'Admin Paperwork', 'Other'];

function providerDisplayName(firstName, lastName, credentials) {
  const name = [firstName, lastName].filter(Boolean).join(' ') || '(unknown)';
  return credentials ? `${name}, ${credentials}` : name;
}

function formatSignedAt(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) + ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function DocumentEditorModal({ patient, existing, onClose, onSaved }) {
  const [documentType, setDocumentType] = useState(existing ? existing.document_type : DOCUMENT_TYPE_OPTIONS[0]);
  const [subject, setSubject] = useState(existing ? existing.subject || '' : '');
  const [body, setBody] = useState(existing ? existing.body || '' : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSign = async () => {
    if (!subject.trim()) { setError('Subject is required before signing.'); return; }
    if (!documentType) { setError('Document type is required.'); return; }

    setSaving(true);
    setError(null);
    const record = { document_type: documentType, subject: subject.trim(), body };
    try {
      if (existing) {
        await api.updateClinicalDocument(existing.id, record);
      } else {
        await api.createClinicalDocument(patient.id, record);
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 20 }} onClick={onClose}>
      <div
        style={{ background: 'white', borderRadius: 8, width: '100%', maxWidth: 720, maxHeight: '88vh', display: 'flex', flexDirection: 'column', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '18px 24px', borderBottom: `1.5px solid ${BRAND.box}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontFamily: BRAND_SERIF, fontSize: 18, fontWeight: 700, margin: 0, color: '#241A33' }}>
            {existing ? 'Edit Document' : 'New Document'}
          </h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: BRAND.muted, lineHeight: 1 }}>&times;</button>
        </div>

        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          <label style={sectionHeaderStyle()}>Document Type</label>
          <select value={documentType} onChange={e => setDocumentType(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 4, border: `1.5px solid ${BRAND.box}`, fontSize: 13.5, boxSizing: 'border-box', marginBottom: 14 }}>
            {DOCUMENT_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <label style={sectionHeaderStyle()}>Subject *</label>
          <input
            value={subject}
            onChange={e => setSubject(e.target.value)}
            placeholder="Document title"
            style={{ width: '100%', padding: '8px 10px', borderRadius: 4, border: `1.5px solid ${BRAND.box}`, fontSize: 14, fontWeight: 600, boxSizing: 'border-box', marginBottom: 14 }}
          />

          <label style={sectionHeaderStyle()}>Document Body</label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Enter clinical documentation..."
            style={{ width: '100%', minHeight: 320, padding: '12px 14px', borderRadius: 4, border: `1.5px solid ${BRAND.box}`, fontSize: 13.5, fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box', resize: 'vertical' }}
          />

          {error && <p style={{ color: '#dc2626', fontSize: 13, marginTop: 10 }}>{error}</p>}
        </div>

        <div style={{ padding: '14px 24px', borderTop: `1.5px solid ${BRAND.box}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: 3, fontSize: 13, fontWeight: 600, border: `1.5px solid ${BRAND.box}`, background: 'white', color: '#374151', cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            onClick={handleSign}
            disabled={saving}
            style={{ padding: '9px 20px', borderRadius: 3, fontSize: 13, fontWeight: 700, border: 'none', background: BRAND.forest, color: 'white', cursor: 'pointer' }}
          >
            {saving ? 'Signing...' : 'Sign'}
          </button>
        </div>
      </div>
    </div>
  );
}

function UploadFileModal({ patient, onClose, onUploaded }) {
  const [file, setFile] = useState(null);
  const [documentType, setDocumentType] = useState(DOCUMENT_TYPE_OPTIONS[0]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const handleUpload = async () => {
    if (!file) { setError('Choose a file to upload.'); return; }
    setUploading(true);
    setError(null);
    try {
      const { uploadUrl, s3Key } = await api.getDocumentUploadUrl(patient.id, file.name, file.type);
      const uploadRes = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } });
      if (!uploadRes.ok) throw new Error('Upload to storage failed.');
      // The file's own name becomes its title -- no separate subject to type in.
      await api.registerPatientDocument(patient.id, { filename: file.name, s3_key: s3Key, content_type: file.type, file_size: file.size, document_type: documentType });
      onUploaded();
    } catch (err) {
      setError(err.message || 'Upload failed.');
    }
    setUploading(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 20 }} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 8, width: '100%', maxWidth: 440, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', padding: 24 }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontFamily: BRAND_SERIF, fontSize: 18, fontWeight: 700, margin: '0 0 16px', color: '#241A33' }}>Upload Document</h2>

        <label style={sectionHeaderStyle()}>Document Type</label>
        <select value={documentType} onChange={e => setDocumentType(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 4, border: `1.5px solid ${BRAND.box}`, fontSize: 13.5, boxSizing: 'border-box', marginBottom: 14 }}>
          {DOCUMENT_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <label style={sectionHeaderStyle()}>File</label>
        <input type="file" onChange={e => setFile(e.target.files[0] || null)} style={{ fontSize: 13, marginBottom: 4 }} />
        {file && <p style={{ fontSize: 11.5, color: BRAND.muted, margin: '4px 0 0' }}>Will be titled: <strong>{file.name}</strong></p>}

        {error && <p style={{ color: '#dc2626', fontSize: 13, marginTop: 10 }}>{error}</p>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: 3, fontSize: 13, fontWeight: 600, border: `1.5px solid ${BRAND.box}`, background: 'white', color: '#374151', cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={uploading || !file}
            style={{ padding: '9px 20px', borderRadius: 3, fontSize: 13, fontWeight: 700, border: 'none', background: BRAND.forest, color: 'white', cursor: 'pointer' }}
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DocumentsTab({ patient, isMobile }) {
  const [clinicalDocs, setClinicalDocs] = useState([]);
  const [fileDocs, setFileDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);
  const [editingDoc, setEditingDoc] = useState(null); // null = not editing; {} = new; {...doc} = editing existing clinical doc
  const [uploadingFile, setUploadingFile] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const loadAll = async () => {
    setLoading(true);
    try {
      const [clinical, files] = await Promise.all([
        api.getClinicalDocuments(patient.id),
        api.getPatientDocuments(patient.id),
      ]);
      setClinicalDocs(clinical || []);
      setFileDocs(files || []);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, [patient.id]);

  const merged = [
    ...clinicalDocs.map(d => ({
      key: `clinical-${d.id}`, kind: 'clinical', rawId: d.id, title: d.subject, document_type: d.document_type,
      date: d.signed_at || d.created_at, raw: d,
    })),
    ...fileDocs.map(d => ({
      key: `file-${d.id}`, kind: 'file', rawId: d.id, title: d.filename, document_type: d.document_type,
      date: d.uploaded_at, raw: d,
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  const filtered = merged.filter(item => {
    if (filterType && item.document_type !== filterType) return false;
    if (searchQuery && !item.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const selected = merged.find(item => item.key === selectedKey);

  useEffect(() => {
    if (!loading && selectedKey === null && merged.length > 0) setSelectedKey(merged[0].key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const handleEditorSaved = async () => {
    const wasEditingId = editingDoc?.id;
    setEditingDoc(null);
    await loadAll();
    if (wasEditingId) setSelectedKey(`clinical-${wasEditingId}`);
  };

  const handleUploaded = async () => {
    setUploadingFile(false);
    await loadAll();
  };

  const handleDownload = async (fileDoc) => {
    setError(null);
    try {
      const { downloadUrl } = await api.getDocumentDownloadUrl(fileDoc.id);
      window.open(downloadUrl, '_blank');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete "${item.title}"? This cannot be undone.`)) return;
    setError(null);
    try {
      if (item.kind === 'clinical') await api.deleteClinicalDocument(item.rawId);
      else await api.deletePatientDocument(item.rawId);
      if (selectedKey === item.key) setSelectedKey(null);
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexShrink: 0 }}>
        <button onClick={() => setEditingDoc({})} style={{ padding: '7px 14px', borderRadius: 4, fontSize: 12.5, fontWeight: 700, border: 'none', background: BRAND.forest, color: 'white', cursor: 'pointer' }}>
          + Create
        </button>
        <button onClick={() => setUploadingFile(true)} style={{ padding: '7px 14px', borderRadius: 4, fontSize: 12.5, fontWeight: 700, border: `1.5px solid ${BRAND.forest}`, background: 'white', color: BRAND.forest, cursor: 'pointer' }}>
          + Upload
        </button>
      </div>

      {error && <p style={{ color: '#dc2626', fontSize: 12.5, marginBottom: 10, flexShrink: 0 }}>{error}</p>}

      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 12 : 20, flex: 1, minHeight: 0 }}>
        <div style={{
          width: isMobile ? '100%' : 300, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0,
          maxHeight: isMobile ? '38vh' : 'none',
        }}>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by title..."
            style={{ padding: '7px 10px', borderRadius: 4, border: `1.5px solid ${BRAND.box}`, fontSize: 12.5, marginBottom: 6, boxSizing: 'border-box', flexShrink: 0 }}
          />
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 4, border: `1.5px solid ${BRAND.box}`, fontSize: 12.5, marginBottom: 10, boxSizing: 'border-box', flexShrink: 0 }}
          >
            <option value="">All document types</option>
            {DOCUMENT_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', border: `1.5px solid ${BRAND.box}`, borderRadius: 4 }}>
            {loading ? (
              <p style={{ fontSize: 13, color: BRAND.muted, padding: 14 }}>Loading...</p>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: BRAND.muted, margin: 0 }}>
                  {merged.length === 0 ? 'No documents yet.' : 'No documents match your search.'}
                </p>
              </div>
            ) : (
              filtered.map(item => (
                <div
                  key={item.key}
                  onClick={() => setSelectedKey(item.key)}
                  onDoubleClick={() => { if (item.kind === 'clinical') setEditingDoc(item.raw); }}
                  style={{
                    padding: '10px 14px', borderBottom: '1px solid #EDE9F7', cursor: 'pointer',
                    background: item.key === selectedKey ? BRAND.tint : 'white',
                    borderLeft: item.key === selectedKey ? `3px solid ${BRAND.forest}` : '3px solid transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#241A33', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {item.title}
                    </span>
                    {item.kind === 'file' && <span style={{ fontSize: 9, color: BRAND.muted, flexShrink: 0 }}>&#128206;</span>}
                  </div>
                  <div style={{ fontSize: 11, color: BRAND.muted, marginTop: 2 }}>{item.document_type || 'Uncategorized'}</div>
                  <div style={{ fontSize: 10.5, color: BRAND.muted, marginTop: 2 }}>
                    {formatDateMMDDYYYY(item.date?.slice(0, 10))}
                    {item.kind === 'clinical' && ` · ${providerDisplayName(item.raw.signer_first_name, item.raw.signer_last_name, null)}`}
                    {item.kind === 'file' && ` · ${item.raw.uploaded_by}`}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', border: `1.5px solid ${BRAND.box}`, borderRadius: 4, padding: isMobile ? '16px 18px' : '24px 32px', background: '#FCFBFE' }}>
          {!selected ? (
            <p style={{ fontSize: 13, color: BRAND.muted, fontStyle: 'italic' }}>Select a document to view it, or create/upload a new one.</p>
          ) : selected.kind === 'clinical' ? (
            <div onDoubleClick={() => setEditingDoc(selected.raw)} title="Double-click to edit">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: BRAND.brassText, margin: '0 0 6px' }}>
                    {selected.raw.document_type}
                  </p>
                  <h1 style={{ fontFamily: BRAND_SERIF, fontSize: 24, fontWeight: 700, color: '#241A33', margin: '0 0 18px' }}>
                    {selected.raw.subject}
                  </h1>
                </div>
                <button onClick={() => handleDelete(selected)} style={{ border: 'none', background: 'none', color: '#A32D2D', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', padding: 0, flexShrink: 0 }}>
                  Delete
                </button>
              </div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.7, color: '#241A33', marginBottom: 30 }}>
                {selected.raw.body || <span style={{ color: BRAND.muted, fontStyle: 'italic' }}>(no content)</span>}
              </div>
              <div style={{ borderTop: `1.5px solid ${BRAND.box}`, paddingTop: 14 }}>
                <p style={{ fontFamily: BRAND_SERIF, fontSize: 14, fontWeight: 700, color: '#241A33', margin: 0 }}>
                  {providerDisplayName(selected.raw.signer_first_name, selected.raw.signer_last_name, selected.raw.signer_credentials)}
                </p>
                <p style={{ fontSize: 12, color: BRAND.muted, margin: '2px 0 0' }}>
                  Signed: {formatSignedAt(selected.raw.signed_at)}
                </p>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: BRAND.brassText, margin: '0 0 6px' }}>
                    {selected.raw.document_type || 'Uncategorized'}
                  </p>
                  <h1 style={{ fontFamily: BRAND_SERIF, fontSize: 24, fontWeight: 700, color: '#241A33', margin: '0 0 18px', wordBreak: 'break-word' }}>
                    {selected.raw.filename}
                  </h1>
                </div>
                <button onClick={() => handleDelete(selected)} style={{ border: 'none', background: 'none', color: '#A32D2D', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', padding: 0, flexShrink: 0 }}>
                  Delete
                </button>
              </div>
              <p style={{ fontSize: 13, color: BRAND.muted, marginBottom: 24 }}>
                Uploaded {formatUploadedAt(selected.raw.uploaded_at)} by {selected.raw.uploaded_by}
                {selected.raw.file_size ? ` · ${formatFileSize(selected.raw.file_size)}` : ''}
              </p>
              <button
                onClick={() => handleDownload(selected.raw)}
                style={{ padding: '9px 18px', borderRadius: 4, fontSize: 13, fontWeight: 700, border: 'none', background: BRAND.forest, color: 'white', cursor: 'pointer' }}
              >
                Download File
              </button>
            </div>
          )}
        </div>
      </div>

      {editingDoc !== null && (
        <DocumentEditorModal
          patient={patient}
          existing={editingDoc.id ? editingDoc : null}
          onClose={() => setEditingDoc(null)}
          onSaved={handleEditorSaved}
        />
      )}
      {uploadingFile && (
        <UploadFileModal patient={patient} onClose={() => setUploadingFile(false)} onUploaded={handleUploaded} />
      )}
    </div>
  );
}

function CareTeamTab({ patient, appointments }) {
  const navigate = useNavigate();
  const { openDrawerWithPrefill } = useTasks();
  const { openNewChat } = useChat();

  const todayStr = new Date().toISOString().slice(0, 10);
  const providerNames = [...new Set(appointments.map(a => a.provider).filter(Boolean))];
  const currentProviders = providerNames.filter(p => appointments.some(a => a.provider === p && a.appointment_date >= todayStr && a.appointment_status !== 'Canceled'));
  const pastOnlyProviders = providerNames.filter(p => !currentProviders.includes(p));

  return (
    <div>
      <p style={sectionHeaderStyle()}>Quick Actions</p>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <button
          onClick={() => openDrawerWithPrefill(`Re: ${patient.Name} - `)}
          style={{ padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, border: `1.5px solid ${BRAND.forest}`, background: 'white', color: BRAND.forest, cursor: 'pointer' }}
        >
          + Assign a Task
        </button>
        <button
          onClick={openNewChat}
          style={{ padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, border: `1.5px solid ${BRAND.forest}`, background: 'white', color: BRAND.forest, cursor: 'pointer' }}
        >
          + Start a Chat
        </button>
      </div>

      <p style={sectionHeaderStyle()}>Case Management</p>
      <div style={cardStyle()}>
        <InfoRow label="Case Manager" value={patient.Case_Manager} />
        {!patient.Case_Manager && <EmptyNote>No case manager assigned.</EmptyNote>}
      </div>

      <p style={sectionHeaderStyle()}>Current Providers</p>
      <div style={cardStyle()}>
        {currentProviders.length === 0 ? (
          <EmptyNote>No upcoming appointments with a provider on file.</EmptyNote>
        ) : (
          currentProviders.map(p => <InfoRow key={p} label="Provider" value={p} />)
        )}
      </div>

      {pastOnlyProviders.length > 0 && (
        <>
          <p style={sectionHeaderStyle()}>Previously Seen</p>
          <div style={cardStyle()}>
            {pastOnlyProviders.map(p => <InfoRow key={p} label="Provider" value={p} />)}
          </div>
        </>
      )}
    </div>
  );
}

export default function PatientChartPage() {
  const { name } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile(PATIENT_CHART_PHONE_BREAKPOINT);
  const [patient, setPatient] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [editingPatient, setEditingPatient] = useState(false);
  const reloadAppointments = () => { api.getPatientAppointments(name).then(a => setAppointments(a || [])).catch(() => {}); };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    (async () => {
      try {
        const [patientData, apptData] = await Promise.all([
          api.getPatient(name),
          api.getPatientAppointments(name),
        ]);
        if (cancelled) return;
        if (!patientData) {
          setNotFound(true);
        } else {
          setPatient(patientData);
          setAppointments(apptData || []);
        }
      } catch (err) {
        if (!cancelled) setNotFound(true);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [name]);

  if (loading) {
    return <div style={{ padding: 40, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', color: BRAND.muted, fontSize: 13 }}>Loading chart...</div>;
  }

  if (notFound || !patient) {
    return (
      <div style={{ padding: 40, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
        <p style={{ fontSize: 13, color: BRAND.muted }}>No matching patient record found for "{name}".</p>
        <button onClick={() => navigate(-1)} style={{ fontSize: 13, color: BRAND.forest, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
          &larr; Back
        </button>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', display: 'flex', flexDirection: 'column', height: '100vh', boxSizing: 'border-box' }}>
      <PatientBanner patient={patient} appointments={appointments} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: isMobile ? 'column' : 'row' }}>
        <Sidebar patient={patient} activeTab={activeTab} setActiveTab={setActiveTab} onBack={() => navigate(-1)} onEdit={() => setEditingPatient(true)} />
        <div style={{
          flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
          overflowY: activeTab === 'documents' ? 'hidden' : 'auto',
          padding: activeTab === 'documents' ? (isMobile ? '12px 12px' : '20px 24px') : (isMobile ? '16px 16px 40px' : '28px 32px 60px'),
          maxWidth: activeTab === 'documents' || isMobile ? 'none' : 820,
        }}>
          {activeTab === 'overview' && <OverviewTab patient={patient} isMobile={isMobile} />}
          {activeTab === 'appointments' && <AppointmentsTab patient={patient} appointments={appointments} onChanged={reloadAppointments} />}
          {activeTab === 'documents' && <DocumentsTab patient={patient} isMobile={isMobile} />}
          {activeTab === 'care-team' && <CareTeamTab patient={patient} appointments={appointments} />}
        </div>
      </div>
      {editingPatient && (
        <PatientModal
          existing={patient}
          onClose={() => setEditingPatient(false)}
          onSaved={(saved) => {
            setEditingPatient(false);
            // If the save renamed the patient, the current URL (keyed by the
            // old name) is now stale -- navigate to the new one instead of
            // just refetching, which would come back empty.
            if (saved && saved.Name && saved.Name !== patient.Name) {
              navigate(`/patients/${encodeURIComponent(saved.Name)}`, { replace: true });
            } else {
              setPatient(saved || patient);
            }
          }}
        />
      )}
    </div>
  );
}
