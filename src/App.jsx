import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import { TasksProvider } from './TasksContext';
import { ChatProvider } from './ChatContext';
import { RequireAuth, RequireLoggedIn, RequireAdmin, RedirectIfAuthed } from './ProtectedRoute';
import { PendingTimeOffProvider } from './PendingTimeOffContext';
import NavBar from './NavBar';
import TaskDrawer from './TaskDrawer';
import ChatWidget from './ChatWidget';
import LoginPage from './pages/LoginPage';
import SetPasswordPage from './pages/SetPasswordPage';
import SchedulePage from './pages/SchedulePage';
import PatientsPage from './pages/PatientsPage';
import PatientChartPage from './pages/PatientChartPage';
import WeeklySchedulePage from './pages/WeeklySchedulePage';
import TasksPage from './pages/TasksPage';
import MyProfilePage from './pages/MyProfilePage';
import MyTimePage from './pages/MyTimePage';
import AdminPage from './pages/AdminPage';
import StaffProfilePage from './pages/admin/StaffProfilePage';
import SupportPage from './pages/SupportPage';
import SupportTicketsPage from './pages/SupportTicketsPage';
import Footer from './Footer';
import SupportNotifier from './SupportNotifier';

// Pages whose grid scrolls inside itself. On these the shell is exactly one
// window tall -- nav bar, page, footer -- so the grid gets whatever height is
// left. The pages used to be a full 100vh on their own, which pushed the nav
// bar and footer off screen and left a second, page-level scrollbar to reach
// them.
const FILL_VIEWPORT_PATHS = new Set(['/', '/weekly']);

function AppShell() {
  const { pathname } = useLocation();
  const fillsViewport = FILL_VIEWPORT_PATHS.has(pathname);
  return (
    <PendingTimeOffProvider>
      <TasksProvider>
        <ChatProvider>
          <div style={fillsViewport ? { height: '100dvh', display: 'flex', flexDirection: 'column' } : undefined}>
            <NavBar />
            <TaskDrawer />
            <ChatWidget />
            <div style={fillsViewport ? { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'auto' } : undefined}>
              <Routes>
                <Route path="/" element={<RequireAuth><SchedulePage /></RequireAuth>} />
                <Route path="/weekly" element={<RequireAuth><WeeklySchedulePage /></RequireAuth>} />
                <Route path="/patients" element={<RequireAuth><PatientsPage /></RequireAuth>} />
                <Route path="/patients/:name" element={<RequireAuth><PatientChartPage /></RequireAuth>} />
                {/* Pages under the username menu */}
                <Route path="/profile" element={<RequireAuth><MyProfilePage /></RequireAuth>} />
                <Route path="/time" element={<RequireAuth><MyTimePage /></RequireAuth>} />
                <Route path="/tasks" element={<RequireAuth><TasksPage /></RequireAuth>} />
                <Route path="/admin" element={<RequireAdmin><AdminPage /></RequireAdmin>} />
                <Route path="/admin/staff/:username" element={<RequireAdmin><StaffProfilePage /></RequireAdmin>} />
                {/* Help & Support: open to everyone, signed in or not */}
                <Route path="/support" element={<SupportPage />} />
                <Route path="/support/tickets" element={<RequireAuth><SupportTicketsPage /></RequireAuth>} />
                {/* Old address for the single "My Page" -- keeps bookmarks working */}
                <Route path="/me" element={<Navigate to="/profile" replace />} />
              </Routes>
            </div>
            <Footer />
          </div>
          <SupportNotifier />
        </ChatProvider>
      </TasksProvider>
    </PendingTimeOffProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<RedirectIfAuthed><LoginPage /></RedirectIfAuthed>} />
          <Route path="/set-password" element={<RequireLoggedIn><SetPasswordPage /></RequireLoggedIn>} />
          <Route path="/*" element={<AppShell />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
