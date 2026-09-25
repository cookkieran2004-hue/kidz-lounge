import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api } from './api';
import { useAuth } from './AuthContext';

const TasksContext = createContext(null);

export function TasksProvider({ children }) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [prefillTitle, setPrefillTitle] = useState('');
  const hasAutoOpenedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await api.getMyTasks();
      setTasks(data || []);
    } catch (err) {
      // Background refresh -- fail silently rather than disrupting the page.
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) {
      setTasks([]);
      hasAutoOpenedRef.current = false; // so the drawer auto-opens again on the next sign-in
      return;
    }
    if (!hasAutoOpenedRef.current) {
      setDrawerOpen(true);
      hasAutoOpenedRef.current = true;
    }
    // Background: let the page's own requests go first.
    const first = setTimeout(refresh, 1500);
    const interval = setInterval(refresh, 60000);
    return () => { clearTimeout(first); clearInterval(interval); };
  }, [user, refresh]);

  const openCount = tasks.filter(t => t.status === 'open').length;

  const openDrawerWithPrefill = (title) => {
    setPrefillTitle(title);
    setDrawerOpen(true);
  };

  return (
    <TasksContext.Provider value={{ tasks, refresh, drawerOpen, setDrawerOpen, openCount, loading, prefillTitle, setPrefillTitle, openDrawerWithPrefill }}>
      {children}
    </TasksContext.Provider>
  );
}

export function useTasks() {
  const ctx = useContext(TasksContext);
  if (!ctx) throw new Error('useTasks must be used inside a TasksProvider');
  return ctx;
}
