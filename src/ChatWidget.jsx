import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from './api';
import { useAuth } from './AuthContext';
import { useChat } from './ChatContext';

const BRAND_PURPLE = '#6D28D9';
const BORDER = '#E2E4E9';

const WARNING_TEXT = 'Chats are temporary and automatically deleted after 72 hours. For anything you need to keep, use Tasks or the patient\u2019s chart instead.';

function resolveDisplayName(username, directoryMap, currentUser) {
  if (username === currentUser.username) {
    return currentUser.preferredName || [currentUser.firstName, currentUser.lastName].filter(Boolean).join(' ') || currentUser.username;
  }
  return directoryMap[username] || username;
}

function conversationTitle(convo, directoryMap, currentUser) {
  if (convo.type === 'group' && convo.name) return convo.name;
  const others = (convo.participants || []).filter(u => u !== currentUser.username);
  if (others.length === 0) return '(just you)';
  return others.map(u => resolveDisplayName(u, directoryMap, currentUser)).join(', ');
}

function formatMessageTime(isoString) {
  const d = new Date(isoString);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatListTimestamp(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ChatBubbleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function NewChatView({ directory, onCreate, onCancel }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const filtered = directory.filter(d => d.display_name.toLowerCase().includes(search.toLowerCase()) || d.username.toLowerCase().includes(search.toLowerCase()));

  const toggle = (username) => {
    setSelected(sel => (sel.includes(username) ? sel.filter(u => u !== username) : [...sel, username]));
  };

  const submit = async () => {
    if (selected.length === 0) return;
    setCreating(true);
    setError(null);
    try {
      const type = selected.length > 1 ? 'group' : 'direct';
      await onCreate({ type, name: type === 'group' ? (groupName.trim() || undefined) : undefined, participant_usernames: selected });
    } catch (err) {
      setError(err.message);
    }
    setCreating(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${BORDER}` }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search staff..."
          style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 13, boxSizing: 'border-box' }}
        />
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.map(d => (
          <label key={d.username} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" checked={selected.includes(d.username)} onChange={() => toggle(d.username)} />
            {d.display_name}
          </label>
        ))}
        {filtered.length === 0 && <p style={{ fontSize: 12.5, color: '#9ca3af', textAlign: 'center', marginTop: 20 }}>No matches</p>}
      </div>
      {selected.length > 1 && (
        <div style={{ padding: '8px 14px', borderTop: `1px solid ${BORDER}` }}>
          <input
            value={groupName}
            onChange={e => setGroupName(e.target.value)}
            placeholder="Group name (optional)"
            style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 13, boxSizing: 'border-box' }}
          />
        </div>
      )}
      {error && <p style={{ color: '#dc2626', fontSize: 12, padding: '0 14px', margin: '6px 0 0' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: `1px solid ${BORDER}` }}>
        <button onClick={onCancel} style={{ flex: 1, padding: '8px', borderRadius: 6, fontSize: 13, fontWeight: 600, border: `1px solid ${BORDER}`, background: 'white', color: '#374151', cursor: 'pointer' }}>
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={creating || selected.length === 0}
          style={{ flex: 1, padding: '8px', borderRadius: 6, fontSize: 13, fontWeight: 600, border: 'none', background: BRAND_PURPLE, color: 'white', cursor: 'pointer' }}
        >
          {creating ? 'Starting...' : selected.length > 1 ? 'Start Group' : 'Start Chat'}
        </button>
      </div>
    </div>
  );
}

function ThreadView({ conversation, directory, directoryMap, currentUser, onBack, onParticipantAdded }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [addingPerson, setAddingPerson] = useState(false);
  const scrollRef = useRef(null);

  const loadMessages = useCallback(async () => {
    try {
      const data = await api.getMessages(conversation.id);
      setMessages(data || []);
    } catch (err) {
      // background poll -- ignore
    }
  }, [conversation.id]);

  useEffect(() => {
    loadMessages();
    api.markConversationRead(conversation.id).catch(() => {});
    const interval = setInterval(loadMessages, 5000);
    return () => clearInterval(interval);
  }, [conversation.id, loadMessages]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      await api.sendMessage(conversation.id, text.trim());
      setText('');
      await loadMessages();
    } catch (err) {
      // keep the typed text so nothing is lost on a transient failure
    }
    setSending(false);
  };

  const addPerson = async (username) => {
    try {
      await api.addChatParticipant(conversation.id, username);
      setAddingPerson(false);
      onParticipantAdded();
    } catch (err) {
      setAddingPerson(false);
    }
  };

  const notInConvo = directory.filter(d => !(conversation.participants || []).includes(d.username));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: `1px solid ${BORDER}` }}>
        <button onClick={onBack} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, color: '#6b7280', padding: 0 }}>&larr;</button>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: '#111827', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {conversationTitle(conversation, directoryMap, currentUser)}
        </span>
        {conversation.type === 'group' && (
          <button onClick={() => setAddingPerson(o => !o)} title="Add someone" style={{ border: `1px solid ${BORDER}`, background: 'white', borderRadius: 6, width: 24, height: 24, cursor: 'pointer', fontSize: 14, lineHeight: 1, color: BRAND_PURPLE }}>
            +
          </button>
        )}
      </div>

      {addingPerson && (
        <div style={{ borderBottom: `1px solid ${BORDER}`, maxHeight: 140, overflowY: 'auto' }}>
          {notInConvo.length === 0 ? (
            <p style={{ fontSize: 12, color: '#9ca3af', padding: '8px 14px', margin: 0 }}>Everyone is already in this chat.</p>
          ) : (
            notInConvo.map(d => (
              <button
                key={d.username}
                onClick={() => addPerson(d.username)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 14px', border: 'none', background: 'white', cursor: 'pointer', fontSize: 12.5 }}
              >
                {d.display_name}
              </button>
            ))
          )}
        </div>
      )}

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.map(m => {
          const isOwn = m.sender_username === currentUser.username;
          return (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
              {!isOwn && conversation.type === 'group' && (
                <span style={{ fontSize: 10.5, color: '#9ca3af', marginBottom: 2 }}>{resolveDisplayName(m.sender_username, directoryMap, currentUser)}</span>
              )}
              <div style={{
                maxWidth: '80%', padding: '7px 11px', borderRadius: 12,
                background: isOwn ? BRAND_PURPLE : '#f1f2f4', color: isOwn ? 'white' : '#111827', fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {m.text}
              </div>
              <span style={{ fontSize: 9.5, color: '#c1c5cc', marginTop: 2 }}>{formatMessageTime(m.created_at)}</span>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 6, padding: 10, borderTop: `1px solid ${BORDER}` }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send(); }}
          placeholder="Type a message..."
          style={{ flex: 1, padding: '7px 10px', borderRadius: 16, border: `1px solid ${BORDER}`, fontSize: 13 }}
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          style={{ padding: '7px 14px', borderRadius: 16, fontSize: 13, fontWeight: 600, border: 'none', background: BRAND_PURPLE, color: 'white', cursor: 'pointer' }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

export default function ChatWidget() {
  const { user } = useAuth();
  const { conversations, refreshConversations, widgetOpen, setWidgetOpen, activeConversationId, setActiveConversationId, totalUnread, newChatTrigger } = useChat();
  const [subView, setSubView] = useState('list'); // list | new
  const [directory, setDirectory] = useState([]);

  useEffect(() => {
    if (user && widgetOpen && directory.length === 0) {
      api.getChatDirectory().then(setDirectory).catch(() => {});
    }
  }, [user, widgetOpen, directory.length]);

  useEffect(() => {
    if (newChatTrigger > 0) setSubView('new');
  }, [newChatTrigger]);

  if (!user) return null;

  const directoryMap = {};
  directory.forEach(d => { directoryMap[d.username] = d.display_name; });

  const activeConversation = conversations.find(c => c.id === activeConversationId);

  const handleCreateConversation = async (record) => {
    const convo = await api.createConversation(record);
    await refreshConversations();
    setActiveConversationId(convo.id);
    setSubView('list');
  };

  const handleDeleteConversation = async (convo) => {
    const title = conversationTitle(convo, directoryMap, user);
    if (!window.confirm(`Delete "${title}"? This only removes it from your own view -- other participants keep seeing it normally.`)) return;
    try {
      await api.deleteConversation(convo.id);
      if (activeConversationId === convo.id) setActiveConversationId(null);
      await refreshConversations();
    } catch (err) {
      // Background action from a small widget -- a silent no-op on failure
      // is preferable to a jarring error inside the chat list.
    }
  };

  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 9985, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {widgetOpen && (
        <div style={{
          width: 340, height: 480, background: 'white', borderRadius: 14, boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
          marginBottom: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', border: `1px solid ${BORDER}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: BRAND_PURPLE, color: 'white' }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Chat</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {activeConversationId === null && subView === 'list' && (
                <button onClick={() => setSubView('new')} style={{ border: 'none', background: 'rgba(255,255,255,0.2)', color: 'white', borderRadius: 6, padding: '3px 9px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  New
                </button>
              )}
              <button onClick={() => setWidgetOpen(false)} style={{ border: 'none', background: 'none', color: 'white', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>&times;</button>
            </div>
          </div>

          <div style={{ padding: '6px 12px', background: '#FFF7ED', borderBottom: '1px solid #FDE7C7' }}>
            <p style={{ fontSize: 10, color: '#92400E', margin: 0, lineHeight: 1.35 }}>{WARNING_TEXT}</p>
          </div>

          <div style={{ flex: 1, overflow: 'hidden' }}>
            {activeConversation ? (
              <ThreadView
                conversation={activeConversation}
                directory={directory}
                directoryMap={directoryMap}
                currentUser={user}
                onBack={() => setActiveConversationId(null)}
                onParticipantAdded={refreshConversations}
              />
            ) : subView === 'new' ? (
              <NewChatView directory={directory} onCreate={handleCreateConversation} onCancel={() => setSubView('list')} />
            ) : (
              <div style={{ height: '100%', overflowY: 'auto' }}>
                {conversations.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', marginTop: 30 }}>No conversations yet. Click "New" to start one.</p>
                ) : (
                  conversations.map(c => (
                    <div
                      key={c.id}
                      onClick={() => setActiveConversationId(c.id)}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', borderBottom: '1px solid #f1f2f4', background: 'white', cursor: 'pointer', position: 'relative' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={{ fontSize: 13, fontWeight: c.unread_count > 0 ? 700 : 500, color: '#111827' }}>
                          {conversationTitle(c, directoryMap, user)}
                        </span>
                        <span style={{ fontSize: 10.5, color: '#9ca3af', flexShrink: 0, marginLeft: 6 }}>{formatListTimestamp(c.last_message?.created_at || c.created_at)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                        <span style={{ fontSize: 12, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.last_message ? `${c.last_message.sender_username === user.username ? 'You: ' : ''}${c.last_message.text}` : 'No messages yet'}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 6 }}>
                          {c.unread_count > 0 && (
                            <span style={{ background: BRAND_PURPLE, color: 'white', fontSize: 10, fontWeight: 700, borderRadius: 999, minWidth: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                              {c.unread_count}
                            </span>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteConversation(c); }}
                            title="Delete this conversation (only removes it from your own view)"
                            style={{ border: 'none', background: 'none', color: '#c1c5cc', fontSize: 13, cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}
                          >
                            &times;
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <button
        onClick={() => { setWidgetOpen(o => !o); if (!widgetOpen) setActiveConversationId(null); }}
        style={{
          position: 'relative', width: 56, height: 56, borderRadius: '50%', background: BRAND_PURPLE, border: 'none',
          boxShadow: '0 6px 20px rgba(109,40,217,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginLeft: 'auto',
        }}
        aria-label="Toggle chat"
      >
        <ChatBubbleIcon />
        {!widgetOpen && totalUnread > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -2, background: '#dc2626', color: 'white', fontSize: 10.5, fontWeight: 700,
            borderRadius: 999, minWidth: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', border: '2px solid white',
          }}>
            {totalUnread}
          </span>
        )}
      </button>
    </div>
  );
}
