import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from './api';
import { useAuth } from './AuthContext';

// Popup telling someone their support ticket was resolved (only tickets
// they sent while signed in). Checks on sign-in, every minute, and on
// each page change; shows one at a time. OK dismisses it for good.
export default function SupportNotifier() {
  const { user } = useAuth();
  const location = useLocation();
  // Tagged with whose they are, so signing out (or in as someone else)
  // never shows the previous person's popup.
  const [state, setState] = useState({ owner: null, list: [] });
  const okRef = useRef(null);
  const busy = useRef(false);

  const check = useCallback(async () => {
    if (!user || user.mustResetPassword || busy.current) return;
    busy.current = true;
    try {
      const list = await api.getMySupportNotices();
      setState({ owner: user.username, list: list || [] });
    } catch {
      // Background check -- stay quiet if it fails.
    }
    busy.current = false;
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;
    const timer = setInterval(check, 60 * 1000);
    return () => clearInterval(timer);
  }, [user, check]);
  // On sign-in and on every page change.
  useEffect(() => {
    const t = setTimeout(check, 3500); // background: after the page's own requests
    return () => clearTimeout(t);
  }, [check, location.pathname]);

  const notices = user && state.owner === user.username ? state.list : [];
  const current = notices[0];
  useEffect(() => { if (current) okRef.current?.focus(); }, [current]);

  if (!user || !current) return null;

  const dismiss = async () => {
    setState(st => ({ ...st, list: st.list.slice(1) }));
    try { await api.markSupportNoticeSeen(current.id); } catch { /* shows again next check */ }
  };
  const firstLine = (current.issue || '').split('\n')[0];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10100, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="kl-support-notice-title"
        onKeyDown={e => { if (e.key === 'Escape') dismiss(); }}
        style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 420, padding: '22px 22px 18px', boxShadow: '0 20px 50px rgba(0,0,0,0.2)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: '50%', background: '#ECFDF3', color: '#067647', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16 }}>&#10003;</span>
          <h2 id="kl-support-notice-title" style={{ margin: 0, fontSize: 17, color: '#111827' }}>Your support ticket #{current.id} was resolved</h2>
        </div>
        <p style={{ margin: '0 0 6px', fontSize: 13, color: '#6b7280' }}>You wrote:</p>
        <p style={{ margin: '0 0 12px', fontSize: 14, color: '#111827', whiteSpace: 'pre-wrap' }}>{firstLine}{firstLine.length < (current.issue || '').length ? '...' : ''}</p>
        {current.resolution_note && (
          <>
            <p style={{ margin: '0 0 6px', fontSize: 13, color: '#6b7280' }}>Note from support:</p>
            <p style={{ margin: '0 0 12px', fontSize: 14, color: '#111827', whiteSpace: 'pre-wrap' }}>{current.resolution_note}</p>
          </>
        )}
        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#6b7280' }}>Still having trouble? Send a new ticket from Help &amp; Support at the bottom of the page.</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
          {notices.length > 1 && <span style={{ fontSize: 12, color: '#9ca3af', marginRight: 'auto' }}>{notices.length - 1} more</span>}
          <button ref={okRef} type="button" onClick={dismiss} style={{ padding: '8px 22px', borderRadius: 8, border: 'none', background: '#6D28D9', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>OK</button>
        </div>
      </div>
    </div>
  );
}
