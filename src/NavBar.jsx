import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { useIsMobile } from './useIsMobile';
import { useTasks } from './TasksContext';
import { Avatar } from './Avatar';
import { usePendingTimeOff } from './PendingTimeOffContext';
import { useSupportOpenCount, SUPPORT_OWNER } from './supportCount';

const BRAND_PURPLE = '#6D28D9';

const TABS = [
  { to: '/', label: 'Schedule', end: true },
  { to: '/weekly', label: 'Weekly View' },
  { to: '/patients', label: 'Patients' },
];

const barStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '8px 20px',
  background: 'white',
  borderBottom: `1.5px solid ${BRAND_PURPLE}`,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  position: 'relative',
};

function tabStyle({ isActive }) {
  return {
    padding: '6px 14px',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    textDecoration: 'none',
    color: isActive ? BRAND_PURPLE : '#6b7280',
    background: isActive ? '#F5F3FF' : 'transparent',
  };
}

function mobileTabStyle({ isActive }) {
  return {
    padding: '12px 20px',
    fontSize: 15,
    fontWeight: 600,
    textDecoration: 'none',
    color: isActive ? BRAND_PURPLE : '#374151',
    background: isActive ? '#F5F3FF' : 'transparent',
    borderBottom: '1px solid #f1f2f4',
  };
}

function MenuIcon({ open }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      {open ? (
        <><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></>
      ) : (
        <><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></>
      )}
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18a3 3 0 0 0 6 0" />
      <path d="M4 17h16v-1a2 2 0 0 1-1-1.73V11a7 7 0 0 0-14 0v3.27A2 2 0 0 1 4 16v1z" />
    </svg>
  );
}

// Items in the username menu. `adminOnly` items are hidden from non-admins;
// `supportOnly` is only for the support owner (KJC135).
const ACCOUNT_LINKS = [
  { to: '/profile', label: 'My profile' },
  { to: '/time', label: 'My time' },
  { to: '/tasks', label: 'My tasks' },
  { to: '/support/tickets', label: 'Support tickets', supportOnly: true },
  { to: '/admin', label: 'ADMIN', adminOnly: true },
];
const SUPPORT_GREEN = '#16a34a';

function displayNameFor(user) {
  return user.preferredName || user.firstName
    ? `${user.preferredName || user.firstName} ${user.lastName || ''}`
    : user.username;
}

// Red: pending time-off requests (admins). Green: open support tickets (KJC135).
function CountBadge({ count, style, color = '#dc2626', label }) {
  if (!count) return null;
  return (
    <span
      aria-label={label ? label(count) : `${count} pending time-off ${count === 1 ? 'request' : 'requests'}`}
      style={{
        background: color, color: 'white', fontSize: 10, fontWeight: 700, borderRadius: 999,
        minWidth: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', lineHeight: 1,
        ...style,
      }}
    >
      {count}
    </span>
  );
}

function SupportBadge({ count, style }) {
  return <CountBadge count={count} style={style} color={SUPPORT_GREEN} label={(n) => `${n} open support ${n === 1 ? 'ticket' : 'tickets'}`} />;
}

function Caret({ open }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" style={{ transition: 'transform 120ms', transform: open ? 'rotate(180deg)' : 'none' }}>
      <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function menuItemStyle({ isActive }) {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    padding: '8px 14px', fontSize: 13, fontWeight: isActive ? 700 : 500, textDecoration: 'none',
    color: isActive ? BRAND_PURPLE : '#374151',
    // background left unset when inactive so the .kl-menu-item:hover rule in index.css can apply
    ...(isActive ? { background: '#F5F3FF' } : {}),
  };
}

