// Loads a user manual from public/manuals/ (see public/manuals/README.md).
//
// Each manual (staff.md, reception.md, admin.md) is plain Markdown that can
// pull in shared pages and hold text for only some manuals:
//
//   <!-- include: shared/schedule.md -->     the whole file goes here
//   <!-- only: reception, admin -->          text only those manuals show
//   ...
//   <!-- end -->
//
// Image paths are written relative to the file they're in (so VS Code's
// Markdown preview shows them) and turned into site paths here.

export const MANUALS = [
  { key: 'staff', label: 'Staff' },
  { key: 'reception', label: 'Reception' },
  { key: 'admin', label: 'Admin' },
];

// Which manual someone sees first: their own role's.
export function manualForRole(role) {
  if (role === 'reception') return 'reception';
  if (role === 'admin' || role === 'developer') return 'admin';
  return 'staff';
}

const BASE = '/manuals/';
const cache = new Map();

async function fetchText(path) {
  if (!cache.has(path)) {
    cache.set(path, fetch(BASE + path, { cache: 'no-cache' }).then(r => {
      if (!r.ok) throw new Error(`Couldn't load ${path}`);
      return r.text();
    }).catch(err => { cache.delete(path); throw err; }));
  }
  return cache.get(path);
}

const dirOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '');

// "shared/../img/x.png" -> "img/x.png"
function normalise(path) {
  const out = [];
  for (const part of path.split('/')) {
    if (part === '..') out.pop();
    else if (part && part !== '.') out.push(part);
  }
  return out.join('/');
}

// Relative images -> /manuals/<path>, so they work wherever the page is.
function absoluteImages(text, fileDir) {
  return text.replace(/!\[([^\]]*)\]\((?!https?:|\/)([^)\s]+)\)/g, (_, alt, src) => `![${alt}](${BASE}${normalise(fileDir + src)})`);
}

// Keeps <!-- only: a, b --> blocks for `manual`, drops them for the others.
function applyOnlyBlocks(text, manual) {
  return text.replace(/<!--\s*only:\s*([^>]*?)\s*-->([\s\S]*?)<!--\s*end\s*-->/g, (_, who, body) => {
    const list = who.split(',').map(s => s.trim().toLowerCase());
    return list.includes(manual) ? body : '';
  });
}

async function expand(path, manual, depth = 0) {
  if (depth > 5) return '';
  const raw = await fetchText(path);
  const dir = dirOf(path);
  const withImages = absoluteImages(applyOnlyBlocks(raw, manual), dir);
  const parts = withImages.split(/(<!--\s*include:\s*[^>]+?\s*-->)/g);
  const out = await Promise.all(parts.map(async (part) => {
    const m = part.match(/<!--\s*include:\s*([^>]+?)\s*-->/);
    return m ? expand(normalise(dir + m[1]), manual, depth + 1) : part;
  }));
  return out.join('');
}

// The finished Markdown for one manual.
export function loadManual(manual) {
  return expand(`${manual}.md`, manual);
}

export const slugify = (text) => String(text).toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
