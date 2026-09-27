import { useState, useEffect, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { canSeeSupportTickets, notifySupportTicketsChanged } from '../supportCount';
import { useStaffNames } from '../staffDirectory';
import { useIsMobile } from '../useIsMobile';
import { PageHeader, Card, Tag, UnderlineTabs } from '../dashboardUi';
import { INK, MUTED, SUBTLE, HAIRLINE, PAGE_BG, FONT, NUMERIC, TONES, buttonStyle } from '../uiTokens';

// The help desk inbox (Developers only): one condensed line per ticket --
// click it for the full issue, who sent it and the actions (resolve with a
// note, reopen, delete). Everything is loaded once and searched, filtered
// and sorted here; the inbox is small.

const REF_PREFIX = 'KL-';
const URGENCY_RANK = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
const URGENCY_TONE = { Urgent: 'danger', High: 'warning', Medium: 'neutral', Low: 'neutral' };
const SORTS = {
  urgent: { label: 'Most urgent', fn: (a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] || new Date(b.created_at) - new Date(a.created_at) },
  newest: { label: 'Newest first', fn: (a, b) => new Date(b.created_at) - new Date(a.created_at) },
  oldest: { label: 'Oldest first', fn: (a, b) => new Date(a.created_at) - new Date(b.created_at) },
  resolved: { label: 'Recently resolved', fn: (a, b) => new Date(b.resolved_at || 0) - new Date(a.resolved_at || 0) || new Date(b.created_at) - new Date(a.created_at) },
};

const sameYear = (d) => d.getFullYear() === new Date().getFullYear();
function shortWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: sameYear(d) ? undefined : 'numeric' });
}
function fullWhen(iso) {
  return iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
}

const inputStyle = {
  boxSizing: 'border-box', padding: '7px 10px', fontSize: 13.5, fontFamily: 'inherit', color: INK,
  border: `1px solid ${HAIRLINE}`, borderRadius: 6, background: 'white',
};

function TicketDetail({ t, nameFor, isMobile, onStatus, onDelete }) {
  const [note, setNote] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async (fn) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  const meta = { fontSize: 12.5, color: MUTED };
  return (
    <div style={{ padding: isMobile ? '4px 0 12px' : '2px 0 14px 132px' }}>
      <div style={{ background: 'white', border: `1px solid ${HAIRLINE}`, borderRadius: 6, padding: '12px 14px', margin: '0 0 10px' }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: MUTED, marginBottom: 4 }}>Issue</div>
        <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 14.5, color: INK, margin: 0, lineHeight: 1.55 }}>{t.issue}</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: '2px 24px', ...meta }}>
        <span>From <span style={{ color: INK }}>{t.contact_name}</span> · {t.contact_info}</span>
        <span>{t.submitted_by ? <>Signed in as <span style={{ color: INK }}>{nameFor(t.submitted_by)}</span></> : 'Sent while signed out'}</span>
        <span>Submitted {fullWhen(t.created_at)}</span>
        {t.page && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.page}>Page: {t.page}</span>}
        {t.status === 'resolved' && <span>Resolved {fullWhen(t.resolved_at)}{t.resolved_by ? ` by ${nameFor(t.resolved_by)}` : ''}</span>}
      </div>
      {t.status === 'resolved' && t.resolution_note && (
        <p style={{ fontSize: 13, color: INK, margin: '8px 0 0' }}><span style={{ color: MUTED }}>Note:</span> {t.resolution_note}</p>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
        {t.status === 'open' ? (
          <>
            <input
              aria-label={`Resolution note for ${t.reference || t.id}`} placeholder="Resolution note (optional)" value={note}
              onChange={e => setNote(e.target.value)} style={{ ...inputStyle, flex: '1 1 260px', maxWidth: 480 }}
            />
            <button type="button" disabled={busy} onClick={() => run(() => onStatus(t, 'resolved', note))} style={buttonStyle('primary', { fontSize: 12.5, padding: '6px 12px' })}>Mark resolved</button>
          </>
        ) : (
          <button type="button" disabled={busy} onClick={() => run(() => onStatus(t, 'open'))} style={buttonStyle('secondary', { fontSize: 12.5, padding: '6px 12px' })}>Reopen</button>
        )}
        <span style={{ flex: 1 }} />
        {confirmDelete ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: INK }}>
            Delete this ticket permanently?
            <button type="button" disabled={busy} onClick={() => run(() => onDelete(t))} style={buttonStyle('danger', { fontSize: 12.5, padding: '6px 12px' })}>Delete</button>
            <button type="button" disabled={busy} onClick={() => setConfirmDelete(false)} style={buttonStyle('secondary', { fontSize: 12.5, padding: '6px 12px' })}>Keep</button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} style={buttonStyle('text', { fontSize: 12.5, color: TONES.danger.fg })}>Delete</button>
        )}
      </div>
      {t.status === 'open' && (
        <p style={{ fontSize: 12, color: SUBTLE, margin: '6px 0 0' }}>
          {t.submitted_by
            ? `When resolved, ${nameFor(t.submitted_by)} sees a popup with your note.`
            : `No popup for a signed-out sender. Reply to them at ${t.contact_info}.`}
        </p>
      )}
    </div>
  );
}

