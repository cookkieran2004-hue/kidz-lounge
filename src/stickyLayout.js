import { useEffect } from 'react';

// Sticky header stack. The nav bar stays at the top of every page; a page
// can add its own sticky header just below it (the schedule's title, date,
// view buttons and specialty bubbles), and the schedule grid's column names
// stick below both. Each layer publishes its live height as a CSS variable
// so the next one knows where to sit:
//   --kl-nav-h          the nav bar (NavBar.jsx)
//   --kl-page-header-h  the current page's sticky header, if it has one
// e.g. top: 'calc(var(--kl-nav-h, 0px) + var(--kl-page-header-h, 0px))'.
// Heights change as things wrap (a narrower window, more bubbles), so they're
// measured with a ResizeObserver rather than hard-coded.
export const STACK_TOP = 'calc(var(--kl-nav-h, 0px) + var(--kl-page-header-h, 0px))';

export function useStickyHeight(ref, varName) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const root = document.documentElement;
    const update = () => root.style.setProperty(varName, `${el.getBoundingClientRect().height}px`);
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => { ro?.disconnect(); root.style.removeProperty(varName); };
  });
}

// Pixels currently covered at the top of the window by the sticky stack.
export function stickyStackHeight() {
  const css = getComputedStyle(document.documentElement);
  return (parseFloat(css.getPropertyValue('--kl-nav-h')) || 0) + (parseFloat(css.getPropertyValue('--kl-page-header-h')) || 0);
}
