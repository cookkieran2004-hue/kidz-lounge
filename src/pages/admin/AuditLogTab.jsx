import { useState, useEffect } from 'react';
import { api } from '../../api';
import { useStaffNames } from '../../staffDirectory';
import { DateField } from '../SchedulePage';
import { Tag } from '../../dashboardUi';
import { INK, MUTED, SUBTLE, HAIRLINE, NUMERIC, TONES, buttonStyle } from '../../uiTokens';

// Admin > Audit log (Developers only): the HIPAA record of who created,
// changed, deleted or uploaded patient information, and every sign-in
// (kidz-lounge-api/lib/audit.js). Read-only -- entries can never be edited
// or deleted. Filter, page back 100 at a time, or export the filtered
// entries to CSV (for a compliance request or an investigation).

const ACTIONS = [
  ['', 'All actions'], ['create', 'Created'], ['update', 'Changed'], ['delete', 'Deleted'], ['upload', 'Uploaded'],
  ['login', 'Signed in'], ['login_failed', 'Failed sign-in'], ['logout', 'Signed out'], ['password_set', 'Set password'],
];
const ACTION_LABEL = Object.fromEntries(ACTIONS.filter(([k]) => k));
const ACTION_TONE = { delete: 'danger', login_failed: 'danger', update: 'warning', create: 'success', download: 'accent', export: 'accent' };

const when = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });

function describeDetails(e) {
  const d = e.details || {};
  const bits = [];
  if (d.fields?.length) bits.push(`Fields: ${d.fields.join(', ')}`);
  if (d.query) bits.push(`Search: "${d.query}"`);
  if (d.reason) bits.push(d.reason);
  if (d.filename) bits.push(d.filename);
  if (d.count !== undefined && d.count !== null) bits.push(`${d.count} patients`);
  if (d.scope) bits.push(Object.entries(d).filter(([k]) => k !== 'scope').map(([k, v]) => `${k}: ${v}`).join(', ') || d.scope);
  if (d.filters) bits.push(Object.keys(d.filters).length ? `Filters: ${Object.entries(d.filters).map(([k, v]) => `${k}=${v}`).join(', ')}` : 'No filters');
  return bits.filter(Boolean).join(' · ');
}

const inputStyle = { boxSizing: 'border-box', padding: '7px 10px', fontSize: 13, fontFamily: 'inherit', color: INK, border: `1px solid ${HAIRLINE}`, borderRadius: 6, background: 'white' };

