import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { stickyStackHeight } from './stickyLayout';
import { canDragAppointment, isSameSpot, minutesToTime, FIRST_START, LAST_START } from './scheduleDrag';

// Pointer handling for dragging appointment cards on the schedule grids (see
// scheduleDrag.js for the rules). One hook per page; the page puts
// `cardProps(apt)` on each AppointmentCard, marks its grid cells with
// data-drop-date (plus data-drop-provider / data-drop-room on the daily
// views, data-drop-disabled where nothing may be dropped), its rows with
// data-slot, and its previous/next arrows with data-drag-nav. The floating
// card and drop outline are drawn by <AppointmentDragLayer drag={...} />.
//
// Mouse: press and move a few pixels. Touch: press and hold, so an ordinary
// swipe over the cards still scrolls the page. While dragging, the page
// scrolls near the top or bottom of the window, and holding the card over
// the previous/next arrow flips the day (or week) so it can be dropped
// further away.

const MOUSE_SLOP = 5; // px a mouse press moves before it's a drag (less is a click)
const HOLD_MS = 450; // touch: how long to press before the card lifts
const TOUCH_SLOP = 10; // px a finger may wander during that hold; more is a scroll
const FLIP_MS = 600; // hovering over an arrow this long flips the day/week...
const FLIP_REPEAT_MS = 900; // ...and again this often while it stays there
const EDGE = 56; // px from the window's top/bottom edge where it auto-scrolls
const TICK_MS = 16; // how often auto-scroll and the arrow hover are checked
const CARD_MARGIN = 3; // AppointmentCard's gap from its cell (SchedulePage.jsx)

// Where a card dropped with its top edge at window y = `cardTop` would land.
function targetAt(x, y, cardTop, duration) {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const nav = el.closest('[data-drag-nav]');
  if (nav) return { nav };
  const cell = el.closest('[data-drop-date]');
  if (!cell || cell.hasAttribute('data-drop-disabled')) return null;
  const rows = cell.closest('table')?.querySelectorAll('tr[data-slot]');
  if (!rows || rows.length < 2) return null;
  const first = rows[0].getBoundingClientRect();
  const pitch = rows[1].getBoundingClientRect().top - first.top; // one half-hour row
  const raw = FIRST_START + ((cardTop - CARD_MARGIN - first.top) / pitch) * 30;
  const mins = Math.min(LAST_START, Math.max(FIRST_START, Math.round(raw / 15) * 15));
  const cellRect = cell.getBoundingClientRect();
  return {
    date: cell.dataset.dropDate,
    time: minutesToTime(mins),
    provider: cell.dataset.dropProvider || null,
    room: cell.dataset.dropRoom || null,
    rect: {
      left: cellRect.left,
      width: cellRect.width,
      top: first.top + ((mins - FIRST_START) / 30) * pitch,
      height: Math.max(0.5, duration / 30) * pitch,
    },
  };
}

const sameTarget = (a, b) => (!a && !b) || (a && b && a.nav === b.nav && a.date === b.date && a.time === b.time
  && a.provider === b.provider && a.room === b.room && a.rect?.top === b.rect?.top && a.rect?.left === b.rect?.left);

// The floating card's position, read by the layer alone (useDragFrame): the
// page re-renders only when a card lifts and lands, not on every move.
function createFrameStore() {
  let frame = null;
  const listeners = new Set();
  return {
    get: () => frame,
    set: (next) => { frame = next; listeners.forEach(l => l()); },
    subscribe: (l) => { listeners.add(l); return () => listeners.delete(l); },
  };
}

export function useDragFrame(store) {
  return useSyncExternalStore(store.subscribe, store.get);
}

