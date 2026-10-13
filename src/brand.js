// The clinic's brand: name, logo, letterhead and colors, picked at build time
// by VITE_CLINIC (.env sets kidzlounge; the Demo build sets pedsdesk). New
// code reads the clinic's name and details from CLINIC instead of typing
// them, and colors from the CSS variables applyBrand() sets, e.g.
// 'var(--brand-primary)'. Code that can't use CSS variables (PDFs, the print
// window) uses THEME's values directly.
import kidzlounge from './brands/kidzlounge';
import pedsdesk from './brands/pedsdesk';

const BRANDS = { kidzlounge, pedsdesk };

export const CLINIC = BRANDS[import.meta.env.VITE_CLINIC] || kidzlounge;
export const THEME = CLINIC.theme;
export const PRODUCT = 'PedsDesk';
// Shown small in the footer and on the sign-in page of every clinic but the
// product's own.
export const POWERED_BY = CLINIC.name === PRODUCT ? null : `Powered by ${PRODUCT}`;

// tint2 -> --brand-tint2, primaryBright -> --brand-primary-bright
const cssName = (key) => `--brand-${key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`;

// Before the first render: the color variables, the tab title and the icon.
export function applyBrand() {
  const root = document.documentElement.style;
  for (const [key, value] of Object.entries(THEME)) root.setProperty(cssName(key), value);
  document.title = CLINIC.name;
  const icon = document.querySelector('link[rel="icon"]');
  if (icon) icon.href = CLINIC.favicon;
}
