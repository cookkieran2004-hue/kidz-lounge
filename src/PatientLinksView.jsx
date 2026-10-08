import { useState } from 'react';
import { parseLinks, serializeLinks, linkLabel, normalizeUrl } from './patientLinks';

// A patient's links (src/patientLinks.js): the list shown on the chart and
// the appointment window, and the editor used by the patient form, the
// chart and the data table. `value` / `onChange` are the stored string.

const BORDER = '#E2E8F0';
const MUTED = '#64748B';

export function PatientLinksList({ value, color = '#1D4ED8' }) {
  const links = parseLinks(value);
  if (!links.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {links.map((l, i) => (
        <a key={i} href={normalizeUrl(l.url)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
          style={{ fontSize: 13, color, fontWeight: 600, overflowWrap: 'anywhere' }}>
          {linkLabel(l)}
        </a>
      ))}
    </div>
  );
}

export function PatientLinksEditor({ value, onChange, inputStyle }) {
  const [rows, setRows] = useState(() => {
    const l = parseLinks(value);
    return l.length ? l : [{ text: '', url: '' }];
  });
  const update = (next) => { setRows(next); onChange(serializeLinks(next)); };
  const set = (i, patch) => update(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const input = { boxSizing: 'border-box', padding: '8px 10px', borderRadius: 7, border: `1.5px solid ${BORDER}`, fontSize: 13.5, fontFamily: 'inherit', width: '100%', ...(inputStyle || {}) };
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr) auto', gap: 8, alignItems: 'center' }}>
          <input style={input} value={r.text} onChange={e => set(i, { text: e.target.value })} placeholder="Text to display" aria-label={`Link ${i + 1} text to display`} />
          <input style={input} value={r.url} onChange={e => set(i, { url: e.target.value })} placeholder="https://..." aria-label={`Link ${i + 1} address`} />
          <button type="button" onClick={() => update(rows.length > 1 ? rows.filter((_, j) => j !== i) : [{ text: '', url: '' }])}
            aria-label={`Remove link ${i + 1}`} style={{ border: 'none', background: 'none', color: '#B42318', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', padding: '0 4px' }}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" onClick={() => setRows([...rows, { text: '', url: '' }])}
        style={{ justifySelf: 'start', border: 'none', background: 'none', color: '#6D28D9', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', padding: 0 }}>
        + Add link
      </button>
      <span style={{ fontSize: 11.5, color: MUTED }}>The text is what people see; leave it empty to show the address.</span>
    </div>
  );
}
