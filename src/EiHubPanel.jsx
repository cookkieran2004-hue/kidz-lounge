import { useState } from 'react';
import EiHubSessions from './EiHubSessions';
import EiHubChildren from './EiHubChildren';
import EiHubSetup from './EiHubSetup';
import EiHubImport from './EiHubImport';
import { HAIRLINE, INK, ACCENT } from './uiTokens';

// The Billing page's EI-Hub Entry tab: the month's EI sessions and getting
// each into EI-Hub, by claim file or by hand (EiHubSessions.jsx), each EI
// child's billing details (EiHubChildren.jsx), the agency / provider setup
// every claim file needs (EiHubSetup.jsx) -- Admins and Developers -- and
// importing EI-Hub's Child Info and Authorizations report (EiHubImport.jsx),
// which Reception can do too (`full` false: Import only).
const ALL_SECTIONS = [
  { key: 'sessions', label: 'Sessions' },
  { key: 'children', label: 'Children' },
  { key: 'import', label: 'Import' },
  { key: 'setup', label: 'Setup' },
];

export default function EiHubPanel({ month, full = true }) {
  const SECTIONS = full ? ALL_SECTIONS : ALL_SECTIONS.filter(x => x.key === 'import');
  const [section, setSection] = useState(full ? 'sessions' : 'import');
  return (
    <div>
      <div role="tablist" aria-label="EI-Hub" style={{ display: 'inline-flex', border: `1px solid ${HAIRLINE}`, borderRadius: 6, overflow: 'hidden', marginBottom: 12, background: 'white' }}>
        {SECTIONS.map((s, i) => (
          <button key={s.key} type="button" role="tab" aria-selected={section === s.key} onClick={() => setSection(s.key)}
            style={{
              padding: '7px 14px', border: 'none', borderRight: i < SECTIONS.length - 1 ? `1px solid ${HAIRLINE}` : 'none',
              background: section === s.key ? 'var(--brand-tint)' : 'white', color: section === s.key ? ACCENT : INK,
              fontSize: 13, fontWeight: section === s.key ? 600 : 500, fontFamily: 'inherit', cursor: 'pointer',
            }}>
            {s.label}
          </button>
        ))}
      </div>
      {section === 'sessions' && <EiHubSessions month={month} />}
      {section === 'children' && <EiHubChildren />}
      {section === 'import' && <EiHubImport />}
      {section === 'setup' && <EiHubSetup />}
    </div>
  );
}
