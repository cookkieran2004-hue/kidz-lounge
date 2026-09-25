import { useState, useEffect } from 'react';

// Below this viewport width, treat the screen as mobile/tablet. Covers
// phones and tablets in either orientation. Driven by actual viewport width
// (not user-agent sniffing), so it reacts correctly to window resizing and
// device rotation instead of relying on a fragile device guess.
export const MOBILE_BREAKPOINT = 1024;

export function useIsMobile(breakpoint = MOBILE_BREAKPOINT) {
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < breakpoint : false));
  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < breakpoint);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [breakpoint]);
  return isMobile;
}
