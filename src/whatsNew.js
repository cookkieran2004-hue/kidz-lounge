import { CLINIC } from './brand';
import { canManage, canAdminister } from './roles';
// The "What's new" pop-up (WhatsNewNotifier.jsx). Everyone sees it once
// after signing in, until they click Got it, and only between showFrom and
// showUntil (clinic dates, both included). To announce something, add the
// items, set the dates and change `id`: a new id shows again to everyone.
// Seen ids are remembered per person in the browser (localStorage), so
// someone who uses two computers sees it once on each.
//
// Kieran's rules (Oct 15 2026): only new features, never bug fixes unless
// he says so; only for the timeframe he gives; and run the wording by him.
// With no items (as now) nothing shows at any clinic.
//
// `for` picks who sees an item: 'all', 'provider' (a linked provider),
// 'manage' (Reception, Admin, Developer) or 'admin' (Admin, Developer).
// Example item: { for: 'all', name: 'Provider directory', text: "a footer link to every provider's phone and email." }
export const WHATS_NEW = {
  id: '',
  title: `What's new in ${CLINIC.shortName}`,
  showFrom: null,   // 'YYYY-MM-DD'
  showUntil: null,  // 'YYYY-MM-DD'
  items: [],
};

// Today in clinic time, 'YYYY-MM-DD'.
const clinicToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());

// The items this person should see.
export function whatsNewItemsFor(user) {
  const { id, showFrom, showUntil, items } = WHATS_NEW;
  const today = clinicToday();
  if (!id || !items.length || !showFrom || !showUntil || today < showFrom || today > showUntil) return [];
  const sees = {
    all: true,
    provider: !!user?.providerName,
    manage: canManage(user),
    admin: canAdminister(user),
  };
  return items.filter(i => sees[i.for]);
}
