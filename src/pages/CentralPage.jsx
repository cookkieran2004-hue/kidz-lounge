import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { useIsMobile } from '../useIsMobile';
import { PageHeader, Card, Tag, UnderlineTabs } from '../dashboardUi';
import { INK, MUTED, SUBTLE, HAIRLINE, PAGE_BG, FONT, NUMERIC, TONES, buttonStyle } from '../uiTokens';
import Linkify from '../Linkify';
import { PRACTICES, canUseCentral, isHere, practiceToken, practiceRequest, signInToPractice, signOutOfPractice } from '../centralPractices';

// Central view (Developers on the PedsDesk Demo site; see centralPractices.js):
// every practice's health, open support tickets, your chats and your open
// tasks in one place, answered right here. Each practice is asked directly
// with your sign-in there; nothing is copied or stored centrally.

const REFRESH_MS = 60 * 1000;
const THREAD_REFRESH_MS = 10 * 1000;
const URGENCY_RANK = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
const URGENCY_TONE = { Urgent: 'danger', High: 'warning', Medium: 'neutral', Low: 'neutral' };

const inputStyle = {
  boxSizing: 'border-box', padding: '7px 10px', fontSize: 13.5, fontFamily: 'inherit', color: INK,
  border: `1px solid ${HAIRLINE}`, borderRadius: 6, background: 'white', width: '100%',
};
const rowButton = {
  display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', background: 'none', border: 'none',
  padding: '10px 0', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, color: INK, minWidth: 0,
};

const sameYear = (d) => d.getFullYear() === new Date().getFullYear();
function when(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: sameYear(d) ? undefined : 'numeric' });
}
function fullWhen(iso) {
  return iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// 'YYYY-MM-DD' -> "Oct 14", without a Date round trip through UTC.
function dueLabel(ymd) {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: y === new Date().getFullYear() ? undefined : 'numeric' });
}

// ---- Loading one practice ----

const EMPTY = { signedIn: false, loading: false, error: null, health: null, healthError: null, tickets: [], chats: [], tasks: [], names: {} };

async function loadPractice(practice) {
  if (!practiceToken(practice)) return { ...EMPTY };
  const get = (path) => practiceRequest(practice, path);
  const [health, tickets, chats, tasks, directory] = await Promise.allSettled([
    get('/developer/health'), get('/support/tickets?status=open'), get('/chat/conversations'), get('/tasks'), get('/chat/directory'),
  ]);
  const all = [health, tickets, chats, tasks, directory];
  // Signed out there (expired or revoked): the card asks again.
  if (all.some(r => r.status === 'rejected' && r.reason?.status === 401)) return { ...EMPTY };
  const firstError = all.find(r => r.status === 'rejected' && r.reason?.status !== 404)?.reason;
  const names = {};
  for (const s of directory.value || []) names[s.username] = s.display_name;
  return {
    signedIn: true, loading: false,
    error: firstError && !health.value ? firstError.message : null,
    health: health.value || null,
    // A practice whose API is older than the central view has no health route yet.
    healthError: health.status === 'rejected' ? (health.reason?.status === 404 ? 'Not available until tonight\'s release reaches this practice.' : health.reason?.message) : null,
    tickets: (tickets.value || []).map(t => ({ ...t, practice })),
    chats: (chats.value || []).map(c => ({ ...c, practice })),
    tasks: (tasks.value || []).filter(t => t.status !== 'done').map(t => ({ ...t, practice })),
    names,
  };
}

// ---- Practice card: sign-in and health ----

function SignInForm({ practice, onSignedIn }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await signInToPractice(practice, username.trim(), password);
      setPassword('');
      onSignedIn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 12.5, color: MUTED }}>Sign in with your Developer account at {practice.name}.</div>
      <input aria-label={`${practice.name} username`} placeholder="Username" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} style={inputStyle} />
      <input aria-label={`${practice.name} password`} placeholder="Password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} />
      {error && <div style={{ fontSize: 12.5, color: TONES.danger.fg }}>{error}</div>}
      <div><button type="submit" disabled={busy || !username.trim() || !password} style={buttonStyle('primary', { fontSize: 12.5, padding: '6px 12px' })}>{busy ? 'Signing in...' : 'Sign in'}</button></div>
    </form>
  );
}

