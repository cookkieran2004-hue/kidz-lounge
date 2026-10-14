// Central view (Oct 2026, /central, src/pages/CentralPage.jsx): the
// developer's one place for every practice's support tickets, chats, tasks
// and health. Only in the PedsDesk build (the Demo site), only for
// Developers.
//
// The browser asks each practice's API directly, signed in there with the
// developer's own account for that practice. The practices' servers can't
// call each other (no internet access from their network), and this way no
// shared key exists anywhere. Each practice's ALLOWED_ORIGINS must include
// the Demo site's address, or its browser requests are refused.
import { CLINIC, PRODUCT } from './brand';
import { getToken } from './api';

export const CENTRAL_ENABLED = CLINIC.name === PRODUCT;
export const canUseCentral = (user) => CENTRAL_ENABLED && user?.role === 'developer';

// Every practice running PedsDesk. Add one when a new clinic is set up.
export const PRACTICES = [
  { id: 'demo', name: 'PedsDesk Demo', site: 'https://pedsdesk-demo.vercel.app', api: 'https://hw6h5sgpul.execute-api.us-east-2.amazonaws.com' },
  { id: 'kidzlounge', name: 'Kidz Lounge', site: 'https://kidzlounge.vercel.app', api: 'https://ghvvy10ht8.execute-api.us-east-2.amazonaws.com' },
];

const trim = (url) => String(url || '').replace(/\/$/, '');
// The practice this site belongs to uses the sign-in you already have.
export const isHere = (practice) => trim(practice.api) === trim(import.meta.env.VITE_API_URL);

// Other practices' sign-ins: sessionStorage, like the app's own, so closing
// the tab signs out of them too. Signing out of the app forgets them.
const KEY_PREFIX = 'central_token_';
export function practiceToken(practice) {
  if (isHere(practice)) return getToken();
  try { return sessionStorage.getItem(KEY_PREFIX + practice.id); } catch { return null; }
}
function setPracticeToken(practice, token) {
  try {
    if (token) sessionStorage.setItem(KEY_PREFIX + practice.id, token);
    else sessionStorage.removeItem(KEY_PREFIX + practice.id);
  } catch { /* storage blocked: the sign-in lasts until the page reloads */ }
}

export async function practiceRequest(practice, path, options = {}) {
  const token = practiceToken(practice);
  let res;
  try {
    res = await fetch(`${trim(practice.api)}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
  } catch (networkErr) {
    // Also what a CORS refusal looks like from here.
    const err = new Error(`Couldn't reach ${practice.name}. If this keeps happening, check that its ALLOWED_ORIGINS includes ${window.location.origin}.`);
    err.status = 0;
    err.cause = networkErr;
    throw err;
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // An expired sign-in elsewhere: forget it so the card asks again.
    if (res.status === 401 && !isHere(practice)) setPracticeToken(practice, null);
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function signInToPractice(practice, username, password) {
  const data = await practiceRequest(practice, '/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
  if (data.mustResetPassword) throw new Error(`Set a new password on ${practice.name}'s site first, then sign in here.`);
  if (data.role !== 'developer') throw new Error(`That account isn't a Developer at ${practice.name}.`);
  setPracticeToken(practice, data.token);
  try { sessionStorage.removeItem(AUTO_ERROR_PREFIX + practice.id); } catch { /* nothing to clear */ }
  return data;
}

// Signing in to PedsDesk signs you in to every other practice too (Kieran,
// Oct 2026), with the same username and password -- so a Developer keeps the
// same login at every clinic. One try per practice per sign-in, so a
// practice where the password differs never builds up toward its lockout;
// its card then shows why and asks as before. Each practice still checks
// the password itself and logs the sign-in in its own audit log.
const AUTO_ERROR_PREFIX = 'central_auto_error_';
let autoSignInRunning = false;
export const autoSignInPending = () => autoSignInRunning;
export function autoSignInError(practice) {
  try { return sessionStorage.getItem(AUTO_ERROR_PREFIX + practice.id); } catch { return null; }
}
export const CENTRAL_SIGNINS_CHANGED = 'kl-central-signins-changed';

export async function signInEverywhere(username, password) {
  autoSignInRunning = true;
  try {
    await Promise.all(PRACTICES.filter(p => !isHere(p)).map(async (p) => {
      try {
        await signInToPractice(p, username, password);
        sessionStorage.removeItem(AUTO_ERROR_PREFIX + p.id);
      } catch (err) {
        try { sessionStorage.setItem(AUTO_ERROR_PREFIX + p.id, err.message); } catch { /* shown as a plain sign-in */ }
      }
    }));
  } finally {
    autoSignInRunning = false;
    window.dispatchEvent(new Event(CENTRAL_SIGNINS_CHANGED));
  }
}

export function signOutOfPractice(practice) {
  const token = practiceToken(practice);
  if (token) {
    fetch(`${trim(practice.api)}/auth/logout`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ reason: 'signed out' }),
    }).catch(() => {});
  }
  setPracticeToken(practice, null);
}

// Signing out of the app (or the idle timeout): sign out of every other
// practice too, so each one's audit log shows the session ending.
export function forgetPracticeTokens() {
  for (const p of PRACTICES) {
    if (isHere(p)) continue;
    signOutOfPractice(p);
    try { sessionStorage.removeItem(AUTO_ERROR_PREFIX + p.id); } catch { /* nothing to clear */ }
  }
}