export default function AuditLogTab({ isMobile }) {
  const nameFor = useStaffNames();
  const [filters, setFilters] = useState({ user: '', patient: '', action: '', from: '', to: '' });
  const [applied, setApplied] = useState(filters);
  const [data, setData] = useState({ entries: null, more: false, setupNeeded: false });
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let alive = true;
    api.getAuditLog(applied)
      .then(r => { if (alive) { setData({ entries: r.entries || [], more: !!r.more, setupNeeded: !!r.setup_needed }); setError(null); } })
      .catch(err => { if (alive) { setData({ entries: [], more: false, setupNeeded: false }); setError(err.message); } });
    return () => { alive = false; };
  }, [applied]);

  const loadMore = async () => {
    const last = data.entries[data.entries.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const r = await api.getAuditLog({ ...applied, before: last.id });
      setData(d => ({ ...d, entries: [...d.entries, ...(r.entries || [])], more: !!r.more }));
    } catch (err) { setError(err.message); } finally { setLoadingMore(false); }
  };
  const exportCsv = async () => {
    setExporting(true); setError(null);
    try { await api.downloadAuditLogCsv(applied); } catch (err) { setError(err.message); } finally { setExporting(false); }
  };
  const set = (k) => (e) => setFilters(f => ({ ...f, [k]: e.target.value }));
  const apply = (e) => { e?.preventDefault(); setApplied({ ...filters }); };
  const clear = () => { const blank = { user: '', patient: '', action: '', from: '', to: '' }; setFilters(blank); setApplied(blank); };
  const filtered = Object.values(applied).some(Boolean);

  const cols = '185px minmax(0, 0.9fr) 120px minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.4fr) 60px';
  const head = { fontSize: 12, color: MUTED, fontWeight: 500 };

  return (
    <div>
      <p style={{ fontSize: 13, color: MUTED, margin: '0 0 14px' }}>
        Every sign-in, and every change to patient information (created, changed, deleted or uploaded). Entries are kept permanently and can't be edited or deleted.
      </p>

      <form onSubmit={apply} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <input value={filters.user} onChange={set('user')} placeholder="Username" aria-label="Filter by username" style={{ ...inputStyle, width: isMobile ? '100%' : 140 }} />
        <input value={filters.patient} onChange={set('patient')} placeholder="Patient name" aria-label="Filter by patient" style={{ ...inputStyle, width: isMobile ? '100%' : 170 }} />
        <select value={filters.action} onChange={set('action')} aria-label="Filter by action" style={{ ...inputStyle, width: isMobile ? '100%' : 'auto' }}>
          {ACTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <div style={{ width: isMobile ? '100%' : 160 }}><DateField value={filters.from} onChange={v => setFilters(f => ({ ...f, from: v }))} placeholder="From" clearable style={{ ...inputStyle, width: '100%' }} ariaLabel="From date" /></div>
        <div style={{ width: isMobile ? '100%' : 160 }}><DateField value={filters.to} onChange={v => setFilters(f => ({ ...f, to: v }))} placeholder="To" clearable style={{ ...inputStyle, width: '100%' }} ariaLabel="To date" /></div>
        <button type="submit" style={buttonStyle('primary')}>Apply</button>
        {filtered && <button type="button" onClick={clear} style={buttonStyle('text')}>Clear</button>}
        <span style={{ flex: 1 }} />
        <button type="button" onClick={exportCsv} disabled={exporting || data.setupNeeded} style={buttonStyle('secondary')}>{exporting ? 'Exporting...' : 'Export CSV'}</button>
      </form>

      {data.setupNeeded && (
        <p style={{ fontSize: 13.5, color: TONES.warning.fg, background: TONES.warning.bg, borderRadius: 6, padding: '10px 12px' }}>
          The audit log isn't set up yet. Run migrations/2026-10-09_audit_log.sql on the database; recording starts as soon as it exists.
        </p>
      )}
      {error && <p role="alert" style={{ fontSize: 13, color: TONES.danger.fg, margin: '0 0 10px' }}>{error}</p>}
      {data.entries === null && <p style={{ fontSize: 13, color: MUTED }}>Loading...</p>}
      {data.entries && data.entries.length === 0 && !data.setupNeeded && (
        <p style={{ fontSize: 13.5, color: MUTED, margin: '14px 0' }}>{filtered ? 'No entries match these filters.' : 'Nothing recorded yet.'}</p>
      )}

      {data.entries?.length > 0 && (
        <div>
          {!isMobile && (
            <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 12, padding: '8px 0', borderBottom: `1px solid ${HAIRLINE}` }}>
              <span style={head}>When</span><span style={head}>Who</span><span style={head}>Action</span><span style={head}>What</span>
              <span style={head}>Patient</span><span style={head}>Details</span><span style={head}>Result</span>
            </div>
          )}
          {data.entries.map(e => {
            const refused = e.status >= 400;
            return (
              <div key={e.id} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : cols, gap: isMobile ? 2 : 12, padding: '8px 0', borderBottom: `1px solid ${HAIRLINE}`, alignItems: 'center', fontSize: 13 }}>
                <span style={{ color: MUTED, whiteSpace: 'nowrap', ...NUMERIC }} title={e.ip ? `IP ${e.ip}` : undefined}>{when(e.at)}</span>
                <span style={{ color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.username}>{e.username ? nameFor(e.username) : '—'}</span>
                <span><Tag tone={ACTION_TONE[e.action] || 'neutral'}>{ACTION_LABEL[e.action] || e.action}</Tag></span>
                <span style={{ color: INK }}>{e.resource}</span>
                <span style={{ color: e.patient_name ? INK : SUBTLE }}>{e.patient_name || '—'}</span>
                <span style={{ color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: isMobile ? 'normal' : 'nowrap' }} title={describeDetails(e)}>{describeDetails(e) || '—'}</span>
                <span style={{ color: refused ? TONES.danger.fg : MUTED, ...NUMERIC }} title={refused ? 'Refused or failed' : 'Succeeded'}>{refused ? `Failed ${e.status}` : 'OK'}</span>
              </div>
            );
          })}
          {data.more && (
            <button type="button" onClick={loadMore} disabled={loadingMore} style={buttonStyle('secondary', { marginTop: 12 })}>
              {loadingMore ? 'Loading...' : 'Show older entries'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
