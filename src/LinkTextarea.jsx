import { useRef, useState } from 'react';
import { markdownLink, MARKDOWN_LINK_RE } from './patientLinks';

// A <textarea> with an "Insert link" button, like Word's: type the text to
// display and the address, and it goes in as "[text](address)", which
// src/Linkify.jsx shows as just the text, clickable. With the cursor on an
// existing link the button edits it instead. Pass the same props as a
// textarea; onChange gets { target: { value } } when a link is inserted.
// A box that's also where the text is read (a meeting agenda) would only
// show "[text](address)", so the links in the text are listed under it,
// clickable, by their text.
export default function LinkTextarea({ value, onChange, style, ...props }) {
  const ref = useRef(null);
  const [panel, setPanel] = useState(null); // { start, end, text, url, editing }
  const v = value || '';

  const open = () => {
    const el = ref.current;
    const start = el ? el.selectionStart : v.length;
    const end = el ? el.selectionEnd : v.length;
    // On an existing [text](url)? Edit that one.
    for (const m of v.matchAll(MARKDOWN_LINK_RE)) {
      if (start >= m.index && start <= m.index + m[0].length) {
        setPanel({ start: m.index, end: m.index + m[0].length, text: m[1], url: m[2], editing: true });
        return;
      }
    }
    setPanel({ start, end, text: v.slice(start, end), url: '', editing: false });
  };
  const insert = () => {
    if (!panel.url.trim()) return;
    const link = markdownLink(panel.text, panel.url);
    const next = v.slice(0, panel.start) + link + v.slice(panel.end);
    onChange({ target: { value: next }, currentTarget: { value: next } });
    setPanel(null);
    requestAnimationFrame(() => { const el = ref.current; if (el) { el.focus(); const at = panel.start + link.length; el.setSelectionRange(at, at); } });
  };
  const named = [...v.matchAll(MARKDOWN_LINK_RE)].map(m => ({ text: m[1], href: /^https?:\/\//i.test(m[2]) ? m[2] : `https://${m[2]}` }));
  const box = { boxSizing: 'border-box', padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, fontFamily: 'inherit', minWidth: 0 };

  return (
    <div style={{ width: style?.width || '100%' }}>
      <textarea ref={ref} value={value} onChange={onChange} style={style} {...props} />
      {panel ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.3fr) auto auto', gap: 6, alignItems: 'center', marginTop: 4 }}>
          <input autoFocus style={box} value={panel.text} onChange={e => setPanel(p => ({ ...p, text: e.target.value }))} placeholder="Text to display" aria-label="Text to display"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); insert(); } if (e.key === 'Escape') setPanel(null); }} />
          <input style={box} value={panel.url} onChange={e => setPanel(p => ({ ...p, url: e.target.value }))} placeholder="https://..." aria-label="Link address"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); insert(); } if (e.key === 'Escape') setPanel(null); }} />
          <button type="button" onClick={insert} disabled={!panel.url.trim()}
            style={{ border: 'none', borderRadius: 6, background: '#6D28D9', color: 'white', fontWeight: 600, fontSize: 12, padding: '6px 10px', cursor: 'pointer', opacity: panel.url.trim() ? 1 : 0.5 }}>
            {panel.editing ? 'Update' : 'Insert'}
          </button>
          <button type="button" onClick={() => setPanel(null)} style={{ border: 'none', background: 'none', color: '#6b7280', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
          {named.length > 0 && (
            <span style={{ fontSize: 12, color: '#6b7280', minWidth: 0, overflowWrap: 'anywhere' }}>
              Links:{' '}
              {named.map((l, i) => (
                <span key={i}>
                  {i > 0 && ' · '}
                  <a href={l.href} target="_blank" rel="noopener noreferrer" style={{ color: '#6D28D9', textDecoration: 'underline' }}>{l.text}</a>
                </span>
              ))}
            </span>
          )}
          <button type="button" onMouseDown={e => e.preventDefault()} onClick={open}
            style={{ marginLeft: 'auto', flexShrink: 0, border: 'none', background: 'none', color: '#6D28D9', fontWeight: 600, fontSize: 11.5, cursor: 'pointer', padding: '2px 0' }}>
            Insert link
          </button>
        </div>
      )}
    </div>
  );
}
