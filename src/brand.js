// The clinic's name and contact details, written once (white-label
// groundwork, Oct 2026). New code reads them from here instead of typing
// "Kidz Lounge"; the older mentions move here when the generic version is
// built.
export const CLINIC = {
  name: 'The Kidz Lounge', // titles, PDFs, the logo's alt text
  shortName: 'Kidz Lounge', // in sentences: "Kidz Lounge has received your form"
  logo: '/logo.png',
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
};
