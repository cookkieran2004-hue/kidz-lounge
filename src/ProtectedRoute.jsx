import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

function LoadingScreen() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#9ca3af', fontSize: 13 }}>
      Loading...
    </div>
  );
}

// Wraps pages that require a fully signed-in user who has already completed
// their forced password reset (i.e. the normal app screens).
export function RequireAuth({ children }) {
  const { user, checkedInitialAuth } = useAuth();
  if (!checkedInitialAuth) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustResetPassword) return <Navigate to="/set-password" replace />;
  return children;
}

// Wraps the set-password page itself: needs a logged-in user, but doesn't
// care whether their reset is done yet (that's the whole point of this page).
// If they've already completed it, bounce them into the app instead.
export function RequireLoggedIn({ children }) {
  const { user, checkedInitialAuth } = useAuth();
  if (!checkedInitialAuth) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.mustResetPassword) return <Navigate to="/" replace />;
  return children;
}

// Wraps pages that require admin privileges (e.g. Admin tab). Non-admins
// get bounced to the schedule rather than seeing the page -- this is a
// convenience redirect only; the real enforcement happens server-side on
// every admin-only endpoint regardless of what this guard does.
export function RequireAdmin({ children }) {
  const { user, checkedInitialAuth } = useAuth();
  if (!checkedInitialAuth) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustResetPassword) return <Navigate to="/set-password" replace />;
  if (user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

// Wraps the login page: if someone is already authenticated (e.g. they hit
// /login directly with a valid session), send them onward instead of
// showing the form again. This is also what makes login actually navigate
// anywhere after a successful sign-in -- the auth state changes, this
// guard re-renders, and it redirects based on the fresh state.
export function RedirectIfAuthed({ children }) {
  const { user, checkedInitialAuth } = useAuth();
  if (!checkedInitialAuth) return <LoadingScreen />;
  if (user && user.mustResetPassword) return <Navigate to="/set-password" replace />;
  if (user) return <Navigate to="/" replace />;
  return children;
}
