import React, { useState } from 'react';
import { useAuth } from '../AuthContext';

const BRAND_PURPLE = '#7c3aed';
const BRAND_PURPLE_DARK = '#6d28d9';

function wrapStyle() {
  return {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    background: 'linear-gradient(160deg, #faf5ff 0%, #f5f3ff 40%, #f9fafb 100%)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    padding: 20,
  };
}
function blobStyle(top, left, size, opacity) {
  return {
    position: 'absolute', top, left, width: size, height: size, borderRadius: '50%',
    background: BRAND_PURPLE, opacity, filter: 'blur(70px)', pointerEvents: 'none',
  };
}
function cardStyle() {
  return {
    position: 'relative', zIndex: 1,
    background: 'white', borderRadius: 20, padding: '36px 32px 32px', width: '100%', maxWidth: 400,
    boxShadow: '0 20px 50px rgba(109, 40, 217, 0.12), 0 2px 8px rgba(0,0,0,0.04)',
    border: '1px solid #f1eafe',
  };
}
function labelStyle() {
  return { display: 'block', fontSize: 12, fontWeight: 600, color: '#6b7280', marginTop: 14, marginBottom: 5 };
}
function inputStyle(focused) {
  return {
    width: '100%', padding: '10px 12px', borderRadius: 10, fontSize: 14, boxSizing: 'border-box',
    border: `1.5px solid ${focused ? BRAND_PURPLE : '#e2e4e9'}`,
    outline: 'none',
    boxShadow: focused ? '0 0 0 3px rgba(124, 58, 237, 0.12)' : 'none',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  };
}

export default function SetPasswordPage() {
  const { completePasswordReset, logout } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const [btnHover, setBtnHover] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await completePasswordReset(newPassword);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div style={wrapStyle()}>
      <div style={blobStyle('-10%', '-8%', 320, 0.10)} />
      <div style={blobStyle('60%', '80%', 280, 0.08)} />

      <div style={cardStyle()}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <img src="/logo.png" alt="The Kidz Lounge" style={{ height: 76, width: 'auto', marginBottom: 4 }} />
          <h1 style={{ fontSize: 19, fontWeight: 700, color: '#111827', margin: '10px 0 2px' }}>Set a New Password</h1>
          <p style={{ fontSize: 13, color: '#9ca3af', margin: 0, maxWidth: 280 }}>
            You're signed in with a temporary password. Choose a permanent one to continue.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ marginTop: 8 }}>
          <label style={labelStyle()}>New Password</label>
          <input
            style={inputStyle(focusedField === 'new')}
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            onFocus={() => setFocusedField('new')}
            onBlur={() => setFocusedField(null)}
            autoFocus
            autoComplete="new-password"
          />

          <label style={labelStyle()}>Confirm New Password</label>
          <input
            style={inputStyle(focusedField === 'confirm')}
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            onFocus={() => setFocusedField('confirm')}
            onBlur={() => setFocusedField(null)}
            autoComplete="new-password"
          />

          {error && <p style={{ color: '#dc2626', fontSize: 13, marginTop: 12, marginBottom: 0 }}>{error}</p>}

          <button
            type="submit"
            disabled={loading}
            onMouseEnter={() => setBtnHover(true)}
            onMouseLeave={() => setBtnHover(false)}
            style={{
              width: '100%', marginTop: 20, padding: '11px 14px', borderRadius: 10, fontSize: 14, fontWeight: 600,
              cursor: loading ? 'default' : 'pointer', border: 'none', color: 'white',
              background: btnHover && !loading
                ? `linear-gradient(135deg, ${BRAND_PURPLE_DARK}, ${BRAND_PURPLE_DARK})`
                : `linear-gradient(135deg, ${BRAND_PURPLE}, ${BRAND_PURPLE_DARK})`,
              boxShadow: '0 4px 14px rgba(124, 58, 237, 0.28)',
              transition: 'background 0.15s, transform 0.1s',
              transform: btnHover && !loading ? 'translateY(-1px)' : 'none',
              opacity: loading ? 0.75 : 1,
            }}
          >
            {loading ? 'Saving...' : 'Set Password & Continue'}
          </button>
        </form>

        <button
          onClick={logout}
          style={{ marginTop: 14, width: '100%', background: 'none', border: 'none', color: '#9ca3af', fontSize: 12.5, cursor: 'pointer' }}
        >
          Sign out instead
        </button>
      </div>
    </div>
  );
}
