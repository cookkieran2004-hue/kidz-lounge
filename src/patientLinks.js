// A patient's links (Oct 2026): any number, each with its own text, like
// a hyperlink in Word. Kept in the existing "Patients"."Google_Link" column
// as JSON -- [{"text":"Intake folder","url":"https://..."}] -- so every save
// path keeps working with no backend change. An older single address in
// that column still reads as one link, "Google link".

export function parseLinks(value) {
  const v = String(value || '').trim();
  if (!v) return [];
  if (v.startsWith('[')) {
    try {
      const arr = JSON.parse(v);
      if (Array.isArray(arr)) return arr.filter(l => l && l.url).map(l => ({ text: String(l.text || '').trim(), url: String(l.url).trim() }));
    } catch { /* not JSON: fall through to a single address */ }
  }
  return [{ text: 'Google link', url: v }];
}

// '' when there are none (clears the column).
export function serializeLinks(links) {
  const clean = (links || []).map(l => ({ text: String(l.text || '').trim(), url: normalizeUrl(l.url) })).filter(l => l.url);
  return clean.length ? JSON.stringify(clean) : '';
}

export function normalizeUrl(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  return /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u}`;
}

// What a link shows: its text, or the address when it has none.
export const linkLabel = (l) => l.text || l.url.replace(/^https?:\/\//i, '');

// Typed-text links, Word style: "[text to display](https://address)".
// src/Linkify.jsx shows these as the text; LinkTextarea inserts them.
export function markdownLink(text, url) {
  const href = normalizeUrl(url).replace(/\)/g, '%29').replace(/\s/g, '%20');
  const label = String(text || '').replace(/[[\]]/g, '').trim();
  return label ? `[${label}](${href})` : href;
}
export const MARKDOWN_LINK_RE = /\[([^\]\n]+)\]\(((?:https?:\/\/|www\.)[^\s)]+)\)/g;
