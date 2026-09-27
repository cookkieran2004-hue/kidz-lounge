// Therapy disciplines (ST, OT, PT, SI), parsed from a provider's free-text
// specialty -- "ST", "ST/OT" or "Speech-Language Pathologist" all work.
// Used by the schedule's provider filter chips and the waitlist.
export const DISCIPLINES = ['ST', 'OT', 'PT', 'SI'];
export const DISCIPLINE_NAMES = { ST: 'Speech therapy', OT: 'Occupational therapy', PT: 'Physical therapy', SI: 'Sensory integration' };
const DISCIPLINE_WORDS = { SPEECH: 'ST', OCCUPATIONAL: 'OT', PHYSICAL: 'PT', SENSORY: 'SI' };
export function disciplinesOf(provider) {
  const found = new Set();
  for (const word of String(provider.specialty || '').toUpperCase().split(/[^A-Z]+/)) {
    if (DISCIPLINES.includes(word)) found.add(word);
    else if (DISCIPLINE_WORDS[word]) found.add(DISCIPLINE_WORDS[word]);
  }
  return found;
}
