import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { useTasks } from '../TasksContext';
import { useIsMobile } from '../useIsMobile';
import { CalendarPicker, DateField, dateToInputValue } from './SchedulePage';
import TaskDetailModal, { taskHasComments } from '../TaskDetailModal';

const BRAND_PURPLE = '#6D28D9';
const BRAND_TINT = '#F5F3FF';
const BORDER = '#E2E4E9';

function formatDueDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d - today) / (1000 * 60 * 60 * 24));
  const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return { label, overdue: diffDays < 0 };
}

function formatCompletedAt(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function isRecentlyCompleted(task) {
  if (task.status !== 'done') return false;
  if (!task.completed_at) return true; // no timestamp on file -- don't hide it, just show it
  const completedMs = new Date(task.completed_at).getTime();
  return Date.now() - completedMs <= 72 * 60 * 60 * 1000;
}

function staffDisplayName(s) {
  if (s.preferred_name) return s.preferred_name;
  if (s.first_name || s.last_name) return [s.first_name, s.last_name].filter(Boolean).join(' ');
  return s.username;
}

function TaskRow({ task, currentUsername, onToggleDone, onDelete, canDelete, onOpenDetail }) {
  const due = formatDueDate(task.due_date);
  const isMobile = useIsMobile();
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: isMobile ? 14 : 12, padding: isMobile ? '14px' : '12px 14px', borderBottom: `1px solid ${BORDER}` }}>
      <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', marginTop: 2, padding: isMobile ? '4px' : 0 }}>
        <input type="checkbox" checked={task.status === 'done'} onChange={() => onToggleDone(task)} style={{ cursor: 'pointer', width: isMobile ? 20 : 16, height: isMobile ? 20 : 16 }} />
        <span style={{ fontSize: isMobile ? 9.5 : 9, fontWeight: 700, color: task.status === 'done' ? '#9ca3af' : BRAND_PURPLE, textTransform: 'uppercase', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
          {task.status === 'done' ? 'Completed' : 'Mark Complete'}
        </span>
      </label>
      <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => onOpenDetail(task)} title="Click to view details and comments">
        <div style={{ fontSize: isMobile ? 15 : 14, fontWeight: 500, color: '#111827', textDecoration: task.status === 'done' ? 'line-through' : 'none' }}>
          {task.title}
          {taskHasComments(task) && (
            <span style={{ color: '#dc2626', fontWeight: 700, fontSize: 14, lineHeight: 1, marginLeft: 4 }}>*</span>
          )}
        </div>
        {task.description && (
          <div style={{ fontSize: 12.5, color: '#6b7280', marginTop: 3 }}>{task.description}</div>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 5, flexWrap: 'wrap' }}>
          {task.assigned_by && task.assigned_by !== currentUsername && (
            <span style={{ fontSize: 11.5, color: '#9ca3af' }}>Assigned by {task.assigned_by_display || task.assigned_by}</span>
          )}
          {task.assigned_to !== currentUsername && (
            <span style={{ fontSize: 11.5, color: '#9ca3af' }}>For {task.assigned_to_display || task.assigned_to}</span>
          )}
          {due && (
            <span style={{ fontSize: 11.5, fontWeight: 600, color: due.overdue && task.status !== 'done' ? '#dc2626' : '#9ca3af' }}>
              {due.overdue && task.status !== 'done' ? 'Overdue: ' : 'Due '}{due.label}
            </span>
          )}
          {task.status === 'done' && task.completed_at && (
            <span style={{ fontSize: 11.5, color: '#9ca3af' }}>Completed {formatCompletedAt(task.completed_at)}</span>
          )}
        </div>
      </div>
      {canDelete && (
        <button onClick={() => onDelete(task)} style={{ border: 'none', background: 'none', color: '#d1d5db', cursor: 'pointer', fontSize: isMobile ? 20 : 13, padding: isMobile ? '4px 8px' : 0 }} title="Remove task">&times;</button>
      )}
    </div>
  );
}