function HealthLine({ label, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, padding: '5px 0', borderTop: `1px solid ${HAIRLINE}` }}>
      <span style={{ color: MUTED }}>{label}</span>
      <span style={{ color: INK, textAlign: 'right', minWidth: 0, ...NUMERIC }}>{children}</span>
    </div>
  );
}

function PracticeCard({ practice, state, onReload }) {
  const h = state.health;
  const pending = h?.migrations?.pending;
  const failed = h?.failed_sign_ins_24h;
  return (
    <Card
      pad={16}
      title={practice.name}
      action={
        <span style={{ display: 'inline-flex', gap: 4 }}>
          <a href={practice.site} target="_blank" rel="noreferrer" style={buttonStyle('text', { fontSize: 12.5, textDecoration: 'none' })}>Open site</a>
          {state.signedIn && !isHere(practice) && (
            <button type="button" onClick={() => { signOutOfPractice(practice); onReload(); }} style={buttonStyle('text', { fontSize: 12.5, color: MUTED })}>Sign out</button>
          )}
        </span>
      }
    >
      {!state.signedIn ? (
        state.loading ? <div style={{ fontSize: 13, color: MUTED }}>Loading...</div> : <SignInForm practice={practice} onSignedIn={onReload} />
      ) : state.error ? (
        <div style={{ fontSize: 13, color: TONES.danger.fg }}>{state.error}</div>
      ) : !h ? (
        <div style={{ fontSize: 13, color: MUTED }}>{state.healthError || 'Loading...'}</div>
      ) : (
        <div>
          <HealthLine label="Server"><Tag tone="success">Online</Tag> <span style={{ color: MUTED }}>{h.db_ms} ms</span></HealthLine>
          <HealthLine label="Code">
            {h.build?.sha
              ? <span title={h.build.sha}>{h.build.sha.slice(0, 7)} <span style={{ color: MUTED }}>· {fullWhen(h.build.deployed_at)}</span></span>
              : <span style={{ color: MUTED }}>Unknown until the next deploy</span>}
          </HealthLine>
          <HealthLine label="Database updates">
            {pending == null ? <span style={{ color: MUTED }}>Unknown</span>
              : pending.length ? <Tag tone="warning" title={pending.join('\n')}>{pending.length} not run</Tag>
              : <Tag tone="success">Up to date</Tag>}
          </HealthLine>
          {h.staff && <HealthLine label="Staff">{h.staff.active} active · {h.staff.signed_in_24h} signed in today</HealthLine>}
          {failed != null && <HealthLine label="Failed sign-ins (24 h)">{failed >= 5 ? <Tag tone="warning">{failed}</Tag> : failed}</HealthLine>}
          {h.staff?.last_sign_in && <HealthLine label="Last sign-in">{fullWhen(h.staff.last_sign_in)}</HealthLine>}
        </div>
      )}
    </Card>
  );
}

// ---- Tickets ----

function PracticeTag({ practice }) {
  return <Tag tone="accent">{practice.name}</Tag>;
}

