import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from './api';

// Only Developers see the help desk tickets (matches routes/support.js).
export const canSeeSupportTickets = (user) => user?.role === 'developer';

// Tell the menu badge to re-count right away (e.g. after resolving one).
export function notifySupportTicketsChanged() {
  window.dispatchEvent(new Event('kl-support-tickets-changed'));
}

// Open support tickets, for the green badge. Only people who can see the
// tickets ask; checks on sign-in, every minute, on page changes, and whenever a
// ticket is resolved or reopened.
export function useSupportOpenCount(user) {
  const isOwner = canSeeSupportTickets(user);
  const location = useLocation();
  const [count, setCount] = useState(0);
  const check = useCallback(() => {
    if (!isOwner) return;
    api.getSupportOpenCount().then(r => setCount(r?.open || 0)).catch(() => {});
  }, [isOwner]);
  useEffect(() => {
    if (!isOwner) return undefined;
    const first = setTimeout(check, 3000); // background: after the page's own requests
    const timer = setInterval(check, 60 * 1000);
    window.addEventListener('kl-support-tickets-changed', check);
    return () => { clearTimeout(first); clearInterval(timer); window.removeEventListener('kl-support-tickets-changed', check); };
  }, [isOwner, check, location.pathname]);
  return isOwner ? count : 0;
}