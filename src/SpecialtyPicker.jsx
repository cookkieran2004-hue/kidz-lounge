import { useState, useEffect, useRef } from 'react';
import { DISCIPLINES, DISCIPLINE_NAMES, disciplinesOf } from './disciplines';
import { INK, MUTED, SUBTLE, HAIRLINE } from './uiTokens';

// A provider's specialty: a dropdown of the practice's disciplines (ST, OT,
// PT, SI -- src/disciplines.js, the same ones the schedule filters and the
// waitlist use) where several can be ticked. Saved as "ST/OT", which
// disciplinesOf() reads back. An older free-text value is shown as ticked
// disciplines if it names any ("Speech-Language Pathologist" -> ST);
// otherwise it's shown as-is until something is picked.
export default function SpecialtyPicker({ value, onChange, style, id }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const picked = disciplinesOf({ specialty: value || '' });
  const unrecognised = value && value.trim() && picked.size === 0 ? value.trim() : null;

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const toggle = (d) => {
    const next = new Set(picked);
    if (next.has(d)) next.delete(d); else next.add(d);
    onChange(DISCIPLINES.filter(x => next.has(x)).join('/'));
  };
  const label = picked.size ? DISCIPLINES.filter(d => picked.has(d)).join(', ') : (unrecognised || 'Choose specialty');

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button" id={id} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(o => !o)}
        style={{
          ...style, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          textAlign: 'left', cursor: 'pointer', background: 'white', color: picked.size || unrecognised ? INK : SUBTLE,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke={MUTED} strokeWidth="1.5" /></svg>
      </button>
      {open && (
        <div role="listbox" aria-multiselectable="true" style={{ position: 'absolute', left: 0, right: 0, top: 'calc(100% + 4px)', zIndex: 20, background: 'white', border: `1px solid ${HAIRLINE}`, borderRadius: 6, padding: 4, boxShadow: '0 6px 16px rgba(0,0,0,0.08)' }}>
          {DISCIPLINES.map(d => (
            <div
              key={d} role="option" aria-selected={picked.has(d)} tabIndex={0}
              onClick={() => toggle(d)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(d); } }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 13.5, color: INK }}
            >
              <input type="checkbox" checked={picked.has(d)} readOnly tabIndex={-1} style={{ margin: 0, pointerEvents: 'none' }} />
              <span style={{ fontWeight: 600, minWidth: 24 }}>{d}</span>
              <span style={{ color: MUTED, fontSize: 12.5 }}>{DISCIPLINE_NAMES[d]}</span>
            </div>
          ))}
          {unrecognised && <div style={{ padding: '6px 8px 4px', fontSize: 12, color: MUTED }}>Currently "{unrecognised}". Pick one or more to replace it.</div>}
        </div>
      )}
    </div>
  );
}