function TicketRow({ t, open, onToggle, onDone }) {
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const resolve = async () => {
    setBusy(true); setError('');
    try {
      await practiceRequest(t.practice, `/support/tickets/${t.id}`, { method: 'PUT', body: JSON.stringify({ status: 'resolved', resolution_note: reply.trim() }) });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <li style={{ borderTop: `1px solid ${HAIRLINE}` }}>
      <button type="button" onClick={onToggle} aria-expanded={open} style={rowButton}>
        <Tag tone={URGENCY_TONE[t.urgency]}>{t.urgency}</Tag>
        <PracticeTag practice={t.practice} />
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.issue}</span>
        <span style={{ color: MUTED, fontSize: 12.5, whiteSpace: 'nowrap' }}>{t.contact_name} · {when(t.created_at)}</span>
      </button>
      {open && (
        <div style={{ padding: '0 0 14px' }}>
          <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 14, margin: '0 0 8px', lineHeight: 1.55, color: INK }}><Linkify text={t.issue} /></p>
          <div style={{ fontSize: 12.5, color: MUTED, display: 'grid', gap: 2, marginBottom: 10 }}>
            <span>{t.reference ? `${t.reference} · ` : ''}From {t.contact_name} · {t.contact_info} · {fullWhen(t.created_at)}</span>
            {t.page && <span style={{ overflowWrap: 'anywhere' }}>Page: {t.page}</span>}
            <span>{t.submitted_by
              ? 'Your reply is shown to them when they next sign in.'
              : 'Sent while signed out, so a reply won\'t reach them in the app. Use their contact details.'}</span>
          </div>
          <textarea aria-label="Reply" rows={3} placeholder="Reply (optional)" value={reply} onChange={e => setReply(e.target.value)} style={{ ...inputStyle, resize: 'vertical', maxWidth: 640 }} />
          {error && <div style={{ fontSize: 12.5, color: TONES.danger.fg, marginTop: 6 }}>{error}</div>}
          <div style={{ marginTop: 8 }}>
            <button type="button" disabled={busy} onClick={resolve} style={buttonStyle('primary', { fontSize: 12.5, padding: '6px 12px' })}>
              {reply.trim() ? 'Send reply and close ticket' : 'Close ticket'}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

// ---- Chats ----

function chatTitle(c, names) {
  if (c.name) return c.name;
  // The directory lists everyone but you, so the names it has are the others.
  return (c.participants || []).filter(u => names[u] !== undefined).map(u => names[u]).join(', ') || 'Conversation';
}

function ChatThread({ c, names, onChanged }) {
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(() => (
    practiceRequest(c.practice, `/chat/conversations/${c.id}/messages`).then(setMessages).catch(err => setError(err.message))
  ), [c.practice, c.id]);
  // Opening a conversation marks it read there, once.
  const onChangedRef = useRef(onChanged);
  useEffect(() => { onChangedRef.current = onChanged; });
  useEffect(() => {
    load().then(() => practiceRequest(c.practice, `/chat/conversations/${c.id}/read`, { method: 'PUT' }).then(() => onChangedRef.current()).catch(() => {}));
    const timer = setInterval(load, THREAD_REFRESH_MS);
    return () => clearInterval(timer);
  }, [load, c.practice, c.id]);
  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true); setError('');
    try {
      await practiceRequest(c.practice, `/chat/conversations/${c.id}/messages`, { method: 'POST', body: JSON.stringify({ text: text.trim() }) });
      setText('');
      await load();
      await practiceRequest(c.practice, `/chat/conversations/${c.id}/read`, { method: 'PUT' }).catch(() => {});
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ padding: '0 0 14px' }}>
      <div style={{ border: `1px solid ${HAIRLINE}`, borderRadius: 6, padding: '8px 12px', maxWidth: 640, display: 'grid', gap: 8 }}>
        {messages == null ? <span style={{ fontSize: 13, color: MUTED }}>Loading...</span>
          : !messages.length ? <span style={{ fontSize: 13, color: MUTED }}>No messages in the last 72 hours.</span>
          : messages.map(m => {
            const mine = names[m.sender_username] === undefined;
            return (
              <div key={m.id} style={{ fontSize: 13.5, lineHeight: 1.45 }}>
                <span style={{ fontWeight: 600, color: mine ? MUTED : INK }}>{mine ? 'You' : names[m.sender_username]}</span>
                <span style={{ color: SUBTLE, fontSize: 12, marginLeft: 6 }}>{when(m.created_at)}</span>
                <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: INK }}><Linkify text={m.text} /></div>
              </div>
            );
          })}
      </div>
      <form onSubmit={send} style={{ display: 'flex', gap: 8, marginTop: 8, maxWidth: 640 }}>
        <input aria-label="Message" placeholder="Reply" value={text} onChange={e => setText(e.target.value)} style={inputStyle} />
        <button type="submit" disabled={busy || !text.trim()} style={buttonStyle('primary', { fontSize: 12.5, padding: '6px 12px' })}>Send</button>
      </form>
      {error && <div style={{ fontSize: 12.5, color: TONES.danger.fg, marginTop: 6 }}>{error}</div>}
    </div>
  );
}

