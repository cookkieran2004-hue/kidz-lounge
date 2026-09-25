import React from 'react';

// Small colored initials circle -- used for the My Page banner and the
// admin Staff/Providers lists, so a person is a face-like visual anchor
// rather than just a row of plain text everywhere they appear. Lives in
// its own file (rather than StaffPage.jsx, which already imports
// ManageDataPage.jsx) specifically to avoid a circular import between the
// two pages that both need it.
export function Avatar({ name, size = 44 }) {
  const initials = (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: '#6D28D9', color: 'white',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      fontSize: Math.round(size * 0.38), fontWeight: 600, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    }}>
      {initials || '?'}
    </div>
  );
}
