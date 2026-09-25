import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { api, getToken, setToken } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // { username, role, mustResetPassword } | null
  const [checkedInitialAuth, setCheckedInitialAuth] = useState(false);

  // On first load, if a token is already stored, verify it's still valid
  // instead of trusting it blindly (it may have expired or been revoked).
  useEffect(() => {
    (async () => {
      if (getToken()) {
        try {
          const me = await api.me();
          setUser(me);
        } catch (err) {
          setToken(null);
          setUser(null);
        }
      }
      setCheckedInitialAuth(true);
    })();
  }, []);

  const buildUser = (data) => ({
    username: data.username, role: data.role, mustResetPassword: data.mustResetPassword, providerName: data.providerName || null,
    firstName: data.firstName || null, middleName: data.middleName || null, lastName: data.lastName || null,
    preferredName: data.preferredName || null, position: data.position || null,
  });

  const login = useCallback(async (username, password) => {
    const data = await api.login(username, password);
    setToken(data.token);
    setUser(buildUser(data));
    return data;
  }, []);

  const completePasswordReset = useCallback(async (newPassword) => {
    const data = await api.setPassword(newPassword);
    setToken(data.token);
    setUser(buildUser(data));
    return data;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  // Auto-logout after 30 minutes with no mouse, keyboard, touch, or scroll
  // activity -- separate from the JWT's own 12-hour expiration, this is
  // about an unattended computer, not the token going stale.
  useEffect(() => {
    if (!user) return;
    const IDLE_LIMIT_MS = 30 * 60 * 1000;
    let timeoutId;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(logout, IDLE_LIMIT_MS);
    };

    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
    events.forEach(evt => window.addEventListener(evt, resetTimer));
    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      events.forEach(evt => window.removeEventListener(evt, resetTimer));
    };
  }, [user, logout]);

  return (
    <AuthContext.Provider value={{ user, checkedInitialAuth, login, logout, completePasswordReset }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider');
  return ctx;
}
