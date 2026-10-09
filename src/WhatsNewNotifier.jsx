import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { WHATS_NEW } from './whatsNew';

const seenKey = (username) => `kl.whatsNew.seen.${username}`;

function hasSeen(username) {
  try { return localStorage.getItem(seenKey(username)) === WHATS_NEW.id; } catch { return false; }
}

// Shows WHATS_NEW (src/whatsNew.js) once to each person after they sign in.
// Sits under the support-ticket popup (SupportNotifier), which goes first
// if both are waiting.
export default function WhatsNewNotifier() {
  const { user } = useAuth();
  const navigate = useNavigate();
  // Who has dismissed it in this tab, so it closes straight away even if
  // the browser won't store it (private mode).
  const [dismissedBy, setDismissedBy] = useState(null);
  const okRef = useRef(null);
  const show = !!user && !user.mustResetPassword && dismissedBy !== user.username && !hasSeen(user.username);
  useEffect(() => { if (show) okRef.current?.focus(); }, [show]);
  if (!show) return null;

  const dismiss = () => {
    try { localStorage.setItem(seenKey(user.username), WHATS_NEW.id); } catch { /* shows again next visit */ }
    setDismissedBy(user.username);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10050, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="kl-whats-new-title"
        onKeyDown={e => { if (e.key === 'Escape') dismiss(); }}
        style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 520, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', boxSizing: 'border-box', padding: '22px 22px 18px', boxShadow: '0 20px 50px rgba(0,0,0,0.2)', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}
      >
        <h2 id="kl-whats-new-title" style={{ margin: '0 0 12px', fontSize: 17, color: '#111827' }}>{WHATS_NEW.title}</h2>
        <ul style={{ margin: '0 0 14px', paddingLeft: 18, fontSize: 14, lineHeight: 1.45, color: '#111827' }}>
          {WHATS_NEW.items.map(([name, text]) => (
            <li key={name} style={{ marginBottom: 6 }}><strong>{name}:</strong> {text}</li>
          ))}
        </ul>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>Details are in the User manual.</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => { dismiss(); navigate('/manual'); }}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: 'white', color: '#111827', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Open user manual
          </button>
          <button ref={okRef} type="button" onClick={dismiss}
            style={{ padding: '8px 22px', borderRadius: 8, border: 'none', background: '#6D28D9', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
