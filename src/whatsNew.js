import { CLINIC } from './brand';
import { canManage, canAdminister } from './roles';
// The "What's new" pop-up (WhatsNewNotifier.jsx). Everyone sees it once
// after signing in, until they click Got it. To announce something new,
// replace the items and change `id`: a new id shows again to everyone.
// Seen ids are remembered per person in the browser (localStorage), so
// someone who uses two computers sees it once on each.
//
// `for` picks who sees an item (Oct 2026): 'all', 'provider' (a linked
// provider), 'manage' (Reception, Admin, Developer) or 'admin' (Admin,
// Developer). Run the wording by Kieran before changing it.
export const WHATS_NEW = {
  id: '2026-10-13',
  title: `What's new in ${CLINIC.shortName}`,
  items: [
    { for: 'all', name: 'Outside hours', text: 'extra offsite visits outside regular hours can now be booked any time, any day. Choose Offsite, tick Outside hours, and they show in a strip under the schedule.' },
    { for: 'all', name: 'Canceled offsite sessions', text: 'keep their location, and you can add a reason: Holiday, Emergency Closure, or Other (see comments).' },
    { for: 'all', name: 'Provider directory', text: "a footer link to every provider's phone, email, NPI and license number." },
    { for: 'provider', name: 'Your credentials', text: 'My profile → Credentials shows which of the 9 required credentials are on file. Pick each one from the list; the date to enter is explained under it.' },
    { for: 'provider', name: 'My time', text: "shows how many outside-hours visits you've had this month." },
    { for: 'manage', name: 'Tasks to several people', text: 'on the Task Board, pick as many people as you need. Each gets their own copy.' },
    { for: 'manage', name: 'Credentials page', text: "(footer link): everyone's credentials in one place, showing what's expired, expiring or missing. Reception can now update them as paperwork comes in." },
    { for: 'manage', name: 'Report reminders', text: "now also go to the case manager (or to admins and reception when there isn't one)." },
    { for: 'admin', name: 'Billing', text: 'EI totals are split into EI Center & School and EI Home. Holiday and Emergency Closure cancellations show as H and Z.' },
    { for: 'admin', name: 'EI-Hub Entry', text: "the Billing page's EI-Hub tab lists EI sessions to enter, with claim files." },
    { for: 'admin', name: 'Power Forms', text: '(footer link): send parents forms to fill in by secure link; completed forms are saved to the chart.' },
  ],
};

// The items this person should see.
export function whatsNewItemsFor(user) {
  const sees = {
    all: true,
    provider: !!user?.providerName,
    manage: canManage(user),
    admin: canAdminister(user),
  };
  return WHATS_NEW.items.filter(i => sees[i.for]);
}
