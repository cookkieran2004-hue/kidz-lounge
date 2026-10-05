import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api';
import { useStaffNames } from '../../staffDirectory';
import { INK, MUTED, HAIRLINE, TONES, buttonStyle } from '../../uiTokens';
import { UnderlineTabs } from '../../dashboardUi';

// Admin > Schedule changes: changes to past appointments that someone other
// than an Admin or Developer asked for (billing lock, kidz-lounge-api
// lib/pastLock.js). Approve makes the change as you; Deny leaves the
// schedule as it is. `onChanged` refreshes the tab's count.

const when = (s) => new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function ScheduleChangesTab({ isMobile, onChanged }) {
  const [view, setView] = useState('pending');
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [denying, setDenying] = useState(null); // id
  const [note, setNote] = useState('');
  const nameFor = useStaffNames();

  const load = useCallback(() => {
    const statuses = view === 'pending' ? ['pending'] : ['approved', 'denied'];
    Promise.all(statuses.map(s => api.getScheduleChangeRequests(s)))
      .then(lists => { setError(null); setItems(lists.flat().sort((a, b) => String(b.reviewed_at || b.requested_at).localeCompare(String(a.reviewed_at || a.requested_at)))); })
      .catch(err => { setItems([]); setError(err.message); });
  }, [view]);
  useEffect(() => { load(); }, [load]);

  const act = async (id, action) => {
    setBusy(id); setError(null);
    try {
      if (action === 'approve') await api.approveScheduleChange(id);
      else await api.denyScheduleChange(id, note.trim());
      setDenying(null); setNote('');
      load(); onChanged?.();
    } catch (err) {
      setError(err.message);
    }
    setBusy(null);
  };

  return (
    <div>
      <UnderlineTabs label="Schedule changes" active={view} onPick={(k) => { setItems(null); setView(k); }} style={{ marginBottom: 12 }}
        tabs={[{ key: 'pending', label: 'Waiting' }, { key: 'done', label: 'Decided' }]} />
      {error && <p role="alert" style={{ fontSize: 13, color: TONES.danger.fg }}>{error}</p>}
      {items === null && <p style={{ fontSize: 13, color: MUTED }}>Loading...</p>}
      {items && items.length === 0 && (
        <p style={{ fontSize: 13.5, color: MUTED }}>{view === 'pending' ? 'No changes to past dates waiting for approval.' : 'No decided requests yet.'}</p>
      )}
      {items && items.map(it => (
        <div key={it.id} style={{ borderBottom: `1px solid ${HAIRLINE}`, padding: '12px 0', display: 'flex', gap: 12, flexWrap: isMobile ? 'wrap' : 'nowrap', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, color: INK, fontWeight: 500 }}>{it.summary}</div>
            <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3 }}>
              Asked by {nameFor(it.requested_by)} · {when(it.requested_at)}
              {it.reason && <> · “{it.reason}”</>}
            </div>
            {it.status !== 'pending' && (
              <div style={{ fontSize: 12.5, marginTop: 3, color: it.status === 'approved' ? TONES.success.fg : TONES.danger.fg }}>
                {it.status === 'approved' ? 'Approved' : 'Denied'} by {nameFor(it.reviewed_by)} · {when(it.reviewed_at)}{it.review_note ? ` · ${it.review_note}` : ''}
              </div>
            )}
            {denying === it.id && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <input autoFocus value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder="Reason (optional)" aria-label="Reason for denying"
                  style={{ flex: '1 1 220px', padding: '6px 9px', fontSize: 13, border: `1px solid ${HAIRLINE}`, borderRadius: 6, fontFamily: 'inherit' }} />
                <button type="button" disabled={busy === it.id} onClick={() => act(it.id, 'deny')} style={buttonStyle('primary', { background: TONES.danger.fg, borderColor: TONES.danger.fg })}>Deny</button>
                <button type="button" onClick={() => { setDenying(null); setNote(''); }} style={buttonStyle('secondary')}>Cancel</button>
              </div>
            )}
          </div>
          {it.status === 'pending' && denying !== it.id && (
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button type="button" disabled={busy === it.id} onClick={() => act(it.id, 'approve')} style={buttonStyle('primary')}>{busy === it.id ? 'Saving...' : 'Approve'}</button>
              <button type="button" disabled={busy === it.id} onClick={() => { setDenying(it.id); setNote(''); }} style={buttonStyle('secondary')}>Deny</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
