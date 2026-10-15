import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from './api';
import { useAuth } from './AuthContext';
import { canAdminister } from './roles';
import { INK, MUTED, HAIRLINE } from './uiTokens';

// The nav bar's "find anything" box (the grouped nav, Oct 2026; Kieran:
// "it is often hard to find what I am looking for"): type a child's name, a
// staff member (Admins and Developers, opens their profile) or a page and
// jump there. ⌘K / Ctrl+K focuses it from anywhere; arrows and Enter pick.
// Patients and staff load the first time it's opened, then stay for the
// session's page view.

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// Every word typed must start a word in the text ("ava br" finds Ava Brown).
function matches(text, query) {
  const words = norm(text).split(/[^a-z0-9]+/).filter(Boolean);
  return norm(query).split(/\s+/).filter(Boolean).every(q => words.some(w => w.startsWith(q)));
}

export default function NavSearch({ pages, compact = false }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [data, setData] = useState(null); // { patients, staff }
  const inputRef = useRef(null);
  const wrapRef = useRef(null);
  const loading = useRef(false);

  const load = () => {
    if (data || loading.current) return;
    loading.current = true;
    Promise.all([
      api.getPatients().catch(() => []),
      canAdminister(user) ? api.getStaffDirectory().catch(() => []) : Promise.resolve([]),
    ]).then(([patients, staff]) => setData({ patients: patients || [], staff: staff || [] }))
      .finally(() => { loading.current = false; });
  };

  // ⌘K / Ctrl+K from anywhere.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    const out = [];
    for (const p of pages) if (matches(`${p.label} ${p.group || ''} ${p.keywords || ''}`, q)) out.push({ kind: 'Page', label: p.label, detail: p.group || '', to: p.to });
    for (const p of data?.patients || []) {
      if (matches(`${p.Name} ${p.mrn || ''} ${p.ID_Number || ''}`, q) || (/\d{3,}/.test(q) && String(p.ID_Number || '').includes(q))) {
        out.push({ kind: 'Patient', label: p.Name, detail: [p.Program, p.Status && p.Status !== 'On Program' ? p.Status : null].filter(Boolean).join(' · '), to: `/patients/${encodeURIComponent(p.Name)}` });
      }
    }
    for (const s of data?.staff || []) {
      if (matches(`${s.display_name} ${s.username}`, q)) out.push({ kind: 'Staff', label: s.display_name, detail: s.username, to: `/admin/staff/${encodeURIComponent(s.username)}` });
    }
    // Pages first, then patients, then staff; at most 12.
    return out.slice(0, 12);
  }, [query, pages, data]);

  const go = (r) => {
    if (!r) return;
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
    navigate(r.to);
  };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[active]); }
    else if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
  };
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: compact ? '100%' : 260 }}>
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls="kl-nav-search-results"
        aria-label="Search patients, staff and pages"
        placeholder={compact ? 'Search patients, staff and pages' : `Search  (${isMac ? '⌘' : 'Ctrl+'}K)`}
        value={query}
        onFocus={() => { load(); setOpen(true); }}
        onChange={e => { setQuery(e.target.value); setActive(0); setOpen(true); }}
        onKeyDown={onKeyDown}
        style={{
          width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: 6, border: `1px solid ${HAIRLINE}`,
          background: '#F9FAFB', fontSize: 13, fontFamily: 'inherit', color: INK, outline: 'none',
        }}
      />
      {open && query.trim() && (
        <div id="kl-nav-search-results" role="listbox"
          style={{
            position: compact ? 'static' : 'absolute', top: '100%', left: 0, right: compact ? 0 : 'auto', width: compact ? '100%' : 360, marginTop: 6, zIndex: 1100,
            background: 'white', border: '1px solid var(--brand-border2)', borderRadius: 8, boxShadow: compact ? 'none' : '0 10px 24px color-mix(in srgb, var(--brand-ink) 12%, transparent)',
            padding: '4px 0', maxHeight: 420, overflowY: 'auto',
          }}>
          {!results.length && <div style={{ padding: '8px 12px', fontSize: 13, color: MUTED }}>{data ? 'Nothing found.' : 'Loading...'}</div>}
          {results.map((r, i) => (
            <button key={`${r.kind}-${r.to}`} type="button" role="option" aria-selected={i === active}
              onMouseEnter={() => setActive(i)} onMouseDown={e => e.preventDefault()} onClick={() => go(r)}
              style={{
                display: 'flex', alignItems: 'baseline', gap: 10, width: '100%', textAlign: 'left', padding: '7px 12px', border: 'none',
                background: i === active ? 'var(--brand-tint)' : 'white', cursor: 'pointer', fontFamily: 'inherit',
              }}>
              <span style={{ width: 52, flexShrink: 0, fontSize: 11, color: MUTED }}>{r.kind}</span>
              <span style={{ fontSize: 13.5, fontWeight: 500, color: INK, overflowWrap: 'anywhere' }}>{r.label}</span>
              {r.detail && <span style={{ fontSize: 12, color: MUTED, marginLeft: 'auto', textAlign: 'right' }}>{r.detail}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
