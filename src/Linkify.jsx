// Shows text with any web address in it as a clickable link that opens in
// a new tab: "https://…", "http://…" or "www.…", anywhere in the text.
// Used wherever the app displays something people typed (comments, notes,
// chat, task details, agendas, tickets). Everything else is plain text --
// nothing is ever rendered as HTML.
//
// Punctuation that usually ends a sentence (".", ",", ")" ...) is left off
// the end of a link, so "see https://x.com/doc." links to https://x.com/doc.
// Clicks don't reach the card or row around the link (e.g. a task row that
// opens on click).

const URL_RE = /\b(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+\.[^\s<>"']+)/gi;
const TRAILING_CHAR = /[.,;:!?)\]}'"]/;

// `color` overrides the link colour, e.g. white on a purple chat bubble.
export default function Linkify({ text, color }) {
  if (text === null || text === undefined || text === '') return null;
  const str = String(text);
  const parts = [];
  let last = 0;
  for (const m of str.matchAll(URL_RE)) {
    let url = m[0];
    // Peel sentence punctuation off the end, but keep a ")" that closes a
    // "(" inside the address, e.g. a Wikipedia "(disambiguation)" link.
    while (TRAILING_CHAR.test(url.slice(-1))) {
      const ch = url.slice(-1);
      if (ch === ')' && (url.match(/\(/g) || []).length >= (url.match(/\)/g) || []).length) break;
      url = url.slice(0, -1);
    }
    const start = m.index;
    if (start > last) parts.push(str.slice(last, start));
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    parts.push(
      <a
        key={start} href={href} target="_blank" rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        style={{ color: color || '#6D28D9', textDecoration: 'underline', overflowWrap: 'anywhere' }}
      >
        {url}
      </a>
    );
    last = start + url.length;
  }
  if (last < str.length) parts.push(str.slice(last));
  return <>{parts}</>;
}
