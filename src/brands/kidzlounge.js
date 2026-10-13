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
  },
};
