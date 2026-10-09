import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useDragFrame } from './useAppointmentDrag';
import { describeDrop, isMissedAppt } from './scheduleDrag';
import { stickyStackHeight } from './stickyLayout';

const ACCENT = '#6D28D9';
const MAKEUP_GREEN = '#15803D';
// Drawn on document.body, outside the schedule page's own font setting.
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

// What's drawn while a card is dragged (useAppointmentDrag.js): a dashed
// outline where it will land, and a small card under the pointer saying
// where that is. A canceled / no-show card books a make-up there instead of
// moving, so it says "Make up" and the outline is green.
export function AppointmentDragLayer({ drag }) {
  const frame = useDragFrame(drag.store);
  if (!frame) return null;
  const { apt, target } = frame;
  const makeup = isMissedAppt(apt);
  const color = makeup ? MAKEUP_GREEN : ACCENT;
  let outline = null;
  if (target) {
    // Never over the sticky header and column names.
    const covered = stickyStackHeight();
    const top = Math.max(target.rect.top, covered);
    const height = target.rect.top + target.rect.height - top;
    if (height > 0) {
      outline = (
        <div style={{
          position: 'fixed', left: target.rect.left + 3, width: target.rect.width - 6, top, height,
          boxSizing: 'border-box', borderRadius: 6, border: `2px dashed ${color}`,
          background: `color-mix(in srgb, ${color} 8%, transparent)`, pointerEvents: 'none', zIndex: 24,
        }} />
      );
    }
  }
  return createPortal(
    <>
      {outline}
      <div style={{
        position: 'fixed', left: frame.x - frame.grabX, top: frame.y - frame.grabY, width: Math.max(150, frame.width),
        boxSizing: 'border-box', padding: '6px 9px', borderRadius: 6, background: 'white',
        border: '1px solid #d1d5db', borderLeft: `3px solid ${color}`, boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
        pointerEvents: 'none', zIndex: 9000, fontFamily: FONT,
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {apt.patient_name || '(no patient)'}
        </div>
        <div style={{ fontSize: 11, color: target ? color : '#6b7280', fontWeight: 600, marginTop: 2, lineHeight: 1.3 }}>
          {target ? `${makeup ? 'Make up: ' : ''}${describeDrop(apt, target)}` : 'Drop on the schedule'}
        </div>
      </div>
    </>,
    document.body,
  );
}

// "Moved Ava Brown to Thu, Oct 9 at 2:00 PM  Undo" at the bottom of the
// window after a drop. `toast`: { message, undo?, error? }.
export function DropToast({ toast, onUndo, onClose }) {
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(onClose, toast.error ? 10000 : 8000);
    return () => clearTimeout(t);
  }, [toast, onClose]);
  if (!toast) return null;
  return createPortal(
    <div role="status" style={{
      position: 'fixed', left: '50%', bottom: 20, transform: 'translateX(-50%)', zIndex: 9500,
      display: 'flex', alignItems: 'center', gap: 14, maxWidth: 'calc(100vw - 32px)', boxSizing: 'border-box',
      padding: '10px 14px', borderRadius: 8, background: 'white', border: `1px solid ${toast.error ? '#fecaca' : '#e5e7eb'}`,
      boxShadow: '0 4px 14px rgba(0,0,0,0.10)', fontSize: 13, fontFamily: FONT, color: toast.error ? '#991b1b' : '#1f2937',
    }}>
      <span>{toast.message}</span>
      {toast.undo && (
        <button type="button" onClick={onUndo} style={{ fontFamily: FONT, border: 'none', background: 'none', padding: 0, color: ACCENT, fontWeight: 700, fontSize: 13, cursor: 'pointer', flexShrink: 0 }}>
          Undo
        </button>
      )}
      <button type="button" aria-label="Close" onClick={onClose} style={{ border: 'none', background: 'none', padding: '0 2px', color: '#9ca3af', fontSize: 16, lineHeight: 1, cursor: 'pointer', flexShrink: 0 }}>
        ×
      </button>
    </div>,
    document.body,
  );
}
