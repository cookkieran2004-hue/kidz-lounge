import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useIsMobile } from '../useIsMobile';
import { useStaffNames } from '../staffDirectory';
import { PageHeader, Card, Tag, UnderlineTabs } from '../dashboardUi';
import { INK, MUTED, SUBTLE, HAIRLINE, PAGE_BG, FONT, NUMERIC, TONES, buttonStyle } from '../uiTokens';
import { DISCIPLINES, DISCIPLINE_NAMES, disciplinesOf } from '../disciplines';
import { DateField, TimeField, AppointmentModal, dateToInputValue, formatSlotLabel } from './SchedulePage';
import { PatientModal } from './ManageDataPage';
import Linkify from '../Linkify';

// Waitlist: patients waiting to start a service, one entry per patient per
// specialty (kidz-lounge-api/routes/waitlist.js), longest wait first.
// Everyone can see and change it. "Schedule appointment" opens the normal
// appointment form pre-filled; once that's saved the entry is marked
// Scheduled and moves to History.

const WEEKDAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri']];
const STATUS_TAG = {
  waiting: { tone: 'neutral', label: 'Waiting' },
  contacted: { tone: 'accent', label: 'Contacted' },
  scheduled: { tone: 'success', label: 'Scheduled' },
  removed: { tone: 'neutral', label: 'Removed' },
};

const todayStr = () => dateToInputValue(new Date());
const toDate = (s) => new Date(`${String(s).slice(0, 10)}T00:00:00`);
const shortDate = (s) => toDate(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: toDate(s).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000);

function waitText(days) {
  if (days <= 0) return 'Today';
  if (days === 1) return '1 day';
  if (days < 14) return `${days} days`;
  if (days < 70) return `${Math.floor(days / 7)} weeks`;
  return `${Math.floor(days / 30)} months`;
}

function availabilityText(e) {
  const days = (e.available_days || []).map(Number);
  const dayPart = days.length === 0 || days.length === 5 ? 'Any day' : WEEKDAYS.filter(([n]) => days.includes(n)).map(([, l]) => l).join(', ');
  const from = e.available_from ? formatSlotLabel(e.available_from.slice(0, 5)) : null;
  const to = e.available_to ? formatSlotLabel(e.available_to.slice(0, 5)) : null;
  const timePart = from && to ? `${from} – ${to}` : from ? `after ${from}` : to ? `before ${to}` : 'any time';
  return `${dayPart} · ${timePart}`;
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: 13.5, fontFamily: 'inherit', color: INK,
  border: `1px solid ${HAIRLINE}`, borderRadius: 6, background: 'white',
};
const labelStyle = { display: 'block', fontSize: 12.5, fontWeight: 500, color: MUTED, marginBottom: 5 };
const chip = (on) => ({
  padding: '5px 10px', fontSize: 12.5, fontWeight: 500, fontFamily: 'inherit', borderRadius: 6, cursor: 'pointer',
  border: `1px solid ${on ? INK : HAIRLINE}`, background: on ? INK : 'white', color: on ? 'white' : INK,
});