// Desktop username menu: opens on hover (with a short grace period so the
// pointer can travel from the name down into the list) and also on click,
// which is what makes it work with touch screens and the keyboard.
function UserMenu({ user, links, pendingCount, supportCount, onSignOut }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const closeTimer = useRef(null);
  const location = useLocation();

  const hovering = useRef(false);

  const openNow = () => { hovering.current = true; clearTimeout(closeTimer.current); setOpen(true); };
  const closeSoon = () => { hovering.current = false; clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => setOpen(false), 150); };
  // With a mouse, hovering has already opened the menu, so a click must keep
  // it open (a plain toggle would snap it shut). Keyboard users (Enter/Space)
  // aren't hovering, so for them the click toggles open/closed.
  const handleClick = () => { if (hovering.current) setOpen(true); else setOpen(o => !o); };

  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  // Close on Escape or a click anywhere outside the menu.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }} onMouseEnter={openNow} onMouseLeave={closeSoon}>
      <button
        type="button"
        onClick={handleClick}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 7, border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6,
          background: open ? '#F5F3FF' : 'transparent', color: BRAND_PURPLE, fontFamily: 'inherit',
        }}
      >
        <Avatar name={displayNameFor(user)} size={26} />
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{user.username}</span>
        <SupportBadge count={supportCount} />
        <CountBadge count={pendingCount} />
        <Caret open={open} />
      </button>

      {open && (
        // paddingTop bridges the gap under the button so hover isn't lost on the way down
        <div style={{ position: 'absolute', top: '100%', right: 0, paddingTop: 6, zIndex: 60 }}>
          <div
            role="menu"
            style={{
              minWidth: 190, background: 'white', border: '1px solid #e5e1f0', borderRadius: 8,
              boxShadow: '0 10px 24px rgba(36,26,51,0.12)', padding: '6px 0', overflow: 'hidden',
            }}
          >
            {links.map(link => (
              <NavLink key={link.to} to={link.to} role="menuitem" className="kl-menu-item" style={menuItemStyle}>
                {link.label}
                {link.adminOnly && <CountBadge count={pendingCount} />}
                {link.supportOnly && <SupportBadge count={supportCount} />}
              </NavLink>
            ))}
            <div style={{ height: 1, background: '#eee9f7', margin: '6px 0' }} />
            <button
              type="button"
              role="menuitem"
              className="kl-menu-item"
              onClick={onSignOut}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer', color: '#6b7280', fontFamily: 'inherit' }}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function NavBar() {
  const { user, logout } = useAuth();
  const visibleTabs = TABS;
  const { openCount, drawerOpen, setDrawerOpen } = useTasks();
  const isMobile = useIsMobile();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { pendingCount } = usePendingTimeOff();
  const supportCount = useSupportOpenCount(user);

  // Close the mobile menu automatically whenever the route changes, so it
  // never stays open after tapping a link or navigating via back/forward.
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  // No nav chrome on the login / set-password screens.
  if (!user) return null;

  const isAdmin = user.role === 'admin';
  const accountLinks = ACCOUNT_LINKS.filter(l => (!l.adminOnly || isAdmin) && (!l.supportOnly || user.username === SUPPORT_OWNER));
  const badgeCount = isAdmin ? pendingCount : 0;

  if (!isMobile) {
    return (
      <nav style={barStyle}>
        <img src="/logo.png" alt="The Kidz Lounge" style={{ height: 34, width: 'auto', marginRight: 16 }} />
        {visibleTabs.map(tab => (
          <NavLink key={tab.to} to={tab.to} end={tab.end} style={tabStyle}>
            {tab.label}
          </NavLink>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => setDrawerOpen(o => !o)}
            aria-label="Toggle task drawer"
            style={{
              position: 'relative', border: 'none', background: 'none', color: drawerOpen ? BRAND_PURPLE : '#6b7280',
              cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center',
            }}
          >
            <BellIcon />
            {openCount > 0 && (
              <span style={{
                position: 'absolute', top: -3, right: -3, background: '#dc2626', color: 'white', fontSize: 9.5, fontWeight: 700,
                borderRadius: 999, minWidth: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
              }}>
                {openCount}
              </span>
            )}
          </button>
          <UserMenu user={user} links={accountLinks} pendingCount={badgeCount} supportCount={supportCount} onSignOut={logout} />
        </div>
      </nav>
    );
  }

  return (
    <nav style={barStyle}>
      <img src="/logo.png" alt="The Kidz Lounge" style={{ height: 30, width: 'auto' }} />
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
        <button
          onClick={() => setDrawerOpen(o => !o)}
          aria-label="Toggle task drawer"
          style={{ position: 'relative', border: 'none', background: 'none', color: drawerOpen ? BRAND_PURPLE : '#6b7280', cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center' }}
        >
          <BellIcon />
          {openCount > 0 && (
            <span style={{
              position: 'absolute', top: 2, right: 2, background: '#dc2626', color: 'white', fontSize: 9.5, fontWeight: 700,
              borderRadius: 999, minWidth: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
            }}>
              {openCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setMenuOpen(o => !o)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          style={{
            position: 'relative', border: 'none', background: 'none', color: BRAND_PURPLE,
            cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center',
          }}
        >
          <MenuIcon open={menuOpen} />
          {!menuOpen && (
            <span style={{ position: 'absolute', top: 1, right: 0, display: 'flex', gap: 2 }}>
              <SupportBadge count={supportCount} />
              <CountBadge count={badgeCount} />
            </span>
          )}
        </button>
      </div>

      {menuOpen && (
        <div
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, background: 'white',
            borderBottom: `1.5px solid ${BRAND_PURPLE}`, boxShadow: '0 8px 16px rgba(0,0,0,0.08)',
            zIndex: 50, display: 'flex', flexDirection: 'column',
          }}
        >
          {visibleTabs.map(tab => (
            <NavLink key={tab.to} to={tab.to} end={tab.end} style={mobileTabStyle}>
              {tab.label}
            </NavLink>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 20px 6px', borderTop: `1px solid #e5e1f0`, marginTop: 6 }}>
            <Avatar name={displayNameFor(user)} size={30} />
            <span style={{ fontSize: 13, color: BRAND_PURPLE, fontWeight: 600 }}>{user.username}</span>
            <SupportBadge count={supportCount} />
            <CountBadge count={badgeCount} />
          </div>
          {accountLinks.map(link => (
            <NavLink key={link.to} to={link.to} style={mobileTabStyle}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                {link.label}
                {link.adminOnly && <CountBadge count={badgeCount} />}
                {link.supportOnly && <SupportBadge count={supportCount} />}
              </span>
            </NavLink>
          ))}
          <button
            type="button"
            onClick={logout}
            style={{ textAlign: 'left', padding: '14px 20px', fontSize: 15, fontWeight: 600, border: 'none', borderTop: '1px solid #e5e1f0', background: 'white', color: '#6b7280', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Sign out
          </button>
        </div>
      )}
    </nav>
  );
}
