import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useIsMobile } from '../useIsMobile';
import { Card, PageHeader, Tag, UnderlineTabs } from '../dashboardUi';
import { INK, MUTED, HAIRLINE, PAGE_BG, FONT, NUMERIC, TONES, buttonStyle } from '../uiTokens';
import { CREDENTIAL_TYPES, credentialType, credentialTone } from '../credentialTypes';
import { CredentialsPanel } from './MyProfilePage';

// Credentials (footer link; Reception, Admin, Developer; Kieran, Oct 2026):
// everyone's licences and certifications in one place, to update as
// paperwork comes in. "All credentials" (first) is a grid of people by
// required credential; "Needs attention" lists what's expired, expiring
// within 60 days, or missing (a provider's 9 required credentials). Clicking a person
// opens the same editor as their profile (CredentialsPanel). Data: the API's
// GET /credentials/overview, active staff only, providers first.

const dash = <span style={{ color: MUTED }}>—</span>;
// '2027-03-12' -> '03/12/27'
const short = (d) => (d ? `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(2, 4)}` : '');
const longDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// A person's entry for one required credential: the one that lasts longest
// (several Trainings entries, one per year, are normal).
function bestOf(person, typeName) {
  const list = person.credentials.filter(c => credentialType(c.credential_name)?.name === typeName);
  if (!list.length) return null;
  return list.find(c => !c.expiration_date) || [...list].sort((a, b) => b.expiration_date.localeCompare(a.expiration_date))[0];
}

// Everything that needs doing, most urgent first: expired (longest overdue
// first), expiring soon (soonest first), then providers' missing ones.
function attentionItems(people) {
  const items = [];
  for (const p of people) {
    const seen = [];
    for (const t of CREDENTIAL_TYPES) {
      const c = bestOf(p, t.name);
      if (c) seen.push(c);
      else if (p.is_provider) items.push({ person: p, kind: 'missing', name: t.name, rank: 2, sortKey: 0 });
    }
    // Credentials outside the required list ("Other") count on their own.
    for (const c of p.credentials) if (!credentialType(c.credential_name)) seen.push(c);
    for (const c of seen) {
      const tone = credentialTone(c);
      if (tone.key === 'expired' || tone.key === 'soon') {
        items.push({ person: p, kind: tone.key, name: c.credential_name, date: c.expiration_date, tone, rank: tone.key === 'expired' ? 0 : 1, sortKey: tone.left });
      }
    }
  }
  return items.sort((a, b) => (a.rank - b.rank) || (a.sortKey - b.sortKey) || a.person.name.localeCompare(b.person.name));
}

function Cell({ person, type, onOpen }) {
  const c = bestOf(person, type.name);
  let body;
  if (!c) body = person.is_provider ? <Tag tone="warning">Missing</Tag> : dash;
  else {
    const tone = credentialTone(c);
    const color = { expired: TONES.danger.fg, soon: TONES.warning.fg, valid: INK, none: INK }[tone.key];
    body = (
      <span title={`${c.credential_name}${c.expiration_date ? ` · expires ${longDate(c.expiration_date)}` : ''}${c.notes ? ` · ${c.notes}` : ''}`}
        style={{ color, fontWeight: tone.key === 'expired' || tone.key === 'soon' ? 600 : 400, ...NUMERIC }}>
        {c.expiration_date ? short(c.expiration_date) : 'On file'}
      </span>
    );
  }
  return (
    <td style={{ padding: 0, borderBottom: `1px solid ${HAIRLINE}`, textAlign: 'center' }}>
      <button type="button" onClick={() => onOpen(person.username)}
        style={{ width: '100%', padding: '9px 6px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5 }}>
        {body}
      </button>
    </td>
  );
}

function EditorDialog({ person, onClose, onChanged, isMobile }) {
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={`${person.name}'s credentials`} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000, display: 'flex', alignItems: isMobile ? 'stretch' : 'flex-start', justifyContent: 'center', padding: isMobile ? 0 : '48px 16px', overflowY: 'auto' }}>
      <div style={{ background: PAGE_BG, borderRadius: isMobile ? 0 : 10, width: '100%', maxWidth: 760, padding: isMobile ? 14 : 20, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600, color: INK }}>{person.name}</div>
            <div style={{ fontSize: 12.5, color: MUTED }}>{[person.is_provider ? 'Provider' : null, person.position].filter(Boolean).join(' · ') || person.username}</div>
          </div>
          <button type="button" onClick={onClose} style={buttonStyle('secondary')}>Done</button>
        </div>
        <CredentialsPanel credentials={person.credentials} username={person.username} required={person.is_provider} isMobile={isMobile} onChanged={onChanged} />
      </div>
    </div>
  );
}

