import { useEffect, useRef, useState } from 'react';
import { setPastLockHandler } from './api';
import { INK, MUTED, HAIRLINE, TONES, FONT, buttonStyle } from './uiTokens';

// Shown when a change touches a date that has passed (billing lock,
// kidz-lounge-api lib/pastLock.js) and the person isn't an Admin or
// Developer: says what the change is, asks why, and sends it for approval.
// Mounted once in App; src/api.js calls the handler and resends the change.
export default function PastLockDialog() {
  const [ask, setAsk] = useState(null); // { summary, error, resolve }
  const [reason, setReason] = useState('');
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  useEffect(() => {
    const handler = (info) => new Promise(resolve => { setReason(''); setAsk({ summary: info?.summary, error: info?.error, resolve }); });
    handler.sent = () => {
      setToast('Sent to an admin for approval. The schedule changes once it is approved.');
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 6000);
    };
    setPastLockHandler(handler);
    return () => { setPastLockHandler(null); clearTimeout(toastTimer.current); };
  }, []);

  const close = (value) => { ask?.resolve(value); setAsk(null); };

  return (
    <>
      {ask && (
        <div role="dialog" aria-modal="true" aria-labelledby="kl-pastlock-title"
          style={{ position: 'fixed', inset: 0, background: 'rgba(24,24,27,0.45)', zIndex: 10050, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: FONT }}
          onClick={(e) => { if (e.target === e.currentTarget) close(null); }}>
          <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 440, padding: 20, boxShadow: '0 12px 40px rgba(0,0,0,0.2)' }}>
            <h2 id="kl-pastlock-title" style={{ fontSize: 16, fontWeight: 600, color: INK, margin: '0 0 6px' }}>This date has passed</h2>
            <p style={{ fontSize: 13, color: MUTED, margin: '0 0 12px' }}>
              It's on the billing sheet, so only the status can be changed. An Admin or Developer needs to approve this change.
            </p>
            {ask.summary && (
              <p style={{ fontSize: 13, color: INK, background: '#F4F4F5', border: `1px solid ${HAIRLINE}`, borderRadius: 8, padding: '8px 10px', margin: '0 0 12px' }}>{ask.summary}</p>
            )}
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }} htmlFor="kl-pastlock-reason">Reason</label>
            <textarea id="kl-pastlock-reason" autoFocus rows={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)}
              placeholder="Why does this need to change?"
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: 13.5, fontFamily: 'inherit', border: `1px solid ${HAIRLINE}`, borderRadius: 8, resize: 'vertical' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button type="button" onClick={() => close(null)} style={buttonStyle('secondary')}>Cancel</button>
              <button type="button" disabled={!reason.trim()} onClick={() => close(reason.trim())} style={buttonStyle('primary', { opacity: reason.trim() ? 1 : 0.5 })}>Send for approval</button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div role="status" style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 10050, background: TONES.success.bg, color: TONES.success.fg, border: `1px solid ${TONES.success.border || HAIRLINE}`, borderRadius: 8, padding: '10px 14px', fontSize: 13, fontWeight: 600, boxShadow: '0 6px 20px rgba(0,0,0,0.12)', maxWidth: 'calc(100% - 32px)', fontFamily: FONT }}>
          {toast}
        </div>
      )}
    </>
  );
}
