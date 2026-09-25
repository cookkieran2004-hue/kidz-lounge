import React, { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { SUPPORT_OWNER, notifySupportTicketsChanged } from '../supportCount';

// The support owner's (KJC135) ticket inbox: open tickets first, most
// urgent first. Resolving one (with an optional note) also ticks off its
// bell task. Plain, like the Help page.
const URGENCY_COLOR = { Urgent: '#b00020', High: '#c2410c', Medium: '#a16207', Low: '#4b5563' };

function when(iso) {
  return iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
}

export default function SupportTicketsPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState('open');
  const [tickets, setTickets] = useState(null);
  const [error, setError] = useState(null);
  const [notes, setNotes] = useState({});

  const load = useCallback(() => {
    api.getSupportTickets(status === 'all' ? null : status)
      .then(t => { setTickets(t || []); setError(null); })
      .catch(err => setError(err.message));
  }, [status]);
  useEffect(() => { load(); }, [load]);

  if (user && user.username !== SUPPORT_OWNER) return <Navigate to="/" replace />;

  const setTicketStatus = async (t, next) => {
    try {
      await api.updateSupportTicket(t.id, { status: next, resolution_note: notes[t.id] || '' });
      load();
      notifySupportTicketsChanged();
    } catch (err) { setError(err.message); }
  };

  return (
    <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: '#111', maxWidth: 820, margin: '0 auto', padding: '24px 16px 48px' }}>
      <h1 style={{ fontSize: 22, margin: '0 0 12px' }}>Support tickets</h1>
      <div style={{ marginBottom: 14, fontSize: 14 }}>
        Show:{' '}
        {['open', 'resolved', 'all'].map(s => (
          <label key={s} style={{ marginRight: 12, cursor: 'pointer' }}>
            <input type="radio" name="ticket-status" checked={status === s} onChange={() => setStatus(s)} /> {s[0].toUpperCase() + s.slice(1)}
          </label>
        ))}
      </div>
      {error && <p role="alert" style={{ color: '#b00020' }}>{error}</p>}
      {tickets === null ? <p>Loading...</p> : tickets.length === 0 ? <p style={{ color: '#555' }}>No {status === 'all' ? '' : status} tickets.</p> : tickets.map(t => (
        <div key={t.id} style={{ border: '1px solid #999', padding: 12, marginBottom: 12, background: t.status === 'resolved' ? '#f6f6f6' : 'white' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline', fontSize: 14 }}>
            <b>#{t.id}</b>
            <b style={{ color: URGENCY_COLOR[t.urgency] }}>{t.urgency}</b>
            <span style={{ color: '#555' }}>{when(t.created_at)}</span>
            <span style={{ marginLeft: 'auto', color: t.status === 'open' ? '#111' : '#067647' }}>{t.status === 'open' ? 'Open' : `Resolved ${when(t.resolved_at)}`}</span>
          </div>
          <p style={{ whiteSpace: 'pre-wrap', margin: '8px 0', fontSize: 14 }}>{t.issue}</p>
          <div style={{ fontSize: 13, color: '#333' }}>
            From <b>{t.contact_name}</b> &middot; {t.contact_info}
            {t.submitted_by ? <> &middot; signed in as {t.submitted_by}</> : <> &middot; not signed in</>}
            {t.page && <> &middot; page: {t.page}</>}
          </div>
          {t.status === 'resolved' && t.resolution_note && <p style={{ fontSize: 13, margin: '6px 0 0' }}><b>Note:</b> {t.resolution_note}</p>}
          {t.status === 'open' && (
            <p style={{ fontSize: 12, color: '#555', margin: '6px 0 0' }}>
              {t.submitted_by
                ? `When resolved, ${t.submitted_by} sees a popup with your note.`
                : `Sent while signed out, so there's no popup. Contact them at ${t.contact_info}.`}
            </p>
          )}
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {t.status === 'open' ? (
              <>
                <input aria-label={`Note for ticket ${t.id}`} placeholder="Resolution note (optional)" value={notes[t.id] || ''} onChange={e => setNotes(n => ({ ...n, [t.id]: e.target.value }))}
                  style={{ flex: '1 1 240px', padding: 4, fontSize: 13, border: '1px solid #999' }} />
                <button type="button" onClick={() => setTicketStatus(t, 'resolved')} style={{ fontSize: 13, padding: '3px 12px' }}>Mark resolved</button>
              </>
            ) : (
              <button type="button" onClick={() => setTicketStatus(t, 'open')} style={{ fontSize: 13, padding: '3px 12px' }}>Reopen</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
