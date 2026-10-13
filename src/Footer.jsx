import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { canAdminister, canManage } from './roles';
import { CLINIC, POWERED_BY } from './brand';

// Plain footer on every page: the user manuals, and a link to Help & Support (remembering which
// page you came from, so the ticket says where the problem was), and Power
// Forms (the form builder) for Admins and Developers, and the Provider
// directory for everyone signed in. The
// support owner's inbox is in their username menu, not here.
export default function Footer() {
  const location = useLocation();
  const { user } = useAuth();
  if (location.pathname === '/support') return null;
  const linkStyle = { color: '#374151', textDecoration: 'underline' };
  return (
    <footer style={{ borderTop: '1px solid #ddd', padding: '10px 20px', fontSize: 12, color: '#6b7280', display: 'flex', gap: 16, flexWrap: 'wrap', fontFamily: 'Arial, Helvetica, sans-serif', background: 'white' }}>
      <span>{CLINIC.name}{POWERED_BY && <span style={{ color: '#9CA3AF' }}> · {POWERED_BY}</span>}</span>
      <Link to="/manual" style={linkStyle}>User manual</Link>
      {user && <Link to="/provider-directory" style={linkStyle}>Provider directory</Link>}
      {canManage(user) && <Link to="/credentials" style={linkStyle}>Credentials</Link>}
      {canAdminister(user) && <Link to="/power-forms" style={linkStyle}>Power Forms</Link>}
      <Link to={`/support?from=${encodeURIComponent(location.pathname + location.search)}`} style={linkStyle}>Help &amp; Support</Link>
    </footer>
  );
}