function NewTaskForm({ staffOptions, defaultAssignee, onCreate }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assignedTo, setAssignedTo] = useState(defaultAssignee);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const isMobile = useIsMobile();

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onCreate({ title: title.trim(), description: description.trim() || undefined, due_date: dueDate || undefined, assigned_to: assignedTo });
      setTitle(''); setDescription(''); setDueDate('');
    } catch (err) {
      setError(err.message || 'Failed to add task.');
    } finally {
      setSaving(false);
    }
  };

  const fieldStyle = { padding: isMobile ? '10px 12px' : '8px 10px', borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: isMobile ? 15 : 13, boxSizing: 'border-box' };

  return (
    <div style={{ background: BRAND_TINT, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14, marginBottom: 20 }}>
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, marginBottom: 8 }}>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Task title"
          style={{ ...fieldStyle, flex: isMobile ? 'none' : 2, width: isMobile ? '100%' : 'auto' }}
        />
        {staffOptions && (
          <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)} style={{ ...fieldStyle, flex: isMobile ? 'none' : 1, width: isMobile ? '100%' : 'auto' }}>
            {staffOptions.map(s => <option key={s.username} value={s.username}>{s.display}</option>)}
          </select>
        )}
        <DateField clearable floating={!isMobile} placeholder="Due date" ariaLabel="Due date (optional)" value={dueDate} onChange={setDueDate} style={{ ...fieldStyle, width: isMobile ? '100%' : 'auto' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8 }}>
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Details (optional)"
          style={{ ...fieldStyle, flex: 1, width: isMobile ? '100%' : 'auto' }}
        />
        <button
          onClick={submit}
          disabled={saving || !title.trim()}
          style={{ padding: isMobile ? '12px 16px' : '8px 16px', borderRadius: 6, fontSize: isMobile ? 15 : 13, fontWeight: 600, border: 'none', background: BRAND_PURPLE, color: 'white', cursor: 'pointer', width: isMobile ? '100%' : 'auto' }}
        >
          {saving ? 'Adding...' : 'Add Task'}
        </button>
      </div>
      {error && <p style={{ color: '#dc2626', fontSize: 12.5, margin: '8px 0 0' }}>{error}</p>}
    </div>
  );
}

