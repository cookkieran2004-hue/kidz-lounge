// PedsDesk: the product's own brand, used by the Demo clinic. Deep blue with
// a warm yellow used sparingly (the logo, small highlights), never for text
// on white. Each color has the same job as Kidz Lounge's at the same key:
// the main ones are the chosen palette, the rest are Kidz Lounge's purples
// moved to the same blue, at the same lightness.
export default {
  name: 'PedsDesk',
  shortName: 'PedsDesk',
  logo: '/brands/pedsdesk/logo.svg',
  logoPng: '/brands/pedsdesk/logo.png', // PDFs can't use SVG
  favicon: '/brands/pedsdesk/favicon.svg',
  letterhead: {
    name: 'PedsDesk Demo Clinic',
    lines: ['A demonstration clinic. All names and details are made up.'],
    tagline: 'Occupational, physical and speech therapy for children.',
  },
  // Optional features (Oct 2026), matched by FEATURES on the clinic's API
  // (kidz-lounge-api lib/features.js). mandates: Billing's month overview,
  // mandates and needs attention, and the EI child-absence reason.
  features: { mandates: true },
  theme: {
    primary: '#1D4ED8',
    primaryBright: '#2563EB',
    primaryStrong: '#1E40AF',
    primaryDeep: '#1E3A8A',
    primaryDeeper: '#172554',
    primaryFaint: '#93C5FD',
    highlight: '#F59E0B',
    highlightTint: '#FEF3C7',
    tint: '#EFF6FF',
    tint2: '#DBEAFE',
    tint3: '#EAF0FE',
    tint4: '#F0F3FB',
    tint5: '#E9EDF7',
    tint6: '#EAEEF6',
    tint7: '#F5F8FF',
    wash: '#FBFCFE',
    wash2: '#F9FAFD',
    wash3: '#F8FAFF',
    line: '#E9EDF7',
    border: '#E2E7F3',
    border2: '#E1E6F0',
    border3: '#CCD7EF',
    ink: '#1A2233',
    muted: '#626B80',
    muted2: '#5A5F6B',
    muted3: '#464C59',
    subtle: '#B5BAC4',
    subtle2: '#A2A8B5',
    subtle3: '#C3C9D6',
    gray: '#F0F1F4',
    gray2: '#F2F4F7',
    shadow: '#1D366B',
    pageBg: '#F4F7FB',
    pageBg2: '#F4F7FB',
    statusConfirmed: '#3B6FE0',
    statusMessage: '#D4A72C', // warm yellow, distinct from Canceled's steel blue and *HOLD*'s amber
    // Badges, chips and tags: slightly rounded rectangles, no pills.
    pillRadius: '6px',
    viewSwitch: '#1D4ED8',
  },
};
