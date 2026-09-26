import React, { useState } from 'react';
import { api } from './api';
import { useIsMobile } from './useIsMobile';
import { useStaffNames } from './staffDirectory';
import { DateField } from './pages/SchedulePage';

const BRAND_PURPLE = '#6D28D9';
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

function formatCommentTimestamp(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function parseTaskComments(rawComments) {
  if (!rawComments) return [];
  try {
    const parsed = JSON.parse(rawComments);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    // Flat-text comment from before the structured format existed --
    // preserved as a single read-only entry so nothing is lost from view.
    return [{ id: 0, author_username: null, author_display: null, timestamp: null, text: rawComments, legacy: true }];
  }
}

export function taskHasComments(task) {
  return parseTaskComments(task.comments).length > 0;
}

function CommentRow({ comment, isAdmin, currentUsername, onEdit, onDelete, isMobile }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(comment.text);
  const [saving, setSaving] = useState(false);
  const isOwnComment = comment.author_username === currentUsername;

  const save = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await onEdit(comment.id, text.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: '8px 0', borderBottom: '1px solid #f1f2f4' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
          {comment.legacy ? 'Legacy comment' : (comment.author_display || comment.author_username)}
        </span>
        <span style={{ fontSize: 10.5, color: '#9ca3af', whiteSpace: 'nowrap' }}>
          {comment.legacy ? '' : formatCommentTimestamp(comment.timestamp)}{comment.edited ? ' (edited)' : ''}
        </span>
      </div>
      {editing ? (
        <div style={{ marginTop: 4 }}>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            style={{ width: '100%', minHeight: isMobile ? 56 : 44, padding: isMobile ? '8px 10px' : '6px 8px', borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: isMobile ? 14.5 : 12.5, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <button onClick={save} disabled={saving || !text.trim()} style={{ fontSize: isMobile ? 13 : 11.5, fontWeight: 600, padding: isMobile ? '7px 14px' : '4px 10px', borderRadius: 5, border: 'none', background: BRAND_PURPLE, color: 'white', cursor: 'pointer' }}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={() => { setEditing(false); setText(comment.text); }} style={{ fontSize: isMobile ? 13 : 11.5, fontWeight: 600, padding: isMobile ? '7px 14px' : '4px 10px', borderRadius: 5, border: `1px solid ${BORDER}`, background: 'white', color: '#374151', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <p style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, color: '#374151', margin: '3px 0 0' }}>{comment.text}</p>
          {!comment.legacy && (isOwnComment || isAdmin) && (
            <div style={{ display: 'flex', gap: isMobile ? 16 : 10, marginTop: isMobile ? 6 : 3 }}>
              {isOwnComment && (
                <button onClick={() => setEditing(true)} style={{ border: 'none', background: 'none', color: '#9ca3af', fontSize: isMobile ? 12.5 : 11, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                  Edit
                </button>
              )}
              {isAdmin && (
                <button onClick={() => onDelete(comment.id)} style={{ border: 'none', background: 'none', color: '#dc2626', fontSize: isMobile ? 12.5 : 11, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                  Delete
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function TaskDetailModal({ task, currentUser, onClose, onToggleDone, onTaskChanged }) {
  const nameFor = useStaffNames();
  const isMobile = useIsMobile();
  const [newComment, setNewComment] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [editingTask, setEditingTask] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDescription, setEditDescription] = useState(task.description || '');
  const [editDueDate, setEditDueDate] = useState(task.due_date || '');
  const [savingEdit, setSavingEdit] = useState(false);

  const due = formatDueDate(task.due_date);
  const comments = parseTaskComments(task.comments);
  const isAdmin = currentUser.role === 'admin';
  const isAssignee = task.assigned_to === currentUser.username;
  const isAssigner = task.assigned_by === currentUser.username;
  const canEditContent = isAdmin || isAssigner;
  const canToggleStatus = isAdmin || isAssigner || isAssignee;

  const handleSendComment = async () => {
    if (!newComment.trim()) return;
    setSending(true);
    setError(null);
    try {
      await api.appendTaskComment(task.id, newComment.trim());
      setNewComment('');
      await onTaskChanged();
    } catch (err) {
      setError(err.message);
    }
    setSending(false);
  };

  const handleEditComment = async (commentId, text) => {
    await api.editTaskComment(task.id, commentId, text);
    await onTaskChanged();
  };

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm('Delete this comment? This cannot be undone.')) return;
    await api.deleteTaskComment(task.id, commentId);
    await onTaskChanged();
  };

  const handleSaveEdit = async () => {
    if (!editTitle.trim()) return;
    setSavingEdit(true);
    setError(null);
    try {
      await api.updateTask(task.id, { title: editTitle.trim(), description: editDescription.trim(), due_date: editDueDate || null });
      await onTaskChanged();
      setEditingTask(false);
    } catch (err) {
      setError(err.message);
    }
    setSavingEdit(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', zIndex: 10000, padding: isMobile ? 0 : 16 }} onClick={onClose}>
      <div style={{
        background: 'white', borderRadius: isMobile ? '16px 16px 0 0' : 12, width: '100%',
        maxWidth: isMobile ? 'none' : 480, maxHeight: isMobile ? '92vh' : '85vh',
        overflowY: 'auto', padding: isMobile ? '20px 18px' : 22, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', boxSizing: 'border-box',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          {editingTask ? (
            <input
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              style={{ flex: 1, fontSize: isMobile ? 17 : 16, fontWeight: 700, padding: isMobile ? '8px 10px' : '6px 8px', borderRadius: 6, border: `1.5px solid ${BRAND_PURPLE}`, marginRight: 8, boxSizing: 'border-box' }}
            />
          ) : (
            <h2 style={{ fontSize: isMobile ? 18 : 17, fontWeight: 700, margin: 0, color: '#111827', textDecoration: task.status === 'done' ? 'line-through' : 'none' }}>{task.title}</h2>
          )}
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: isMobile ? 24 : 18, cursor: 'pointer', color: '#6b7280', lineHeight: 1, flexShrink: 0, padding: isMobile ? '4px 6px' : 0 }}>&times;</button>
        </div>

        {editingTask ? (
          <div style={{ marginTop: 8 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Description</label>
            <textarea
              value={editDescription}
              onChange={e => setEditDescription(e.target.value)}
              style={{ width: '100%', minHeight: isMobile ? 60 : 50, padding: isMobile ? '9px 10px' : '7px 9px', borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: isMobile ? 15 : 13, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical', marginBottom: 8 }}
            />
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>Due Date</label>
            <DateField
              clearable
              value={editDueDate}
              onChange={setEditDueDate}
              ariaLabel="Due date"
              style={{ padding: isMobile ? '9px 10px' : '7px 9px', borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: isMobile ? 15 : 13, marginBottom: 10, width: isMobile ? '100%' : 'auto', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8 }}>
              <button onClick={handleSaveEdit} disabled={savingEdit || !editTitle.trim()} style={{ padding: isMobile ? '11px 14px' : '7px 14px', borderRadius: 6, fontSize: isMobile ? 14.5 : 12.5, fontWeight: 600, border: 'none', background: BRAND_PURPLE, color: 'white', cursor: 'pointer', width: isMobile ? '100%' : 'auto' }}>
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </button>
              <button onClick={() => setEditingTask(false)} style={{ padding: isMobile ? '11px 14px' : '7px 14px', borderRadius: 6, fontSize: isMobile ? 14.5 : 12.5, fontWeight: 600, border: `1px solid ${BORDER}`, background: 'white', color: '#374151', cursor: 'pointer', width: isMobile ? '100%' : 'auto' }}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {task.description && <p style={{ fontSize: 13.5, color: '#374151', margin: '8px 0' }}>{task.description}</p>}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '10px 0 12px' }}>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>For {task.assigned_to}</span>
              {task.assigned_by && <span style={{ fontSize: 12, color: '#9ca3af' }}>&middot; Assigned by {task.assigned_by_display || nameFor(task.assigned_by)}</span>}
              {due && <span style={{ fontSize: 12, color: due.overdue && task.status !== 'done' ? '#dc2626' : '#9ca3af' }}>&middot; Due {due.label}</span>}
              {task.status === 'done' && task.completed_at && (
                <span style={{ fontSize: 12, color: '#9ca3af' }}>&middot; Completed {formatCompletedAt(task.completed_at)}</span>
              )}
            </div>
          </>
        )}

        {!editingTask && (
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, marginBottom: 18 }}>
            {canToggleStatus && (
              <button
                onClick={() => onToggleDone(task)}
                style={{
                  padding: isMobile ? '11px 14px' : '7px 14px', borderRadius: 6, fontSize: isMobile ? 14.5 : 12.5, fontWeight: 600, cursor: 'pointer',
                  border: `1.5px solid ${BRAND_PURPLE}`, background: task.status === 'done' ? 'white' : BRAND_PURPLE,
                  color: task.status === 'done' ? BRAND_PURPLE : 'white', width: isMobile ? '100%' : 'auto',
                }}
              >
                {task.status === 'done' ? 'Reopen Task' : 'Mark Complete'}
              </button>
            )}
            {canEditContent && (
              <button
                onClick={() => setEditingTask(true)}
                style={{ padding: isMobile ? '11px 14px' : '7px 14px', borderRadius: 6, fontSize: isMobile ? 14.5 : 12.5, fontWeight: 600, cursor: 'pointer', border: `1px solid ${BORDER}`, background: 'white', color: '#374151', width: isMobile ? '100%' : 'auto' }}
              >
                Edit Task
              </button>
            )}
          </div>
        )}

        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>Comments</label>
        <div style={{ background: '#f9fafb', borderRadius: 8, padding: '4px 10px', marginBottom: 8, maxHeight: isMobile ? 160 : 200, overflowY: 'auto' }}>
          {comments.length === 0 ? (
            <p style={{ fontSize: 12.5, color: '#9ca3af', textAlign: 'center', margin: '10px 0' }}>No comments yet</p>
          ) : (
            comments.map(c => (
              <CommentRow
                key={c.id}
                comment={c}
                isAdmin={isAdmin}
                currentUsername={currentUser.username}
                onEdit={handleEditComment}
                onDelete={handleDeleteComment}
                isMobile={isMobile}
              />
            ))
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, alignItems: isMobile ? 'stretch' : 'flex-start' }}>
          <textarea
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            style={{ flex: 1, minHeight: isMobile ? 60 : 44, padding: isMobile ? '10px 12px' : '8px 10px', borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: isMobile ? 15 : 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
          />
          <button
            onClick={handleSendComment}
            disabled={sending || !newComment.trim()}
            style={{ padding: isMobile ? '11px 14px' : '8px 14px', borderRadius: 8, fontSize: isMobile ? 15 : 13, fontWeight: 600, border: 'none', background: BRAND_PURPLE, color: 'white', cursor: 'pointer', width: isMobile ? '100%' : 'auto' }}
          >
            {sending ? '...' : 'Send'}
          </button>
        </div>
        {error && <p style={{ color: '#dc2626', fontSize: 12.5, marginTop: 8 }}>{error}</p>}
      </div>
    </div>
  );
}
