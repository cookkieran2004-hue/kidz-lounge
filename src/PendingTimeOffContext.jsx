import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from './api';
import { useAuth } from './AuthContext';

// Holds the number of time-off requests waiting for an admin's decision.
// The nav bar (next to the username + on the ADMIN menu item) and the
// ADMIN page's Time Off tab all read from here, so they always agree.
// Non-admins always get 0 and we never call the admin-only endpoint for them.
const PendingTimeOffContext = createContext({ pendingCount: 0, refreshPending: () => {} });

export function PendingTimeOffProvider({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  const isAdmin = user?.role === 'admin';
  const [pendingCount, setPendingCount] = useState(0);

  const refreshPending = useCallback(async () => {
    if (!isAdmin) { setPendingCount(0); return; }
    const pending = await api.getAllTimeOffRequests('pending').catch(() => null);
    if (pending) setPendingCount(pending.length);
  }, [isAdmin]);

  // Re-check when the admin signs in and whenever they move between pages,
  // so a request someone submitted a moment ago shows up without a refresh.
  useEffect(() => { refreshPending(); }, [refreshPending, location.pathname]);

  return (
    <PendingTimeOffContext.Provider value={{ pendingCount, refreshPending }}>
      {children}
    </PendingTimeOffContext.Provider>
  );
}

export function usePendingTimeOff() {
  return useContext(PendingTimeOffContext);
}