export function useAppointmentDrag({ onDrop }) {
  const [draggingId, setDraggingId] = useState(null);
  const [store] = useState(createFrameStore);
  const pendingRef = useRef(null); // pressed, not lifted yet
  const activeRef = useRef(null); // lifted and following the pointer
  const onDropRef = useRef(onDrop);
  useEffect(() => { onDropRef.current = onDrop; });

  const publish = () => {
    const a = activeRef.current;
    if (!a) { store.set(null); return; }
    const target = a.target?.nav ? null : a.target;
    const prev = store.get();
    if (prev && prev.apt === a.apt && prev.x === a.x && prev.y === a.y && prev.target === target) return;
    store.set({ apt: a.apt, x: a.x, y: a.y, grabX: a.grabX, grabY: a.grabY, width: a.width, target });
  };

  const retarget = () => {
    const a = activeRef.current;
    if (!a) return;
    const t = targetAt(a.x, a.y, a.y - a.grabY, Number(a.apt.duration) || 30);
    if (!sameTarget(t, a.target)) {
      if (t?.nav !== a.target?.nav) a.navSince = t?.nav ? performance.now() : null;
      a.target = t;
    }
    publish();
  };

  const cleanup = () => {
    const p = pendingRef.current;
    if (p) clearTimeout(p.timer);
    pendingRef.current = null;
    const a = activeRef.current;
    if (a) {
      clearInterval(a.timer);
      a.touchEl?.removeEventListener('touchmove', preventTouchScroll);
    }
    activeRef.current = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('keydown', onKey);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    setDraggingId(null);
    store.set(null);
  };

  // The release that ends a drag would also "click" the card (opening its
  // window); swallow that one click.
  const swallowNextClick = () => {
    const stop = (e) => { e.stopPropagation(); e.preventDefault(); };
    window.addEventListener('click', stop, true);
    setTimeout(() => window.removeEventListener('click', stop, true), 350);
  };

  const tick = () => {
    const a = activeRef.current;
    if (!a) return;
    // Scroll the page while the pointer is near the top (just under the
    // sticky header) or bottom of the window.
    const top = stickyStackHeight();
    let dy = 0;
    if (a.y > top && a.y < top + EDGE) dy = -Math.ceil((top + EDGE - a.y) / 4);
    else if (a.y > window.innerHeight - EDGE) dy = Math.ceil((a.y - (window.innerHeight - EDGE)) / 4);
    if (dy) window.scrollBy(0, dy);
    // Hovering over a previous/next arrow flips the day or week.
    const nav = a.target?.nav;
    if (nav && a.navSince != null && performance.now() - a.navSince >= (a.flipped ? FLIP_REPEAT_MS : FLIP_MS)) {
      nav.click();
      a.navSince = performance.now();
      a.flipped = true;
    } else if (!nav) {
      a.flipped = false;
    }
    // The grid under a still pointer changes as it scrolls or flips.
    retarget();
  };

  const lift = (x, y) => {
    const p = pendingRef.current;
    if (!p) return;
    clearTimeout(p.timer);
    pendingRef.current = null;
    activeRef.current = {
      apt: p.apt, x, y,
      grabX: p.startX - p.rect.left, grabY: p.startY - p.rect.top, width: p.rect.width,
      target: null, navSince: null, flipped: false, touchEl: p.touchEl, timer: 0,
    };
    // Stops the page scrolling under a finger that's dragging. Also on the
    // pressed element itself: if a flip removes that card from the page, its
    // touch events no longer reach the window.
    p.touchEl?.addEventListener('touchmove', preventTouchScroll, { passive: false });
    if (p.pointerType !== 'mouse') navigator.vibrate?.(15);
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    setDraggingId(p.apt.id);
    retarget();
    // A timer rather than animation frames: it keeps going while the
    // pointer is still, which is when scrolling and flipping happen.
    activeRef.current.timer = setInterval(tick, TICK_MS);
  };

  function onMove(e) {
    const p = pendingRef.current;
    if (p && e.pointerId === p.pointerId) {
      const moved = Math.hypot(e.clientX - p.startX, e.clientY - p.startY);
      if (p.pointerType === 'mouse') { if (moved > MOUSE_SLOP) lift(e.clientX, e.clientY); }
      else if (moved > TOUCH_SLOP) cleanup(); // a swipe: let it scroll
      return;
    }
    const a = activeRef.current;
    if (!a) return;
    a.x = e.clientX; a.y = e.clientY;
    retarget();
  }

  function onUp() {
    const a = activeRef.current;
    if (!a) { cleanup(); return; }
    const { apt, target } = a;
    cleanup();
    swallowNextClick();
    if (target && !target.nav && !isSameSpot(apt, target)) {
      onDropRef.current?.(apt, { date: target.date, time: target.time, provider: target.provider, room: target.room });
    }
  }

  function onCancel() {
    const wasActive = !!activeRef.current;
    cleanup();
    if (wasActive) swallowNextClick();
  }

  function onKey(e) {
    if (e.key === 'Escape') onCancel();
  }

  // Page-wide while this hook is mounted: a touch that has lifted a card
  // mustn't scroll the page. Registered up front because the browser only
  // waits for touch listeners that already exist when the touch starts.
  useEffect(() => {
    const block = (e) => { if (activeRef.current) e.preventDefault(); };
    // A long press would otherwise open the text / context menu on phones.
    const noMenu = (e) => { if (pendingRef.current || activeRef.current) e.preventDefault(); };
    document.addEventListener('touchmove', block, { passive: false });
    document.addEventListener('contextmenu', noMenu);
    return () => {
      document.removeEventListener('touchmove', block);
      document.removeEventListener('contextmenu', noMenu);
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = (e, apt) => {
    if (pendingRef.current || activeRef.current) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = e.currentTarget;
    pendingRef.current = {
      apt, pointerId: e.pointerId, pointerType: e.pointerType,
      startX: e.clientX, startY: e.clientY, rect: el.getBoundingClientRect(),
      touchEl: e.pointerType === 'mouse' ? null : e.target,
      timer: e.pointerType === 'mouse' ? 0 : setTimeout(() => lift(pendingRef.current?.startX, pendingRef.current?.startY), HOLD_MS),
    };
    // Keeps a mouse drag from selecting text on the way.
    if (e.pointerType === 'mouse') e.preventDefault();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
  };

  const cardProps = (apt) => (canDragAppointment(apt) ? { onPointerDown: (e) => start(e, apt) } : {});

  const isDragging = useCallback(() => !!activeRef.current, []);

  return { cardProps, draggingId, store, isDragging };
}

function preventTouchScroll(e) {
  e.preventDefault();
}