export default function SupportTicketsPage() {
  const { user } = useAuth();
  const nameFor = useStaffNames();
  const isMobile = useIsMobile(760);
  const [tickets, setTickets] = useState(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('open');
  // What's typed after the fixed "KL-" in the search box (the prefix is a
  // label, not part of the value, so it can't be deleted).
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('urgent');
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    let alive = true;
    api.getSupportTickets(null)
      .then(t => { if (alive) { setTickets(t || []); setError(null); } })
      .catch(err => { if (alive) { setTickets(prev => prev || []); setError(err.message); } });
    return () => { alive = false; };
  }, [version]);

  const counts = useMemo(() => ({
    open: (tickets || []).filter(t => t.status === 'open').length,
    resolved: (tickets || []).filter(t => t.status === 'resolved').length,
    all: (tickets || []).length,
  }), [tickets]);

  const shown = useMemo(() => {
    // The text after "KL-" matches the rest of a reference (QMZ finds
    // KL-QMZRTA) and every other field too (password finds the issue).
    const q = search.trim().toLowerCase();
    return (tickets || [])
      .filter(t => status === 'all' || t.status === status)
      .filter(t => !q
        || [t.reference, t.issue, t.contact_name, t.contact_info, t.page, t.resolution_note, t.submitted_by && nameFor(t.submitted_by)]
          .some(v => v && String(v).toLowerCase().includes(q)))
      .sort(SORTS[sort].fn);
  }, [tickets, status, search, sort, nameFor]);

  if (user && !canSeeSupportTickets(user)) return <Navigate to="/" replace />;

  const changed = () => { setVersion(v => v + 1); notifySupportTicketsChanged(); };
  const setTicketStatus = async (t, next, note = '') => {
    try {
      await api.updateSupportTicket(t.id, { status: next, resolution_note: note });
      changed();
    } catch (err) { setError(err.message); }
  };
  const deleteTicket = async (t) => {
    try {
      await api.deleteSupportTicket(t.id);
      setOpenId(null);
      changed();
    } catch (err) { setError(err.message); }
  };

  const cols = '120px 64px minmax(0, 1fr) minmax(0, 180px) 70px 76px';
  const head = { fontSize: 12, color: MUTED, fontWeight: 500 };

  return (
    <div style={{ background: PAGE_BG, fontFamily: FONT, minHeight: '100%' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '18px 14px 40px' : '28px 28px 56px' }}>
        <PageHeader title="Support tickets" subtitle="Help desk requests from staff and the public Help page." isMobile={isMobile} />
        {error && <p role="alert" style={{ fontSize: 13.5, color: TONES.danger.fg, background: TONES.danger.bg, borderRadius: 6, padding: '10px 12px', margin: '0 0 16px' }}>{error}</p>}

        <Card pad={isMobile ? 14 : 20}>
          <div style={{ display: 'flex', alignItems: isMobile ? 'stretch' : 'flex-end', gap: 12, flexDirection: isMobile ? 'column' : 'row' }}>
            <UnderlineTabs
              label="Status" active={status} onPick={(s) => { setStatus(s); setOpenId(null); }} style={{ flex: 1 }}
              tabs={[{ key: 'open', label: 'Open', count: counts.open }, { key: 'resolved', label: 'Resolved', count: counts.resolved }, { key: 'all', label: 'All', count: counts.all }]}
            />
            <div style={{ display: 'flex', gap: 8, paddingBottom: isMobile ? 0 : 6, flexWrap: 'wrap' }}>
              <label style={{ ...inputStyle, display: 'flex', alignItems: 'center', gap: 1, width: isMobile ? '100%' : 220, cursor: 'text' }}>
                <span aria-hidden="true" style={{ color: MUTED, fontWeight: 500, ...NUMERIC }}>{REF_PREFIX}</span>
                <input
                  value={search} placeholder="search tickets" aria-label={`Search tickets (${REF_PREFIX} is filled in)`}
                  // A pasted full reference ("KL-QMZRTA") shouldn't double the prefix.
                  onChange={e => setSearch(e.target.value.replace(new RegExp(`^\\s*${REF_PREFIX}`, 'i'), ''))}
                  style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', padding: 0, fontSize: 'inherit', fontFamily: 'inherit', color: INK, background: 'transparent' }}
                />
              </label>
              <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort tickets" style={{ ...inputStyle, width: isMobile ? '100%' : 'auto' }}>
                {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>

          {tickets === null && <p style={{ fontSize: 13.5, color: MUTED, margin: '14px 0 0' }}>Loading...</p>}
          {tickets && shown.length === 0 && (
            <p style={{ fontSize: 13.5, color: MUTED, margin: '16px 0 4px' }}>
              {search.trim() ? 'No tickets match your search.' : status === 'all' ? 'No tickets yet.' : `No ${status} tickets.`}
            </p>
          )}

          {shown.length > 0 && !isMobile && (
            <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, padding: '12px 0 7px', borderBottom: `1px solid ${HAIRLINE}` }}>
              <span style={head}>Reference</span><span style={head}>Urgency</span><span style={head}>Issue</span>
              <span style={head}>From</span><span style={head}>Received</span><span style={head}>Status</span>
            </div>
          )}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {shown.map(t => {
              const open = openId === t.id;
              const statusTag = t.status === 'open' ? <Tag>Open</Tag> : <Tag tone="success">Resolved</Tag>;
              return (
                <li key={t.id} style={{ borderBottom: `1px solid ${HAIRLINE}`, background: open ? '#FAFAFA' : 'white', margin: isMobile ? 0 : '0 -8px', padding: isMobile ? 0 : '0 8px' }}>
                  <button
                    type="button" aria-expanded={open} onClick={() => setOpenId(open ? null : t.id)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: isMobile ? '10px 0' : '9px 0', cursor: 'pointer', fontFamily: 'inherit', color: INK }}
                  >
                    {isMobile ? (
                      <>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 600, ...NUMERIC }}>{t.reference || `#${t.id}`}</span>
                          <Tag tone={URGENCY_TONE[t.urgency]}>{t.urgency}</Tag>
                          {statusTag}
                          <span style={{ marginLeft: 'auto', fontSize: 12, color: MUTED }}>{shortWhen(t.created_at)}</span>
                        </span>
                        {!open && <span style={{ display: 'block', fontSize: 13.5, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.issue}</span>}
                      </>
                    ) : (
                      <span style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, alignItems: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, ...NUMERIC }}>{t.reference || `#${t.id}`}</span>
                        <span><Tag tone={URGENCY_TONE[t.urgency]}>{t.urgency}</Tag></span>
                        <span style={{ fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: open ? MUTED : INK }}>{t.issue}</span>
                        <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.submitted_by ? nameFor(t.submitted_by) : t.contact_name}</span>
                        <span style={{ fontSize: 12.5, color: MUTED, ...NUMERIC }} title={fullWhen(t.created_at)}>{shortWhen(t.created_at)}</span>
                        <span>{statusTag}</span>
                      </span>
                    )}
                  </button>
                  {open && <TicketDetail t={t} nameFor={nameFor} isMobile={isMobile} onStatus={setTicketStatus} onDelete={deleteTicket} />}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}