export default function TasksPage() {
  const { user } = useAuth();
  const { tasks, refresh } = useTasks();
  const isAdmin = user?.role === 'admin';
  const isMobile = useIsMobile();
  const [view, setView] = useState('mine'); // mine | board | log
  const [staff, setStaff] = useState([]);
  const [boardTasks, setBoardTasks] = useState([]);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [detailTask, setDetailTask] = useState(null);
  const [logDateFilter, setLogDateFilter] = useState(null); // "YYYY-MM-DD" | null
  const [showLogCalendar, setShowLogCalendar] = useState(false);

  const loadBoard = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingBoard(true);
    try {
      const [tasksData, staffData] = await Promise.all([api.getTaskBoard(), api.getStaff()]);
      setBoardTasks(tasksData || []);
      setStaff((staffData || []).filter(s => !s.archived));
    } catch (err) {
      // leave board empty on failure
    }
    setLoadingBoard(false);
  }, [isAdmin]);

  useEffect(() => {
    if (view === 'board' || view === 'log') loadBoard();
  }, [view, loadBoard]);

  useEffect(() => {
    if (isAdmin && staff.length === 0) {
      api.getStaff().then(data => setStaff((data || []).filter(s => !s.archived))).catch(() => {});
    }
  }, [isAdmin, staff.length]);

  // Keep an open detail modal in sync with the underlying task list (e.g.
  // after toggling done from inside the modal itself).
  useEffect(() => {
    if (!detailTask) return;
    const fresh = [...tasks, ...boardTasks].find(t => t.id === detailTask.id);
    if (fresh) setDetailTask(fresh);
  }, [tasks, boardTasks, detailTask]);

  const toggleDone = async (task) => {
    await api.updateTask(task.id, { status: task.status === 'done' ? 'open' : 'done' });
    refresh();
    if (view === 'board' || view === 'log') loadBoard();
  };

  const deleteTask = async (task) => {
    await api.deleteTask(task.id);
    refresh();
    if (view === 'board' || view === 'log') loadBoard();
  };

  const createMyTask = async (record) => {
    await api.createTask({ ...record, assigned_to: user.username });
    refresh();
  };

  const createAssignedTask = async (record) => {
    await api.createTask(record);
    loadBoard();
  };

  const handleTaskChanged = async () => {
    await refresh();
    if (view === 'board' || view === 'log') await loadBoard();
  };

  const canDeleteInMine = (t) => user.role === 'admin' || t.assigned_by === user.username;

  const openMine = tasks.filter(t => t.status === 'open');
  const doneMine = tasks.filter(isRecentlyCompleted);

  const staffOptions = staff.map(s => ({ username: s.username, display: `${staffDisplayName(s)} (${s.username})` }));

  const grouped = {};
  boardTasks.forEach(t => {
    if (t.status === 'done' && !isRecentlyCompleted(t)) return;
    if (!grouped[t.assigned_to]) grouped[t.assigned_to] = [];
    grouped[t.assigned_to].push(t);
  });

  // Task Log: completed tasks older than 72 hours (the ones that have aged
  // out of the Task Board), optionally narrowed to a specific completed date.
  const logTasksByStaff = {};
  boardTasks.forEach(t => {
    if (t.status !== 'done' || isRecentlyCompleted(t) || !t.completed_at) return;
    if (logDateFilter && dateToInputValue(new Date(t.completed_at)) !== logDateFilter) return;
    if (!logTasksByStaff[t.assigned_to]) logTasksByStaff[t.assigned_to] = [];
    logTasksByStaff[t.assigned_to].push(t);
  });
  Object.values(logTasksByStaff).forEach(list => list.sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at)));
  const logStaffSorted = staff
    .filter(s => (logTasksByStaff[s.username] || []).length > 0)
    .sort((a, b) => staffDisplayName(a).localeCompare(staffDisplayName(b)));

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', maxWidth: 780, margin: '0 auto', padding: isMobile ? '16px 14px 40px' : '28px 24px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>Tasks</h1>
        {isAdmin && (
          <div style={{ display: 'inline-flex', gap: 4, background: '#f1f2f4', borderRadius: 8, padding: 3, width: isMobile ? '100%' : 'auto', flexWrap: 'wrap' }}>
            <button
              onClick={() => setView('mine')}
              style={{ flex: isMobile ? 1 : 'none', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: view === 'mine' ? 'white' : 'transparent', color: view === 'mine' ? '#111827' : '#6b7280' }}
            >
              My Tasks
            </button>
            <button
              onClick={() => setView('board')}
              style={{ flex: isMobile ? 1 : 'none', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: view === 'board' ? 'white' : 'transparent', color: view === 'board' ? '#111827' : '#6b7280' }}
            >
              Task Board
            </button>
            <button
              onClick={() => setView('log')}
              style={{ flex: isMobile ? 1 : 'none', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: view === 'log' ? 'white' : 'transparent', color: view === 'log' ? '#111827' : '#6b7280' }}
            >
              Task Log
            </button>
          </div>
        )}
      </div>

      {view === 'mine' ? (
        <>
          <NewTaskForm staffOptions={null} defaultAssignee={user?.username} onCreate={createMyTask} />

          <p style={{ fontSize: 11.5, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 8px' }}>
            Open ({openMine.length})
          </p>
          <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
            {openMine.length === 0 ? (
              <p style={{ fontSize: 13, color: '#9ca3af', padding: 16, margin: 0 }}>Nothing on your plate right now.</p>
            ) : (
              openMine.map(t => (
                <TaskRow key={t.id} task={t} currentUsername={user.username} onToggleDone={toggleDone} onDelete={deleteTask} canDelete={canDeleteInMine(t)} onOpenDetail={setDetailTask} />
              ))
            )}
          </div>

          {doneMine.length > 0 && (
            <>
              <p style={{ fontSize: 11.5, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 8px' }}>
                Completed ({doneMine.length})
              </p>
              <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
                {doneMine.map(t => (
                  <TaskRow key={t.id} task={t} currentUsername={user.username} onToggleDone={toggleDone} onDelete={deleteTask} canDelete={canDeleteInMine(t)} onOpenDetail={setDetailTask} />
                ))}
              </div>
            </>
          )}
        </>
      ) : view === 'board' ? (
        <>
          <NewTaskForm staffOptions={staffOptions} defaultAssignee={staffOptions[0]?.username || ''} onCreate={createAssignedTask} />

          {loadingBoard ? (
            <p style={{ fontSize: 13, color: '#9ca3af' }}>Loading...</p>
          ) : Object.keys(grouped).length === 0 ? (
            <p style={{ fontSize: 13, color: '#9ca3af' }}>No tasks assigned to anyone yet.</p>
          ) : (
            staff.map(s => {
              const staffTasks = grouped[s.username] || [];
              if (staffTasks.length === 0) return null;
              const openCount = staffTasks.filter(t => t.status === 'open').length;
              return (
                <div key={s.username} style={{ marginBottom: 20 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>
                    {staffDisplayName(s)} <span style={{ fontWeight: 500, color: '#9ca3af' }}>&middot; {openCount} open</span>
                  </p>
                  <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
                    {staffTasks.map(t => (
                      <TaskRow key={t.id} task={t} currentUsername={user.username} onToggleDone={toggleDone} onDelete={deleteTask} canDelete={true} onOpenDetail={setDetailTask} />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 12.5, color: '#6b7280', margin: 0 }}>
              Tasks completed more than 72 hours ago, sorted by staff member and completion date.
            </p>
            <div style={{ position: 'relative', marginLeft: 'auto' }}>
              <button
                onClick={() => setShowLogCalendar(o => !o)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${BRAND_PURPLE}`, background: logDateFilter ? BRAND_TINT : 'white', color: BRAND_PURPLE }}
              >
                {logDateFilter ? new Date(logDateFilter + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Filter by date'}
              </button>
              {showLogCalendar && (
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 20, background: 'white', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', borderRadius: 8 }}>
                  <CalendarPicker
                    value={logDateFilter || dateToInputValue(new Date())}
                    onChange={(v) => { setLogDateFilter(v); setShowLogCalendar(false); }}
                  />
                </div>
              )}
            </div>
            {logDateFilter && (
              <button onClick={() => setLogDateFilter(null)} style={{ border: 'none', background: 'none', color: '#9ca3af', fontSize: 12, textDecoration: 'underline', cursor: 'pointer' }}>
                Clear
              </button>
            )}
          </div>

          {loadingBoard ? (
            <p style={{ fontSize: 13, color: '#9ca3af' }}>Loading...</p>
          ) : logStaffSorted.length === 0 ? (
            <p style={{ fontSize: 13, color: '#9ca3af' }}>
              {logDateFilter ? 'No tasks completed on that date.' : 'Nothing has aged into the log yet -- completed tasks show up here after 72 hours.'}
            </p>
          ) : (
            logStaffSorted.map(s => (
              <div key={s.username} style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>
                  {staffDisplayName(s)} <span style={{ fontWeight: 500, color: '#9ca3af' }}>&middot; {logTasksByStaff[s.username].length} completed</span>
                </p>
                <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
                  {logTasksByStaff[s.username].map(t => (
                    <TaskRow key={t.id} task={t} currentUsername={user.username} onToggleDone={toggleDone} onDelete={deleteTask} canDelete={true} onOpenDetail={setDetailTask} />
                  ))}
                </div>
              </div>
            ))
          )}
        </>
      )}

      {detailTask && (
        <TaskDetailModal
          task={detailTask}
          currentUser={user}
          onClose={() => setDetailTask(null)}
          onToggleDone={toggleDone}
          onTaskChanged={handleTaskChanged}
        />
      )}
    </div>
  );
}