// ---------------------------------------------------------------------------
// Add / edit an entry
// ---------------------------------------------------------------------------
function PatientPicker({ patients, value, onChange, onNewPatient }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const chosen = patients.find(p => p.id === value);
  const matches = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return [];
    return patients.filter(p => (p.Name || '').toLowerCase().includes(q)).slice(0, 8);
  }, [patients, text]);

  if (chosen) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, ...inputStyle, padding: '7px 10px' }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 500 }}>{chosen.Name}</span>
          {chosen.Program && <span style={{ color: MUTED, fontSize: 12.5 }}> · {chosen.Program}</span>}
        </span>
        <button type="button" onClick={() => { onChange(null); setText(''); }} style={buttonStyle('text', { fontSize: 12.5 })}>Change</button>
      </div>
    );
  }
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          style={{ ...inputStyle, flex: 1 }} value={text} placeholder="Search patients by name" autoFocus
          onChange={e => { setText(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)} aria-label="Search patients"
        />
        <button type="button" onClick={() => onNewPatient(text.trim())} style={buttonStyle('secondary')}>New patient</button>
      </div>
      {open && text.trim() && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 4, background: 'white', border: `1px solid ${HAIRLINE}`, borderRadius: 6, zIndex: 5, maxHeight: 240, overflowY: 'auto' }}>
          {matches.length === 0 && (
            <div style={{ padding: '9px 10px', fontSize: 13, color: MUTED }}>
              No patient named "{text.trim()}". Use New patient to add them.
            </div>
          )}
          {matches.map(p => (
            <button
              key={p.id} type="button" onMouseDown={e => e.preventDefault()} onClick={() => { onChange(p.id); setOpen(false); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none', borderBottom: `1px solid ${HAIRLINE}`, background: 'white', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, color: INK }}
            >
              {p.Name}
              {(p.Program || p.Status) && <span style={{ color: MUTED, fontSize: 12.5 }}> · {[p.Program, p.Status].filter(Boolean).join(' · ')}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ProviderSelect({ providers, specialty, value, onChange, id }) {
  const matching = providers.filter(p => disciplinesOf(p).has(specialty));
  // Keep a saved choice visible even if their specialty has changed since.
  const list = value && !matching.some(p => p.Name === value) ? [...matching, { id: 'current', Name: value }] : matching;
  return (
    <select id={id} style={inputStyle} value={value || ''} onChange={e => onChange(e.target.value)}>
      <option value="">Any {specialty} provider</option>
      {list.map(p => <option key={p.id} value={p.Name}>{p.Name}</option>)}
    </select>
  );
}

function EntryModal({ existing, patients, providers, onPatientCreated, onClose, onSaved }) {
  const isMobile = useIsMobile(640);
  const [patientId, setPatientId] = useState(existing?.patient_id || null);
  const [specialties, setSpecialties] = useState(existing ? [existing.specialty] : []);
  const [providerBySpecialty, setProviderBySpecialty] = useState(existing ? { [existing.specialty]: existing.preferred_provider || '' } : {});
  const [days, setDays] = useState((existing?.available_days || []).map(Number));
  const [from, setFrom] = useState(existing?.available_from?.slice(0, 5) || '');
  const [to, setTo] = useState(existing?.available_to?.slice(0, 5) || '');
  const [referralDate, setReferralDate] = useState(existing ? String(existing.referral_date).slice(0, 10) : todayStr());
  const [status, setStatus] = useState(existing?.status || 'waiting');
  const [notes, setNotes] = useState(existing?.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [newPatientName, setNewPatientName] = useState(null); // string while the patient form is open

  const toggleSpecialty = (s) => {
    if (existing) { setSpecialties([s]); return; } // an entry is one specialty
    setSpecialties(list => list.includes(s) ? list.filter(x => x !== s) : [...list, s]);
  };
  const toggleDay = (d) => setDays(list => list.includes(d) ? list.filter(x => x !== d) : [...list, d].sort());

  const save = async () => {
    if (!patientId) { setError('Choose a patient, or add a new one.'); return; }
    if (!specialties.length) { setError('Choose the specialty they\'re waiting for.'); return; }
    if (from && to && from >= to) { setError('The latest time has to be after the earliest time.'); return; }
    setSaving(true); setError(null);
    const common = { available_days: days, available_from: from || null, available_to: to || null, referral_date: referralDate, notes };
    try {
      if (existing) {
        await api.updateWaitlistEntry(existing.id, {
          ...common, specialty: specialties[0], preferred_provider: providerBySpecialty[specialties[0]] || null, status,
        });
      } else {
        await api.createWaitlistEntries({ ...common, patient_id: patientId, specialties, providers: providerBySpecialty });
      }
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true); setError(null);
    try {
      await api.updateWaitlistEntry(existing.id, { status: 'removed' });
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const patient = patients.find(p => p.id === patientId);
  const grid = isMobile ? '1fr' : '1fr 1fr';

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(24,24,27,0.45)', display: 'flex', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'center', zIndex: 10000, padding: isMobile ? 0 : 20 }} onMouseDown={e => { if (e.target === e.currentTarget && !saving) onClose(); }}>
        <div role="dialog" aria-modal="true" aria-labelledby="kl-waitlist-title" style={{ background: 'white', borderRadius: isMobile ? 0 : 8, width: '100%', maxWidth: 600, maxHeight: isMobile ? '100dvh' : 'calc(100dvh - 40px)', overflowY: 'auto', fontFamily: FONT, color: INK }}>
          <div style={{ padding: '18px 22px', borderBottom: `1px solid ${HAIRLINE}` }}>
            <h2 id="kl-waitlist-title" style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>{existing ? 'Edit waitlist entry' : 'Add to waitlist'}</h2>
            {existing && patient && (
              <p style={{ fontSize: 13, color: MUTED, margin: '4px 0 0' }}>
                {[patient.Parent_Name, patient.Parent_Phone].filter(Boolean).join(' · ') || 'No parent contact on file'}
              </p>
            )}
          </div>

          <div style={{ padding: '18px 22px', display: 'grid', gap: 16 }}>
            <div>
              <span style={labelStyle}>Patient</span>
              {existing ? (
                <div style={{ fontSize: 14, fontWeight: 500 }}>{existing.patient_name}</div>
              ) : (
                <PatientPicker patients={patients} value={patientId} onChange={setPatientId} onNewPatient={(name) => setNewPatientName(name)} />
              )}
            </div>

            <div>
              <span style={labelStyle}>{existing ? 'Specialty' : 'Waiting for'}</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Specialty">
                {DISCIPLINES.map(s => (
                  <button key={s} type="button" aria-pressed={specialties.includes(s)} onClick={() => toggleSpecialty(s)} style={chip(specialties.includes(s))} title={DISCIPLINE_NAMES[s]}>{s}</button>
                ))}
              </div>
              {!existing && specialties.length > 1 && (
                <p style={{ fontSize: 12.5, color: MUTED, margin: '6px 0 0' }}>Adds {specialties.length} entries, one per specialty, so each can be scheduled on its own.</p>
              )}
            </div>

            {specialties.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: specialties.length > 1 ? grid : '1fr', gap: 12 }}>
                {specialties.map(s => (
                  <div key={s}>
                    <label htmlFor={`kl-wl-provider-${s}`} style={labelStyle}>Preferred {s} provider</label>
                    <ProviderSelect id={`kl-wl-provider-${s}`} providers={providers} specialty={s} value={providerBySpecialty[s] || ''} onChange={v => setProviderBySpecialty(m => ({ ...m, [s]: v }))} />
                  </div>
                ))}
              </div>
            )}

            <div>
              <span style={labelStyle}>Availability</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Available days">
                {WEEKDAYS.map(([n, l]) => <button key={n} type="button" aria-pressed={days.includes(n)} onClick={() => toggleDay(n)} style={chip(days.includes(n))}>{l}</button>)}
              </div>
              <p style={{ fontSize: 12.5, color: MUTED, margin: '6px 0 10px' }}>{days.length ? 'Only these days.' : 'No days picked means any day.'}</p>
              <div style={{ display: 'grid', gridTemplateColumns: grid, gap: 12 }}>
                <div><span style={labelStyle}>Earliest</span><TimeField value={from} onChange={setFrom} clearable placeholder="Any time" style={inputStyle} ariaLabel="Earliest time" /></div>
                <div><span style={labelStyle}>Latest</span><TimeField value={to} onChange={setTo} clearable placeholder="Any time" style={inputStyle} ariaLabel="Latest time" /></div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: existing ? grid : '1fr', gap: 12 }}>
              <div>
                <span style={labelStyle}>Referral date</span>
                <DateField value={referralDate} onChange={v => setReferralDate(v || todayStr())} max={todayStr()} style={inputStyle} ariaLabel="Referral date" />
              </div>
              {existing && (
                <div>
                  <label htmlFor="kl-wl-status" style={labelStyle}>Status</label>
                  <select id="kl-wl-status" style={inputStyle} value={status} onChange={e => setStatus(e.target.value)}>
                    <option value="waiting">Waiting</option>
                    <option value="contacted">Contacted</option>
                  </select>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="kl-wl-notes" style={labelStyle}>Notes</label>
              <textarea id="kl-wl-notes" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Referral source, calls made, anything the scheduler should know" style={{ ...inputStyle, resize: 'vertical' }} />
            </div>

            {error && <p style={{ fontSize: 13, color: TONES.danger.fg, background: TONES.danger.bg, borderRadius: 6, padding: '8px 10px', margin: 0 }}>{error}</p>}
          </div>

          <div style={{ padding: '14px 22px', borderTop: `1px solid ${HAIRLINE}`, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {existing && !confirmRemove && (
              <button type="button" onClick={() => setConfirmRemove(true)} disabled={saving} style={buttonStyle('danger')}>Remove from waitlist</button>
            )}
            {existing && confirmRemove && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                Remove from the {existing.specialty} waitlist?
                <button type="button" onClick={remove} disabled={saving} style={buttonStyle('danger')}>Remove</button>
                <button type="button" onClick={() => setConfirmRemove(false)} disabled={saving} style={buttonStyle('secondary')}>Keep</button>
              </span>
            )}
            <span style={{ flex: 1 }} />
            <button type="button" onClick={onClose} disabled={saving} style={buttonStyle('secondary')}>Cancel</button>
            <button type="button" onClick={save} disabled={saving} style={buttonStyle('primary', { opacity: saving ? 0.6 : 1 })}>
              {saving ? 'Saving...' : existing ? 'Save changes' : specialties.length > 1 ? `Add ${specialties.length} entries` : 'Add to waitlist'}
            </button>
          </div>
        </div>
      </div>

      {newPatientName !== null && (
        <PatientModal
          existing={null}
          onClose={() => setNewPatientName(null)}
          onSaved={(saved) => {
            setNewPatientName(null);
            if (saved?.id) { onPatientCreated(saved); setPatientId(saved.id); }
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------
// The status tag doubles as a menu: click it to change the status.
// Scheduled or Removed moves the entry to History.
function StatusSelect({ entry, onChange }) {
  const t = TONES[STATUS_TAG[entry.status].tone];
  const chevron = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='${t.fg.replace('#', '%23')}'/%3E%3C/svg%3E")`;
  return (
    <select
      aria-label={`Status for ${entry.patient_name}, ${entry.specialty}`} value={entry.status} onChange={e => onChange(entry, e.target.value)}
      style={{
        appearance: 'none', WebkitAppearance: 'none', border: 'none', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit',
        fontSize: 11.5, fontWeight: 500, lineHeight: 1.5, padding: '1px 20px 1px 7px', color: t.fg,
        background: `${t.bg} ${chevron} no-repeat right 7px center`,
      }}
    >
      {Object.entries(STATUS_TAG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
    </select>
  );
}

function EntryActions({ entry, onSchedule, onEdit, isMobile }) {
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: isMobile ? 'flex-start' : 'flex-end', flexWrap: 'wrap' }}>
      <button type="button" onClick={() => onSchedule(entry)} style={buttonStyle('secondary', { fontSize: 12.5, padding: '5px 10px' })}>Schedule appointment</button>
      <button type="button" onClick={() => onEdit(entry)} style={buttonStyle('text', { fontSize: 12.5 })}>Edit</button>
    </div>
  );
}

function ActiveList({ entries, isMobile, onSchedule, onEdit, onStatus }) {
  const today = todayStr();
  if (isMobile) {
    return (
      <div>
        {entries.map(e => {
          return (
            <div key={e.id} style={{ padding: '12px 0', borderBottom: `1px solid ${HAIRLINE}` }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <Link to={`/patients/${encodeURIComponent(e.patient_name)}`} style={{ fontSize: 14, fontWeight: 600, color: INK, textDecoration: 'none', flex: 1, minWidth: 0 }}>{e.patient_name}</Link>
                <span style={{ fontSize: 12.5, color: MUTED, ...NUMERIC }}>{waitText(daysBetween(e.referral_date, today))}</span>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '4px 0', flexWrap: 'wrap' }}>
                <Tag>{e.specialty}</Tag>
                <StatusSelect entry={e} onChange={onStatus} />
                <span style={{ fontSize: 12.5, color: MUTED }}>{e.preferred_provider || 'Any provider'}</span>
              </div>
              <div style={{ fontSize: 12.5, color: MUTED }}>{availabilityText(e)}</div>
              {e.notes && <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}><Linkify text={e.notes} /></div>}
              <div style={{ marginTop: 8 }}><EntryActions entry={e} onSchedule={onSchedule} onEdit={onEdit} isMobile /></div>
            </div>
          );
        })}
      </div>
    );
  }
  const cols = 'minmax(0, 1.6fr) 70px minmax(0, 1fr) minmax(0, 1.3fr) 100px 110px 220px';
  const head = { fontSize: 12, color: MUTED, fontWeight: 500 };
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 14, padding: '10px 0 8px', borderBottom: `1px solid ${HAIRLINE}` }}>
        <span style={head}>Patient</span><span style={head}>Specialty</span><span style={head}>Preferred provider</span>
        <span style={head}>Availability</span><span style={head}>Waiting</span><span style={head}>Status</span><span />
      </div>
      {entries.map(e => {
        return (
          <div key={e.id} style={{ display: 'grid', gridTemplateColumns: cols, gap: 14, padding: '11px 0', borderBottom: `1px solid ${HAIRLINE}`, alignItems: 'center' }}>
            <div style={{ minWidth: 0 }}>
              <Link to={`/patients/${encodeURIComponent(e.patient_name)}`} style={{ fontSize: 13.5, fontWeight: 500, color: INK, textDecoration: 'none' }}>{e.patient_name}</Link>
              {e.program && <span style={{ fontSize: 12, color: MUTED }}> · {e.program}</span>}
              {e.notes && <div title={e.notes} style={{ fontSize: 12.5, color: MUTED, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><Linkify text={e.notes} /></div>}
            </div>
            <span><Tag title={DISCIPLINE_NAMES[e.specialty]}>{e.specialty}</Tag></span>
            <span style={{ fontSize: 13, color: e.preferred_provider ? INK : SUBTLE }}>{e.preferred_provider || 'Any'}</span>
            <span style={{ fontSize: 13, color: INK }}>{availabilityText(e)}</span>
            <span style={{ fontSize: 13, color: INK, ...NUMERIC }} title={`Referred ${shortDate(e.referral_date)}`}>{waitText(daysBetween(e.referral_date, today))}</span>
            <span>
              <StatusSelect entry={e} onChange={onStatus} />
              {e.status === 'contacted' && e.contacted_at && <span style={{ display: 'block', fontSize: 12, color: MUTED, marginTop: 2 }}>{shortDate(dateToInputValue(new Date(e.contacted_at)))}</span>}
            </span>
            <EntryActions entry={e} onSchedule={onSchedule} onEdit={onEdit} />
          </div>
        );
      })}
    </div>
  );
}

function HistoryList({ entries, isMobile, onRestore, onDelete }) {
  const nameOf = useStaffNames();
  const [confirmDelete, setConfirmDelete] = useState(null);
  const cols = isMobile ? '1fr' : 'minmax(0, 1.6fr) 70px minmax(0, 1.4fr) 110px 240px';
  const head = { fontSize: 12, color: MUTED, fontWeight: 500 };
  return (
    <div>
      {!isMobile && (
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 14, padding: '10px 0 8px', borderBottom: `1px solid ${HAIRLINE}` }}>
          <span style={head}>Patient</span><span style={head}>Specialty</span><span style={head}>Outcome</span><span style={head}>Waited</span><span />
        </div>
      )}
      {entries.map(e => {
        const s = STATUS_TAG[e.status];
        const closed = e.closed_at ? dateToInputValue(new Date(e.closed_at)) : null;
        return (
          <div key={e.id} style={{ display: 'grid', gridTemplateColumns: cols, gap: isMobile ? 4 : 14, padding: '11px 0', borderBottom: `1px solid ${HAIRLINE}`, alignItems: 'center' }}>
            <Link to={`/patients/${encodeURIComponent(e.patient_name)}`} style={{ fontSize: 13.5, fontWeight: 500, color: INK, textDecoration: 'none' }}>{e.patient_name}</Link>
            <span><Tag>{e.specialty}</Tag></span>
            <span style={{ fontSize: 13, color: MUTED }}>
              <Tag tone={s.tone}>{s.label}</Tag>{' '}
              {closed && `${shortDate(closed)}`}{e.closed_by && ` by ${nameOf(e.closed_by)}`}
            </span>
            <span style={{ fontSize: 13, color: INK, ...NUMERIC }}>{closed ? waitText(daysBetween(e.referral_date, closed)) : '–'}</span>
            <div style={{ display: 'flex', gap: 6, justifyContent: isMobile ? 'flex-start' : 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
              {confirmDelete === e.id ? (
                <>
                  <span style={{ fontSize: 12.5, color: INK }}>Delete this entry?</span>
                  <button type="button" onClick={() => { setConfirmDelete(null); onDelete(e); }} style={buttonStyle('danger', { fontSize: 12.5, padding: '5px 10px' })}>Delete</button>
                  <button type="button" onClick={() => setConfirmDelete(null)} style={buttonStyle('secondary', { fontSize: 12.5, padding: '5px 10px' })}>Keep</button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => onRestore(e)} style={buttonStyle('secondary', { fontSize: 12.5, padding: '5px 10px' })}>Return to waitlist</button>
                  <button type="button" onClick={() => setConfirmDelete(e.id)} style={buttonStyle('text', { fontSize: 12.5, color: TONES.danger.fg })}>Delete</button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function WaitlistPage() {
  const isMobile = useIsMobile(900);
  const [view, setView] = useState('active');
  const [active, setActive] = useState({ entries: null, setupNeeded: false });
  const [history, setHistory] = useState(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [specialty, setSpecialty] = useState('all');
  const [search, setSearch] = useState('');
  const [dayFilter, setDayFilter] = useState(null);
  const [patients, setPatients] = useState([]);
  const [providers, setProviders] = useState([]);
  const [modal, setModal] = useState(null);      // { existing } for add/edit
  const [booking, setBooking] = useState(null);  // the entry being scheduled

  const reload = useCallback(() => setVersion(v => v + 1), []);
  // The active list is always loaded (the average wait uses it, even on
  // History); History only when it's open. A reload after a change keeps
  // showing the current rows meanwhile.
  useEffect(() => {
    let alive = true;
    api.getWaitlist('active')
      .then(r => { if (alive) { setActive({ entries: r?.entries || [], setupNeeded: !!r?.setup_needed }); setError(null); } })
      .catch(err => { if (alive) { setActive(a => ({ ...a, entries: a.entries || [] })); setError(err.message); } });
    return () => { alive = false; };
  }, [version]);
  useEffect(() => {
    if (view !== 'history') return undefined;
    let alive = true;
    api.getWaitlist('history')
      .then(r => { if (alive) setHistory(r?.entries || []); })
      .catch(err => { if (alive) { setHistory(h => h || []); setError(err.message); } });
    return () => { alive = false; };
  }, [view, version]);
  useEffect(() => {
    api.getPatients().then(list => setPatients(list || [])).catch(() => {});
    api.getProviders().then(list => setProviders(list || [])).catch(() => {});
  }, []);

  const entries = view === 'active' ? active.entries : history;
  const loading = entries === null;
  // Average wait per patient on the list (a child waiting for two
  // specialties counts once, by their oldest referral).
  const averageWait = useMemo(() => {
    const oldest = new Map();
    for (const e of active.entries || []) {
      const ref = String(e.referral_date).slice(0, 10);
      if (!oldest.has(e.patient_id) || ref < oldest.get(e.patient_id)) oldest.set(e.patient_id, ref);
    }
    if (!oldest.size) return null;
    const today = todayStr();
    const total = [...oldest.values()].reduce((sum, ref) => sum + daysBetween(ref, today), 0);
    return { days: Math.round(total / oldest.size), patients: oldest.size };
  }, [active.entries]);
  const counts = useMemo(() => {
    const c = { all: (entries || []).length };
    for (const d of DISCIPLINES) c[d] = (entries || []).filter(e => e.specialty === d).length;
    return c;
  }, [entries]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (entries || []).filter(e =>
      (specialty === 'all' || e.specialty === specialty)
      && (!q || (e.patient_name || '').toLowerCase().includes(q) || (e.preferred_provider || '').toLowerCase().includes(q))
      && (!dayFilter || !(e.available_days || []).length || e.available_days.map(Number).includes(dayFilter))
    );
  }, [entries, specialty, search, dayFilter]);

  const act = async (fn, message) => {
    setError(null); setNotice(null);
    try { await fn(); if (message) setNotice(message); reload(); } catch (err) { setError(err.message); }
  };

  // Appointment saved from the waitlist: mark the entry Scheduled.
  const finishBooking = async () => {
    const entry = booking;
    setBooking(null);
    await act(() => api.updateWaitlistEntry(entry.id, { status: 'scheduled' }), `${entry.patient_name} is scheduled, moved to History and set to On Program.`);
  };

  const changeStatus = (e, status) => act(
    () => api.updateWaitlistEntry(e.id, { status }),
    status === 'scheduled' ? `${e.patient_name} (${e.specialty}) is marked Scheduled, moved to History and set to On Program.`
      : status === 'removed' ? `${e.patient_name} (${e.specialty}) is marked Removed and has moved to History.` : null,
  );
  const openAdd = () => { setNotice(null); setModal({ existing: null }); };

  const tabs = [
    { key: 'all', label: 'All', count: view === 'active' ? counts.all : undefined },
    ...DISCIPLINES.map(d => ({ key: d, label: d, count: view === 'active' ? counts[d] : undefined })),
  ];

  return (
    <div style={{ background: PAGE_BG, fontFamily: FONT, minHeight: '100%' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: isMobile ? '18px 14px 40px' : '28px 28px 56px' }}>
        <PageHeader
          title="Waitlist"
          isMobile={isMobile}
          actions={(
            <div style={{ textAlign: isMobile ? 'left' : 'right', ...NUMERIC }}>
              <div style={{ fontSize: 12.5, color: MUTED }}>Average wait</div>
              <div style={{ fontSize: 22, fontWeight: 600, color: INK, lineHeight: 1.25 }}>
                {averageWait ? (averageWait.days < 1 ? 'Under a day' : waitText(averageWait.days)) : '–'}
              </div>
              <div style={{ fontSize: 12, color: MUTED }}>
                {averageWait ? `across ${averageWait.patients} patient${averageWait.patients === 1 ? '' : 's'} on the list` : 'Nobody on the list'}
              </div>
            </div>
          )}
        />

        {active.setupNeeded && (
          <p style={{ fontSize: 13.5, color: TONES.warning.fg, background: TONES.warning.bg, borderRadius: 6, padding: '10px 12px', margin: '0 0 16px' }}>
            The waitlist isn't set up yet. It needs migrations/2026-10-08_waitlist.sql to be run on the database.
          </p>
        )}
        {error && <p style={{ fontSize: 13.5, color: TONES.danger.fg, background: TONES.danger.bg, borderRadius: 6, padding: '10px 12px', margin: '0 0 16px' }}>{error}</p>}
        {notice && <p style={{ fontSize: 13.5, color: TONES.success.fg, background: TONES.success.bg, borderRadius: 6, padding: '10px 12px', margin: '0 0 16px' }}>{notice}</p>}

        <Card pad={isMobile ? 14 : 20}>
          <div style={{ display: 'flex', alignItems: isMobile ? 'stretch' : 'flex-end', gap: 12, flexDirection: isMobile ? 'column' : 'row' }}>
            <UnderlineTabs label="Specialty" active={specialty} onPick={setSpecialty} tabs={tabs} style={{ flex: 1 }} />
            <div style={{ paddingBottom: isMobile ? 0 : 6 }}>
              <button type="button" onClick={openAdd} disabled={active.setupNeeded} style={buttonStyle('primary', isMobile ? { width: '100%' } : {})}>Add to waitlist</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '14px 0 4px' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search patient or provider" aria-label="Search the waitlist" style={{ ...inputStyle, width: isMobile ? '100%' : 260 }} />
            {view === 'active' && (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }} role="group" aria-label="Available on">
                <span style={{ fontSize: 12.5, color: MUTED, marginRight: 2 }}>Available on</span>
                {WEEKDAYS.map(([n, l]) => (
                  <button key={n} type="button" aria-pressed={dayFilter === n} onClick={() => setDayFilter(dayFilter === n ? null : n)} style={chip(dayFilter === n)}>{l}</button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 4, marginLeft: isMobile ? 0 : 'auto' }} role="group" aria-label="Show">
              {[['active', 'On the list'], ['history', 'History']].map(([k, l]) => (
                <button key={k} type="button" aria-pressed={view === k} onClick={() => { setView(k); setNotice(null); }} style={chip(view === k)}>{l}</button>
              ))}
            </div>
          </div>

          {loading && <p style={{ fontSize: 13.5, color: MUTED, margin: '14px 0 0' }}>Loading...</p>}
          {!loading && entries && shown.length === 0 && (
            <p style={{ fontSize: 13.5, color: MUTED, margin: '18px 0 4px' }}>
              {entries.length === 0
                ? (view === 'active' ? 'Nobody is on the waitlist.' : 'Nothing has been scheduled or removed yet.')
                : 'No entries match these filters.'}
            </p>
          )}
          {!loading && shown.length > 0 && (view === 'active' ? (
            <ActiveList entries={shown} isMobile={isMobile} onStatus={changeStatus} onEdit={(e) => { setNotice(null); setModal({ existing: e }); }} onSchedule={(e) => { setNotice(null); setBooking(e); }} />
          ) : (
            <HistoryList
              entries={shown} isMobile={isMobile}
              onRestore={(e) => act(() => api.updateWaitlistEntry(e.id, { status: 'waiting' }), `${e.patient_name} is back on the ${e.specialty} waitlist.`)}
              onDelete={(e) => act(() => api.deleteWaitlistEntry(e.id), 'Entry deleted.')}
            />
          ))}
        </Card>
      </div>

      {modal && (
        <EntryModal
          existing={modal.existing} patients={patients} providers={providers}
          onPatientCreated={(p) => setPatients(list => [...list, p])}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); reload(); }}
        />
      )}
      {booking && (
        <AppointmentModal
          providers={providers}
          defaultDate={new Date()}
          prefill={{
            patientName: booking.patient_name,
            fromWaitlist: true, // this page marks the entry itself (finishBooking)
            provider: booking.preferred_provider || providers.find(p => disciplinesOf(p).has(booking.specialty))?.Name,
          }}
          onClose={() => setBooking(null)}
          onSaved={finishBooking}
        />
      )}
    </div>
  );
}
