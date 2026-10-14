// Kidz Lounge: its name, logo, letterhead and the purple palette the app has
// always had. Every value here is the exact color the code used before the
// brand was made a per-clinic setting, so Kidz Lounge looks the same.
export default {
  name: 'The Kidz Lounge', // titles, PDFs, the logo's alt text
  shortName: 'Kidz Lounge', // in sentences: "Kidz Lounge has received your form"
  logo: '/logo.png',
  favicon: '/logo.png',
  // The letterhead on Power Forms (the parent's page and the PDF copies),
  // as on the paper forms (Kieran, Oct 2026: "full letterhead").
  letterhead: {
    name: 'The Kidz Lounge Related Services, LLC',
    lines: [
      '82-12 151st Ave, Howard Beach, NY 11414 · (718) 848-0875',
      'kidzlounge.net · thekidzloungeny@gmail.com',
      'www.confidentkidzny.com · www.languageloungeny.com',
    ],
    tagline: 'Providing Occupational, Physical and Speech Therapy. We also offer classes for kidz.',
  },
  // Optional features (Oct 2026), matched by FEATURES on the clinic's API
  // (kidz-lounge-api lib/features.js). ei: the EMR for NYC Early
  // Intervention agencies. mandates: Billing's month overview, mandates and
  // needs attention, and the EI child-absence reason. Both PedsDesk only.
  features: { ei: false, mandates: false },
  theme: {
    primary: '#6D28D9', // primary buttons, links, the selected tab
    primaryBright: '#7C3AED',
    primaryStrong: '#5B21B6',
    primaryDeep: '#4C1D95',
    primaryDeeper: '#3C3489',
    primaryFaint: '#C4B5FD', // a primary button while disabled
    highlight: '#6D28D9', // small accents (PedsDesk's yellow)
    highlightTint: '#F5F3FF',
    tint: '#F5F3FF', // selected and hovered backgrounds
    tint2: '#EDE9FE',
    tint3: '#F1EAFE',
    tint4: '#F3F0FB',
    tint5: '#EEE9F7',
    tint6: '#EEEAF6',
    tint7: '#FAF5FF',
    wash: '#FCFBFE', // near-white panel backgrounds
    wash2: '#FAF9FD',
    wash3: '#FAF8FF',
    line: '#EDE9F7', // light row dividers
    border: '#E7E2F3',
    border2: '#E5E1F0',
    border3: '#D6CCEF',
    ink: '#241A33', // headings and names
    muted: '#6B6280',
    muted2: '#5F5A6B',
    muted3: '#4B4659',
    subtle: '#B8B5C4',
    subtle2: '#A8A2B5',
    subtle3: '#C9C3D6',
    gray: '#F1F0F4',
    gray2: '#F3F2F7',
    shadow: '#4C1D6B', // tinted drop shadows
    // Page backgrounds: dashboard-style pages, and the two schedules.
    pageBg: '#F7F7F8',
    pageBg2: '#F6F7F9',
    // Appointment statuses that carry the brand (the rest are the same at
    // every clinic). Cards are these colors mixed with white.
    statusConfirmed: '#907BE3',
    statusMessage: '#9B8FC9', // Left Message, Emailed
    // Badges, chips and tags: Kidz Lounge's are pills.
    pillRadius: '999px',
    viewSwitch: '#DC2626', // the schedule's Provider / Room / Unassigned switch
  },
};
