import React from 'react';
import { Link, useLocation } from 'react-router-dom';

// Plain footer on every page: a link to Help & Support (remembering which
// page you came from, so the ticket says where the problem was). The
// support owner's inbox is in their username menu, not here.
export default function Footer() {
  const location = useLocation();
  if (location.pathname === '/support') return null;
  const linkStyle = { color: '#374151', textDecoration: 'underline' };
  return (
    <footer style={{ borderTop: '1px solid #ddd', padding: '10px 20px', fontSize: 12, color: '#6b7280', display: 'flex', gap: 16, flexWrap: 'wrap', fontFamily: 'Arial, Helvetica, sans-serif', background: 'white' }}>
      <span>The Kidz Lounge</span>
      <Link to={`/support?from=${encodeURIComponent(location.pathname + location.search)}`} style={linkStyle}>Help &amp; Support</Link>
    </footer>
  );
}
