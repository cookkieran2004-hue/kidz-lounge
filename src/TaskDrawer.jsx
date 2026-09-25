import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from './api';
import { useAuth } from './AuthContext';
import { useTasks } from './TasksContext';
import { useIsMobile } from './useIsMobile';
import TaskDetailModal, { taskHasComments } from './TaskDetailModal';

const BRAND_PURPLE = '#6D28D9';

function formatDueDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d - today) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return { label: 'Today', overdue: false };
  if (diffDays < 0) return { label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), overdue: true };
  if (diffDays === 1) return { label: 'Tomorrow', overdue: false };
  return { label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), overdue: false };
}

function formatCompletedAt(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function isCompletedToday(isoString) {
  if (!isoString) return false;
  const completed = new Date(isoString);
  const now = new Date();
  return completed.getFullYear() === now.getFullYear()
    && completed.getMonth() === now.getMonth()
    && completed.getDate() === now.getDate();
}

export default function TaskDrawer() {
  const { user } = useAuth();
  const { tasks, drawerOpen, setDrawerOpen, refresh, prefillTitle, setPrefillTitle } = useTasks();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [quickTitle, setQuickTitle] = useState('');

  useEffect(() => {
    if (prefillTitle) {
      setQuickTitle(prefillTitle);
      setPrefillTitle('');
    }
  }, [prefillTitle, setPrefillTitle]);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState(null);
  const [detailTask, setDetailTask] = useState(null);

  // Keep an open detail modal in sync with the underlying task list (e.g.
  // after adding a comment or toggling done from inside the modal).
  useEffect(() => {
    if (!detailTask) return;
    const fresh = tasks.find(t => t.id === detailTask.id);
    if (fresh) setDetailTask(fresh);
  }, [tasks, detailTask]);

  if (!user) return null;

  const openTasks = tasks.filter(t => t.status === 'open');
  const doneTasks = tasks.filter(t => t.status === 'done' && isCompletedToday(t.completed_at)).slice(0, 5);

  const toggleDone = async (task) => {
    await api.updateTask(task.id, { status: task.status === 'done' ? 'open' : 'done' });
    refresh();
  };

  const quickAdd = async () => {
    if (!quickTitle.trim()) return;
    setAdding(true);
    setAddError(null);
    try {
      await api.createTask({ title: quickTitle.trim(), assigned_to: user.username });
      setQuickTitle('');
      refresh();
    } catch (err) {
      setAddError(err.message || 'Failed to add task.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      <div
        onClick={() => setDrawerOpen(false)}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 9990,
          opacity: drawerOpen ? 1 : 0, pointerEvents: drawerOpen ? 'auto' : 'none',
          transition: 'opacity 0.2s',
        }}
      />
      <div
        style={{
          position: 'fixed', top: 0, right: 0, height: '100vh', width: isMobile ? '100vw' : '33.333vw',
          minWidth: isMobile ? 'auto' : 340, maxWidth: 460, background: 'white', zIndex: 9991,
          boxShadow: '-8px 0 30px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column',
          transform: drawerOpen ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.25s ease',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e2e4e9' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>My Tasks</span>
          <button onClick={() => setDrawerOpen(false)} style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: '#6b7280', lineHeight: 1 }}>
            &times;
          </button>
        </div>

        <div style={{ padding: isMobile ? '12px 16px' : '12px 20px', borderBottom: '1px solid #f1f2f4' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={quickTitle}
              onChange={e => setQuickTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') quickAdd(); }}
              placeholder="Add a task for yourself..."
              style={{ flex: 1, padding: isMobile ? '10px 12px' : '7px 10px', borderRadius: 6, border: '1px solid #e2e4e9', fontSize: isMobile ? 15 : 13, boxSizing: 'border-box' }}
            />
            <button
              onClick={quickAdd}
              disabled={adding || !quickTitle.trim()}
              style={{ padding: isMobile ? '10px 16px' : '7px 12px', borderRadius: 6, fontSize: isMobile ? 15 : 13, fontWeight: 600, border: 'none', background: BRAND_PURPLE, color: 'white', cursor: 'pointer' }}
            >
              +
            </button>
          </div>
          {addError && <p style={{ color: '#dc2626', fontSize: 12, margin: '6px 0 0' }}>{addError}</p>}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '4px 8px' : '8px 12px' }}>
          {openTasks.length === 0 ? (
            <p style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', marginTop: 30 }}>Nothing on your plate right now.</p>
          ) : (
            openTasks.map(task => {
              const due = formatDueDate(task.due_date);
              return (
                <div key={task.id} style={{ display: 'flex', alignItems: 'flex-start', gap: isMobile ? 12 : 10, padding: isMobile ? '14px 8px' : '10px 8px', borderBottom: '1px solid #f3f4f6' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer', marginTop: 2, padding: isMobile ? '4px' : 0 }}>
                    <input type="checkbox" checked={false} onChange={() => toggleDone(task)} style={{ cursor: 'pointer', width: isMobile ? 20 : 14, height: isMobile ? 20 : 14 }} />
                    <span style={{ fontSize: isMobile ? 9 : 8.5, fontWeight: 700, color: BRAND_PURPLE, textTransform: 'uppercase', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>Mark Complete</span>
                  </label>
                  <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setDetailTask(task)}>
                    <div style={{ fontSize: isMobile ? 15 : 13.5, color: '#111827', fontWeight: 500 }}>
                      {task.title}
                      {taskHasComments(task) && <span style={{ color: '#dc2626', fontWeight: 700, fontSize: 13, marginLeft: 4 }}>*</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                      {task.assigned_by && task.assigned_by !== user.username && (
                        <span style={{ fontSize: isMobile ? 12 : 11, color: '#9ca3af' }}>from {task.assigned_by_display || task.assigned_by}</span>
                      )}
                      {due && (
                        <span style={{ fontSize: isMobile ? 12 : 11, fontWeight: 600, color: due.overdue ? '#dc2626' : '#9ca3af' }}>
                          {due.overdue ? 'Overdue: ' : 'Due '}{due.label}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {doneTasks.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <p style={{ fontSize: 10.5, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0 8px' }}>Recently completed</p>
              {doneTasks.map(task => (
                <div key={task.id} style={{ display: 'flex', alignItems: 'flex-start', gap: isMobile ? 12 : 10, padding: isMobile ? '10px 8px' : '6px 8px' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer', marginTop: 1, padding: isMobile ? '4px' : 0 }}>
                    <input type="checkbox" checked={true} onChange={() => toggleDone(task)} style={{ cursor: 'pointer', width: isMobile ? 20 : 14, height: isMobile ? 20 : 14 }} />
                    <span style={{ fontSize: isMobile ? 9 : 8.5, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>Completed</span>
                  </label>
                  <div style={{ cursor: 'pointer' }} onClick={() => setDetailTask(task)}>
                    <div style={{ fontSize: isMobile ? 14 : 13, color: '#9ca3af', textDecoration: 'line-through' }}>
                      {task.title}
                      {taskHasComments(task) && <span style={{ color: '#dc2626', fontWeight: 700, fontSize: 12, marginLeft: 4 }}>*</span>}
                    </div>
                    {task.completed_at && (
                      <div style={{ fontSize: 10.5, color: '#c1c5cc' }}>Completed {formatCompletedAt(task.completed_at)}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: 14, borderTop: '1px solid #e2e4e9' }}>
          <button
            onClick={() => { setDrawerOpen(false); navigate('/tasks'); }}
            style={{ width: '100%', padding: isMobile ? '12px 12px' : '9px 12px', borderRadius: 6, fontSize: isMobile ? 15 : 13, fontWeight: 600, border: `1.5px solid ${BRAND_PURPLE}`, background: 'white', color: BRAND_PURPLE, cursor: 'pointer' }}
          >
            View Full List
          </button>
        </div>
      </div>

      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          currentUser={user}
          onClose={() => setDetailTask(null)}
          onToggleDone={toggleDone}
          onTaskChanged={refresh}
        />
      )}
    </>
  );
}