function ChatRow({ c, names, open, onToggle, onChanged }) {
  const last = c.last_message;
  return (
    <li style={{ borderTop: `1px solid ${HAIRLINE}` }}>
      <button type="button" onClick={onToggle} aria-expanded={open} style={rowButton}>
        <PracticeTag practice={c.practice} />
        <span style={{ fontWeight: c.unread_count ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '35%' }}>{chatTitle(c, names)}</span>
        <span style={{ flex: 1, minWidth: 0, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {last ? `${names[last.sender_username] === undefined ? 'You' : names[last.sender_username]}: ${last.text}` : 'No messages yet'}
        </span>
        {c.unread_count > 0 && <Tag tone="warning">{c.unread_count} new</Tag>}
        <span style={{ color: MUTED, fontSize: 12.5, whiteSpace: 'nowrap' }}>{when(last?.created_at || c.created_at)}</span>
      </button>
      {open && <ChatThread c={c} names={names} onChanged={onChanged} />}
    </li>
  );
}

// ---- Tasks ----

function TaskRow({ t, open, onToggle, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const overdue = t.due_date && String(t.due_date).slice(0, 10) < todayStr();
  const complete = async () => {
    setBusy(true); setError('');
    try {
      await practiceRequest(t.practice, `/tasks/${t.id}`, { method: 'PUT', body: JSON.stringify({ status: 'done' }) });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <li style={{ borderTop: `1px solid ${HAIRLINE}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" onClick={onToggle} aria-expanded={open} style={{ ...rowButton, flex: 1 }}>
          <PracticeTag practice={t.practice} />
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
          {t.due_date && (overdue
            ? <Tag tone="danger">Due {dueLabel(t.due_date)}</Tag>
            : <span style={{ color: MUTED, fontSize: 12.5, whiteSpace: 'nowrap' }}>Due {dueLabel(t.due_date)}</span>)}
        </button>
        <button type="button" disabled={busy} onClick={complete} style={buttonStyle('secondary', { fontSize: 12.5, padding: '5px 10px' })}>{busy ? 'Saving...' : 'Mark done'}</button>
      </div>
      {open && (
        <div style={{ padding: '0 0 12px', fontSize: 13, color: MUTED, display: 'grid', gap: 4 }}>
          {t.description && <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: INK, margin: 0, fontSize: 13.5 }}><Linkify text={t.description} /></p>}
          <span>From {t.assigned_by_display || t.assigned_by || 'the system'} · {fullWhen(t.created_at)}</span>
        </div>
      )}
      {error && <div style={{ fontSize: 12.5, color: TONES.danger.fg, paddingBottom: 8 }}>{error}</div>}
    </li>
  );
}

// ---- Page ----

function EmptyLine({ children }) {
  return <p style={{ fontSize: 13.5, color: MUTED, margin: 0, padding: '12px 0', borderTop: `1px solid ${HAIRLINE}` }}>{children}</p>;
}

export default function CentralPage() {
  const { user } = useAuth();
  const isMobile = useIsMobile(768);
  const [states, setStates] = useState(() => Object.fromEntries(PRACTICES.map(p => [p.id, { ...EMPTY, loading: !!practiceToken(p) }])));
  const [tab, setTab] = useState('tickets');
  const [openKey, setOpenKey] = useState(null);

  const reload = useCallback((practice) => {
    loadPractice(practice)
      .then(s => setStates(prev => ({ ...prev, [practice.id]: s })))
      .catch(err => setStates(prev => ({ ...prev, [practice.id]: { ...EMPTY, signedIn: true, error: err.message } })));
  }, []);
  const reloadAll = useCallback(() => PRACTICES.forEach(reload), [reload]);

  useEffect(() => {
    reloadAll();
    const timer = setInterval(() => { if (!document.hidden) reloadAll(); }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [reloadAll]);

  const { tickets, chats, tasks } = useMemo(() => {
    const all = PRACTICES.map(p => states[p.id]).filter(s => s.signedIn);
    return {
      tickets: all.flatMap(s => s.tickets).sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] || new Date(b.created_at) - new Date(a.created_at)),
      chats: all.flatMap(s => s.chats).sort((a, b) => (b.unread_count > 0) - (a.unread_count > 0)
        || new Date(b.last_message?.created_at || b.created_at) - new Date(a.last_message?.created_at || a.created_at)),
      tasks: all.flatMap(s => s.tasks).sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')) || new Date(b.created_at) - new Date(a.created_at)),
    };
  }, [states]);

  if (!canUseCentral(user)) return <Navigate to="/" replace />;

  const unread = chats.reduce((n, c) => n + (c.unread_count || 0), 0);
  const signedOut = PRACTICES.filter(p => !states[p.id].signedIn && !states[p.id].loading);
  const toggle = (key) => setOpenKey(k => (k === key ? null : key));
  const key = (item, kind) => `${kind}:${item.practice.id}:${item.id}`;

  return (
    <div style={{ background: PAGE_BG, minHeight: '100%', fontFamily: FONT }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '16px' : '28px 24px' }}>
        <PageHeader
          title="Central"
          isMobile={isMobile}
          actions={<button type="button" onClick={reloadAll} style={buttonStyle('secondary')}>Refresh</button>}
        />

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : `repeat(${Math.min(PRACTICES.length, 3)}, minmax(0, 1fr))`, gap: 16, marginBottom: 20 }}>
          {PRACTICES.map(p => <PracticeCard key={p.id} practice={p} state={states[p.id]} onReload={() => reload(p)} />)}
        </div>

        <Card pad={isMobile ? 14 : 20}>
          <UnderlineTabs
            label="Inbox"
            active={tab}
            onPick={(k) => { setTab(k); setOpenKey(null); }}
            tabs={[
              { key: 'tickets', label: 'Support tickets', count: tickets.length, alert: tickets.some(t => t.urgency === 'Urgent') ? 'danger' : undefined },
              { key: 'chats', label: 'Chats', count: unread || undefined, alert: unread ? 'warning' : undefined },
              { key: 'tasks', label: 'Your tasks', count: tasks.length },
            ]}
          />
          {signedOut.length > 0 && (
            <p style={{ fontSize: 12.5, color: MUTED, margin: '10px 0 0' }}>
              Not included: {signedOut.map(p => p.name).join(', ')} (sign in above).
            </p>
          )}
          <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
            {tab === 'tickets' && (tickets.length
              ? tickets.map(t => <TicketRow key={key(t, 't')} t={t} open={openKey === key(t, 't')} onToggle={() => toggle(key(t, 't'))} onDone={() => { setOpenKey(null); reload(t.practice); }} />)
              : <EmptyLine>No open support tickets.</EmptyLine>)}
            {tab === 'chats' && (chats.length
              ? chats.map(c => (
                <ChatRow key={key(c, 'c')} c={c} names={states[c.practice.id].names} open={openKey === key(c, 'c')}
                  onToggle={() => toggle(key(c, 'c'))} onChanged={() => reload(c.practice)} />
              ))
              : <EmptyLine>No chats.</EmptyLine>)}
            {tab === 'tasks' && (tasks.length
              ? tasks.map(t => <TaskRow key={key(t, 'k')} t={t} open={openKey === key(t, 'k')} onToggle={() => toggle(key(t, 'k'))} onDone={() => { setOpenKey(null); reload(t.practice); }} />)
              : <EmptyLine>No open tasks.</EmptyLine>)}
          </ul>
        </Card>
      </div>
    </div>
  );
}
