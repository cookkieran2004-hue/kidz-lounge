import React, { useState, useEffect, useCallback } from 'react';
import { api } from './api';

// Meeting agendas. One component, used in three places:
//   - the schedule's out-of-office view: one week (`fixedDate`), editable
//     by the organizer, anyone in the meeting, or an admin; read-only
//     (`readOnly`) for everyone else
//   - My time / a staff profile's Time off: editable, with a week picker
//   - My time's "Meetings I'm in"
// A recurring meeting has two side-by-side boxes: "Recurring agenda" (the
// same every week) and "This week only" (just that date). A one-time
// meeting has a single "Agenda". Saves right away -- never needs approval.
// The boxes always show, blank until someone writes an agenda. Older
// meeting blocks not linked to a My time entry pass `blockRef`
// ({ series_id } or { ooo_id }) instead of `requestId`.

const INK = '#241A33';
const MUTED = '#6B6280';
const BORDER = '#E7E2F3';
const PURPLE = '#6D28D9';

function formatWeekLabel(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function Column({ title, hint, children }) {
  return (
    <div style={{ flex: '1 1 220px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED, marginBottom: 2 }}>{title}</div>
      {hint && <div style={{ fontSize: 11.5, color: '#9ca3af', marginBottom: 6 }}>{hint}</div>}
      {children}
    </div>
  );
}

function ReadOnlyText({ text }) {
  return (
    <div style={{
      flex: 1, minHeight: 64, padding: '8px 10px', borderRadius: 8, border: `1px solid ${BORDER}`, background: '#FAF9FD',
      fontSize: 13, color: INK, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
    }}>
      {text || ''}
    </div>
  );
}

const textareaStyle = {
  flex: 1, width: '100%', minHeight: 120, padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db',
  fontSize: 13, fontFamily: 'inherit', lineHeight: 1.45, boxSizing: 'border-box', resize: 'vertical',
};

// Blank boxes in the right layout, shown while loading or if the agenda
// couldn't be loaded -- so the agenda area is always there.
export function MeetingAgendaPlaceholder({ recurring, note }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {recurring ? (
          <>
            <Column title="Recurring agenda" hint="Every week"><ReadOnlyText text="" /></Column>
            <Column title="This week only" hint=" "><ReadOnlyText text="" /></Column>
          </>
        ) : (
          <Column title="Agenda"><ReadOnlyText text="" /></Column>
        )}
      </div>
      {note && <p style={{ fontSize: 12, color: '#b91c1c', margin: '6px 0 0' }}>{note}</p>}
    </div>
  );
}

export function MeetingAgendaEditor({ requestId, blockRef, initialDate, fixedDate, readOnly = false, recurringHint = false }) {
  // Keyed on the plain ids so a parent re-render never reloads (and wipes
  // unsaved typing in) the agenda.
  const blockSeries = blockRef?.series_id;
  const blockOoo = blockRef?.ooo_id;
  const fetchAgenda = useCallback((date) => (requestId
    ? api.getMeetingAgenda(requestId, date)
    : api.getBlockAgenda({ series_id: blockSeries, ooo_id: blockOoo, date })), [requestId, blockSeries, blockOoo]);
  const storeAgenda = (record) => (requestId
    ? api.saveMeetingAgenda(requestId, record)
    : api.saveBlockAgenda({ series_id: blockSeries, ooo_id: blockOoo, date: record.week_date, ...record }));
  const [data, setData] = useState(null); // server response
  const [recurring, setRecurring] = useState('');
  const [week, setWeek] = useState('');
  const [single, setSingle] = useState('');
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null); // { kind: 'saved'|'error', text }

  const apply = useCallback((res) => {
    setData(res);
    if (res.kind === 'recurring') { setRecurring(res.recurring_agenda || ''); setWeek(res.week_agenda || ''); }
    else setSingle(res.agenda || '');
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchAgenda(fixedDate || initialDate)
      .then(res => { if (!cancelled) apply(res); })
      .catch(err => { if (!cancelled) setLoadError(err.message); });
    return () => { cancelled = true; };
  }, [fetchAgenda, initialDate, fixedDate, apply]);

  if (loadError) return <MeetingAgendaPlaceholder recurring={recurringHint} note={loadError} />;
  if (!data) return <MeetingAgendaPlaceholder recurring={recurringHint} />;

  const isRecurring = data.kind === 'recurring';

  if (readOnly || data.can_edit === false) {
    return (
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {isRecurring ? (
          <>
            <Column title="Recurring agenda" hint="Every week"><ReadOnlyText text={data.recurring_agenda} /></Column>
            <Column title="This week only" hint={formatWeekLabel(data.week_date)}><ReadOnlyText text={data.week_agenda} /></Column>
          </>
        ) : (
          <Column title="Agenda"><ReadOnlyText text={data.agenda} /></Column>
        )}
      </div>
    );
  }
  const dirty = isRecurring
    ? recurring !== (data.recurring_agenda || '') || week !== (data.week_agenda || '')
    : single !== (data.agenda || '');

  const save = async (extra = {}) => {
    setSaving(true); setStatus(null);
    try {
      const record = isRecurring
        ? { recurring_agenda: recurring, week_date: data.week_date, week_agenda: week, ...extra }
        : { agenda: single };
      apply(await storeAgenda(record));
      setStatus({ kind: 'saved', text: 'Agenda saved' });
    } catch (err) {
      setStatus({ kind: 'error', text: err.message });
    }
    setSaving(false);
  };

  // Switching weeks keeps whatever was typed: unsaved notes are saved first.
  const changeWeek = async (newDate) => {
    setStatus(null);
    try {
      if (dirty) {
        await storeAgenda({ recurring_agenda: recurring, week_date: data.week_date, week_agenda: week });
      }
      apply(await fetchAgenda(newDate));
    } catch (err) {
      setStatus({ kind: 'error', text: err.message });
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'stretch' }}>
        {isRecurring ? (
          <>
            <Column title="Recurring agenda" hint="Shows on every week of this meeting">
              <textarea aria-label="Recurring agenda" style={textareaStyle} value={recurring} onChange={e => setRecurring(e.target.value)} placeholder="Standing items for every week" />
            </Column>
            <Column title="This week only" hint={fixedDate ? formatWeekLabel(data.week_date) : null}>
              {!fixedDate && <select
                aria-label="Which week"
                value={data.week_date || ''}
                onChange={e => changeWeek(e.target.value)}
                style={{ marginBottom: 6, padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12.5, background: 'white' }}
              >
                {(data.dates || []).map(d => <option key={d} value={d}>{formatWeekLabel(d)}</option>)}
              </select>}
              <textarea aria-label="This week only" style={textareaStyle} value={week} onChange={e => setWeek(e.target.value)} placeholder="Just for this date" />
            </Column>
          </>
        ) : (
          <Column title="Agenda">
            <textarea aria-label="Agenda" style={textareaStyle} value={single} onChange={e => setSingle(e.target.value)} placeholder="What this meeting covers" />
          </Column>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
        <button
          type="button"
          onClick={() => save()}
          disabled={saving || !dirty}
          style={{ padding: '7px 14px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 600, cursor: saving || !dirty ? 'default' : 'pointer', background: saving || !dirty ? '#C4B5FD' : PURPLE, color: 'white' }}
        >
          {saving ? 'Saving...' : 'Save agenda'}
        </button>
        {status && <span role="status" style={{ fontSize: 12.5, fontWeight: 600, color: status.kind === 'saved' ? '#067647' : '#b91c1c' }}>{status.text}</span>}
        {!status && !dirty && <span style={{ fontSize: 12, color: '#9ca3af' }}>Agenda changes save right away &mdash; no approval needed.</span>}
      </div>
    </div>
  );
}