export default function CredentialsPage() {
  const isMobile = useIsMobile(900);
  const [staff, setStaff] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const [providersOnly, setProvidersOnly] = useState(false);
  const [editing, setEditing] = useState(null); // username

  const load = useCallback(() => api.getCredentialOverview()
    .then(r => { setStaff(r.staff || []); setError(null); })
    .catch(err => setError(err.message)), []);
  useEffect(() => { load(); }, [load]);

  const people = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (staff || []).filter(p => (!providersOnly || p.is_provider) && (!q || p.name.toLowerCase().includes(q) || p.username.toLowerCase().includes(q)));
  }, [staff, query, providersOnly]);
  const items = useMemo(() => attentionItems(people), [people]);
  const urgent = items.filter(i => i.kind === 'expired').length;
  const editingPerson = staff?.find(p => p.username === editing) || null;

  const controls = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 14 }}>
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name" aria-label="Search by name"
        style={{ padding: '8px 10px', borderRadius: 6, border: `1px solid ${HAIRLINE}`, fontSize: 13, fontFamily: 'inherit', width: isMobile ? '100%' : 240, boxSizing: 'border-box' }} />
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: INK, cursor: 'pointer' }}>
        <input type="checkbox" checked={providersOnly} onChange={e => setProvidersOnly(e.target.checked)} /> Providers only
      </label>
    </div>
  );

  return (
    <div style={{ background: PAGE_BG, fontFamily: FONT, minHeight: '100%' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: isMobile ? '18px 14px 40px' : '28px 28px 56px' }}>
        <PageHeader title="Credentials" isMobile={isMobile} />
        <UnderlineTabs label="Credentials views" active={tab} onPick={setTab} style={{ marginBottom: 16 }}
          tabs={[
            { key: 'all', label: 'All credentials' },
            { key: 'attention', label: 'Needs attention', count: staff ? items.length : null, alert: urgent ? 'danger' : items.length ? 'warning' : null },
          ]} />
        <Card pad={isMobile ? 14 : 20}>
          {error && <p role="alert" style={{ margin: 0, fontSize: 13.5, color: TONES.danger.fg }}>{error}</p>}
          {!staff && !error && <p style={{ margin: 0, fontSize: 13.5, color: MUTED }}>Loading...</p>}
          {staff && controls}

          {staff && tab === 'attention' && (items.length === 0
            ? <p style={{ margin: 0, fontSize: 13.5, color: MUTED }}>Nothing needs attention{providersOnly || query ? ' for this selection' : ''}: no credentials are expired, expiring within 60 days, or missing.</p>
            : (
              <div>
                {items.map((it, i) => (
                  <div key={`${it.person.username}-${it.name}-${i}`} style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr) 76px' : '150px minmax(0, 1.3fr) minmax(0, 1.4fr) 120px 76px', gap: isMobile ? 6 : 14, alignItems: 'center', padding: '10px 0', borderTop: i ? `1px solid ${HAIRLINE}` : 'none', fontSize: 13.5 }}>
                    {!isMobile && <span>{it.kind === 'missing' ? <Tag tone="warning">Missing</Tag> : <Tag tone={it.tone.tone}>{it.tone.text}</Tag>}</span>}
                    <span style={{ fontWeight: 600, color: INK, overflowWrap: 'anywhere' }}>
                      {it.person.name}
                      {isMobile && <span style={{ display: 'block', fontWeight: 400, color: MUTED, fontSize: 12.5 }}>{it.name} · {it.kind === 'missing' ? 'Missing' : it.tone.text}</span>}
                    </span>
                    {!isMobile && <span style={{ color: INK, overflowWrap: 'anywhere' }}>{it.name}</span>}
                    {!isMobile && <span style={{ color: MUTED, ...NUMERIC }}>{it.date ? longDate(it.date) : dash}</span>}
                    <button type="button" onClick={() => setEditing(it.person.username)} style={buttonStyle('secondary', { width: '100%' })}>{it.kind === 'missing' ? 'Add' : 'Update'}</button>
                  </div>
                ))}
              </div>
            ))}

          {staff && tab === 'all' && (people.length === 0
            ? <p style={{ margin: 0, fontSize: 13.5, color: MUTED }}>No one matches.</p>
            : isMobile ? (
              <div>
                {people.map((p, i) => (
                  <button key={p.username} type="button" onClick={() => setEditing(p.username)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 0', border: 'none', borderTop: i ? `1px solid ${HAIRLINE}` : 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                    <div style={{ fontWeight: 600, color: INK, fontSize: 14, marginBottom: 6 }}>{p.name}{p.is_provider && <span style={{ fontWeight: 400, color: MUTED, fontSize: 12.5 }}> · Provider</span>}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '3px 12px', fontSize: 12.5 }}>
                      {CREDENTIAL_TYPES.map(t => {
                        const c = bestOf(p, t.name);
                        const tone = c ? credentialTone(c) : null;
                        return [
                          <span key={`${t.name}-n`} style={{ color: MUTED }}>{t.name}</span>,
                          <span key={`${t.name}-v`} style={{ color: !c ? (p.is_provider ? TONES.warning.fg : MUTED) : tone.key === 'expired' ? TONES.danger.fg : tone.key === 'soon' ? TONES.warning.fg : INK, ...NUMERIC }}>
                            {!c ? (p.is_provider ? 'Missing' : '—') : c.expiration_date ? short(c.expiration_date) : 'On file'}
                          </span>,
                        ];
                      })}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '0 8px 8px 0', color: MUTED, fontWeight: 500, width: '17%', borderBottom: `1px solid ${HAIRLINE}` }}>Name</th>
                    {CREDENTIAL_TYPES.map(t => (
                      <th key={t.name} style={{ padding: '0 4px 8px', color: MUTED, fontWeight: 500, borderBottom: `1px solid ${HAIRLINE}`, lineHeight: 1.25 }}>{t.name.replace('/', '/\u200b')}</th>
                    ))}
                    <th style={{ padding: '0 4px 8px', color: MUTED, fontWeight: 500, borderBottom: `1px solid ${HAIRLINE}`, width: '6%' }}>Other</th>
                  </tr>
                </thead>
                <tbody>
                  {people.map(p => {
                    const others = p.credentials.filter(c => !credentialType(c.credential_name));
                    return (
                      <tr key={p.username}>
                        <td style={{ padding: 0, borderBottom: `1px solid ${HAIRLINE}` }}>
                          <button type="button" onClick={() => setEditing(p.username)}
                            style={{ width: '100%', textAlign: 'left', padding: '9px 8px 9px 0', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: INK, overflowWrap: 'anywhere' }}>
                            {p.name}
                            {p.is_provider && <span style={{ display: 'block', fontWeight: 400, color: MUTED, fontSize: 11.5 }}>Provider</span>}
                          </button>
                        </td>
                        {CREDENTIAL_TYPES.map(t => <Cell key={t.name} person={p} type={t} onOpen={setEditing} />)}
                        <td style={{ padding: 0, borderBottom: `1px solid ${HAIRLINE}`, textAlign: 'center' }}>
                          <button type="button" onClick={() => setEditing(p.username)} title={others.map(c => c.credential_name).join(', ') || undefined}
                            style={{ width: '100%', padding: '9px 6px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, color: others.length ? INK : MUTED, ...NUMERIC }}>
                            {others.length || '—'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ))}
        </Card>
      </div>
      {editingPerson && <EditorDialog person={editingPerson} isMobile={isMobile} onClose={() => setEditing(null)} onChanged={load} />}
    </div>
  );
}
