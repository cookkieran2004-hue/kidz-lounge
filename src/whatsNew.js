// The "What's new" pop-up (WhatsNewNotifier.jsx). Everyone sees it once
// after signing in, until they click Got it. To announce something new,
// replace the items and change `id`: a new id shows again to everyone.
// Seen ids are remembered per person in the browser (localStorage), so
// someone who uses two computers sees it once on each.
export const WHATS_NEW = {
  id: '2026-10-08',
  title: "What's new in Kidz Lounge",
  items: [
    ['Drag and drop on the schedule', 'drag an appointment to a new time, provider, room or day. On a phone or tablet, press and hold it first. Undo appears at the bottom.'],
    ['Make-ups', 'open a canceled or no-show appointment and click Schedule make up, or drag the canceled card to a free spot. Make Up and MUS are no longer statuses.'],
    ['Billing', "the new Billing page shows a provider's month as the billing sheet."],
    ['Programs and mandates', 'click a program in the patient form to set its mandate for each service. The chart keeps the history.'],
    ['Evals', "book one from the patient's Appointments tab with Book Eval."],
    ['Offsite sessions', 'now ask for Center, School or Home.'],
    ['Patient links', 'add several, each with its own text, with Edit links on the chart.'],
    ['Insert link', 'add a link with display text in comments, notes, tasks and agendas.'],
  ],
};
