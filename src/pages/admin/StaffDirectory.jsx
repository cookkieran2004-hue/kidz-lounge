import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { Avatar } from '../../Avatar';
import { useIsMobile } from '../../useIsMobile';
import NewStaffModal from './NewStaffModal';
import {
  BRAND, BRAND_SERIF, INK, BODY, HAIRLINE, DANGER, FONT,
  cardStyle, btn, inputStyle, pill, displayName, scheduleNameFor,
} from './adminUi';

function StaffCard({ s, pendingCount, onOpen }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={() => onOpen(s, pendingCount > 0 ? 'time-off' : null)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="kl-staff-card"
      style={{
        ...cardStyle({ padding: 16 }), textAlign: 'left', cursor: 'pointer', fontFamily: FONT, width: '100%',
        display: 'flex', flexDirection: 'column', gap: 12, minHeight: 116,
        borderColor: hover ? BRAND.box : HAIRLINE,
        background: s.archived ? '#FAFAFB' : 'white',
        transition: 'border-color 120ms',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: s.archived ? 0.6 : 1 }}>
        <Avatar name={displayName(s)} size={44} />
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontFamily: BRAND_SERIF, fontSize: 17, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {displayName(s)}
          </p>
          <p style={{ margin: '1px 0 0', fontSize: 12.5, color: BRAND.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {s.position || 'No position set'}
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}>
        <span style={pill(s.role === 'admin' ? 'brand' : 'neutral')}>{s.role === 'admin' ? 'Admin' : 'Staff'}</span>
        {s.archived && <span style={pill('neutral')}>Archived</span>}
        {pendingCount > 0 && (
          <span style={pill('alert')}>
            {pendingCount} time-off {pendingCount === 1 ? 'request' : 'requests'}
          </span>
        )}
      </div>
    </button>
  );
}

export default function StaffDirectory() {
  const navigate = useNavigate();
  const isMobile = useIsMobile(768);
  const [staff, setStaff] = useState(null);
  const [providers, setProviders] = useState([]);
  const [pendingByUser, setPendingByUser] = useState({});
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [adding, setAdding] = useState(null); // null | { initialProvider }

  const load = useCallback(async () => {
    try {
      const [s, p, pending] = await Promise.all([
        api.getStaff(), api.getProviders(true), api.getAllTimeOffRequests('pending').catch(() => []),
      ]);
      const counts = {};
      pending.forEach(r => { counts[r.username] = (counts[r.username] || 0) + 1; });
      setStaff(s); setProviders(p); setPendingByUser(counts); setError(null);
    } catch (err) {
      setError(`Staff couldn't be loaded (${err.message}). Refresh the page to try again.`);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    if (!staff) return [];
    const q = query.trim().toLowerCase();
    return staff
      .filter(s => showArchived || !s.archived)
      .filter(s => !q || [displayName(s), s.first_name, s.last_name, s.position, s.username].some(v => (v || '').toLowerCase().includes(q)))
      .sort((a, b) => Number(!!a.archived) - Number(!!b.archived)
        || (a.last_name || a.username).localeCompare(b.last_name || b.username)
        || (a.first_name || '').localeCompare(b.first_name || ''));
  }, [staff, query, showArchived]);

  // Every provider should belong to a staff account. These don't yet.
  const providersWithoutAccount = useMemo(() => {
    if (!staff) return [];
    const linked = new Set(staff.map(s => s.provider_name).filter(Boolean));
    return providers.filter(p => !p.archived && !linked.has(p.Name));
  }, [staff, providers]);
  // Linked providers whose schedule name doesn't match their person yet
  // (from before names were kept in sync). Saving the account fixes it.
  const nameMismatches = useMemo(() => {
    if (!staff) return [];
    const names = new Set(providers.map(p => p.Name));
    return staff.filter(s => !s.archived && s.provider_name && names.has(s.provider_name) && scheduleNameFor(s) && scheduleNameFor(s) !== s.provider_name);
  }, [staff, providers]);

  const activeCount = staff ? staff.filter(s => !s.archived).length : 0;
  const archivedCount = staff ? staff.length - activeCount : 0;

  const openProfile = (s, section) => navigate(`/admin/staff/${encodeURIComponent(s.username)}${section ? `?section=${section}` : ''}`);

  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{ display: 'flex', alignItems: isMobile ? 'stretch' : 'center', flexDirection: isMobile ? 'column' : 'row', gap: 12, marginBottom: 18 }}>
        <p style={{ margin: 0, fontSize: 14, color: BRAND.muted }}>
          {staff && <><span style={{ fontFamily: BRAND_SERIF, fontSize: 22, fontWeight: 700, color: INK, marginRight: 6 }}>{activeCount}</span>active staff</>}
        </p>
        <div style={{ flex: 1 }} />
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name or position"
          aria-label="Search staff"
          style={inputStyle({ width: isMobile ? '100%' : 240, fontSize: 13.5 })}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: BRAND.muted, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
          Show archived{archivedCount > 0 ? ` (${archivedCount})` : ''}
        </label>
        <button type="button" onClick={() => setAdding({})} style={btn('primary')}>+ Add staff</button>
      </div>

      {error && <p role="alert" style={{ color: DANGER, fontSize: 13.5 }}>{error}</p>}

      {(providersWithoutAccount.length > 0 || nameMismatches.length > 0) && (
        <section aria-label="Needs attention" style={{ ...cardStyle({ padding: '16px 18px', marginBottom: 18, borderColor: '#FEDF89', background: '#FFFCF5' }) }}>
          {providersWithoutAccount.length > 0 && (
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: INK }}>
                {providersWithoutAccount.length === 1 ? '1 provider doesn\'t' : `${providersWithoutAccount.length} providers don't`} have an account yet
              </p>
              <p style={{ margin: '3px 0 10px', fontSize: 12.5, color: BRAND.muted }}>Every provider needs their own account. Creating one links them automatically.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {providersWithoutAccount.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', background: 'white', border: `1px solid ${HAIRLINE}`, borderRadius: 10 }}>
                    <span style={{ flex: 1, fontSize: 14, color: INK, fontWeight: 600 }}>{p.Name}{p.specialty && <span style={{ fontWeight: 400, color: BRAND.muted }}> · {p.specialty}</span>}</span>
                    <button type="button" onClick={() => setAdding({ initialProvider: p })} style={btn('secondary', { padding: '6px 12px' })}>Create account</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {nameMismatches.length > 0 && (
            <div style={{ marginTop: providersWithoutAccount.length ? 16 : 0 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: INK }}>
                {nameMismatches.length === 1 ? '1 schedule name doesn\'t' : `${nameMismatches.length} schedule names don't`} match the person's name
              </p>
              <p style={{ margin: '3px 0 10px', fontSize: 12.5, color: BRAND.muted }}>Open each profile to update it. This renames the provider on every appointment.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {nameMismatches.map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', background: 'white', border: `1px solid ${HAIRLINE}`, borderRadius: 10, flexWrap: 'wrap' }}>
                    <span style={{ flex: 1, fontSize: 13.5, color: BODY }}>
                      <span style={{ color: BRAND.muted }}>{s.provider_name}</span> <span aria-hidden="true">&rarr;</span><span className="sr-only"> should be </span> <strong style={{ color: INK }}>{scheduleNameFor(s)}</strong>
                    </span>
                    <button type="button" onClick={() => openProfile(s, 'provider')} style={btn('secondary', { padding: '6px 12px' })}>Open profile</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
      {!staff && !error && <p style={{ color: BRAND.muted, fontSize: 14 }}>Loading staff...</p>}

      {staff && visible.length === 0 && (
        <div style={{ ...cardStyle({ padding: 28, textAlign: 'center' }) }}>
          <p style={{ margin: 0, fontSize: 14, color: INK, fontWeight: 600 }}>{query ? `No one matches "${query}"` : 'Add your first staff member'}</p>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: BRAND.muted }}>
            {query ? (showArchived ? 'Try a different name or position.' : 'Try a different name, or turn on Show archived.') : 'Each person gets their own sign-in and profile.'}
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
        {visible.map(s => (
          <StaffCard key={s.id} s={s} pendingCount={pendingByUser[s.username] || 0} onOpen={openProfile} />
        ))}
      </div>

      {adding && (
        <NewStaffModal
          initialProvider={adding.initialProvider || null}
          providers={providers}
          staff={staff || []}
          isMobile={isMobile}
          onClose={() => setAdding(null)}
          onCreated={(username, { openProfile: go }) => {
            setAdding(null);
            if (go) navigate(`/admin/staff/${encodeURIComponent(username)}`);
            else load();
          }}
        />
      )}
    </div>
  );
}
