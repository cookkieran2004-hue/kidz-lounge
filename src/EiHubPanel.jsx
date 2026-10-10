import { useState } from 'react';
import EiHubSessions from './EiHubSessions';
import EiHubChildren from './EiHubChildren';
import EiHubSetup from './EiHubSetup';
import { HAIRLINE, INK, ACCENT } from './uiTokens';

// The Billing page's EI-Hub Entry tab (Admins and Developers): the month's EI
// sessions and getting each into EI-Hub, by claim file or by hand
// (EiHubSessions.jsx), each EI child's billing details (EiHubChildren.jsx),
// and the agency / provider setup every claim file needs (EiHubSetup.jsx).
const SECTIONS = [
  { key: 'sessions', label: 'Sessions' },
  { key: 'children', label: 'Children' },
  { key: 'setup', label: 'Setup' },
];

export default function EiHubPanel({ month }) {
  const [section, setSection] = useState('sessions');
  return (
    <div>
      <div role="tablist" aria-label="EI-Hub" style={{ display: 'inline-flex', border: `1px solid ${HAIRLINE}`, borderRadius: 6, overflow: 'hidden', marginBottom: 12, background: 'white' }}>
        {SECTIONS.map((s, i) => (
          <button key={s.key} type="button" role="tab" aria-selected={section === s.key} onClick={() => setSection(s.key)}
            style={{
              padding: '7px 14px', border: 'none', borderRight: i < SECTIONS.length - 1 ? `1px solid ${HAIRLINE}` : 'none',
              background: section === s.key ? '#F5F3FF' : 'white', color: section === s.key ? ACCENT : INK,
              fontSize: 13, fontWeight: section === s.key ? 600 : 500, fontFamily: 'inherit', cursor: 'pointer',
            }}>
            {s.label}
          </button>
        ))}
      </div>
      {section === 'sessions' && <EiHubSessions month={month} />}
      {section === 'children' && <EiHubChildren />}
      {section === 'setup' && <EiHubSetup />}
    </div>
  );
}
