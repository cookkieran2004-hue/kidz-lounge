import { Marked } from 'marked';
import { loadManual, MANUALS } from './manual';

// Builds a user manual as a real PDF (selectable text, headings, lists,
// tables, tips and the screenshots) from the same Markdown the manual is
// written in (public/manuals). Cover page, a contents page with page
// numbers, each section on a new page, and "Page X of Y" in the footer.
// pdfmake is loaded only when a manual is opened, so it doesn't slow the
// rest of the app. Built once per manual per visit.

const lexer = new Marked({ gfm: true });
const PAGE_WIDTH = 612 - 2 * 54; // US Letter minus the side margins
const INK = '#18181B';
const MUTED = '#71717A';
const ACCENT = '#6D28D9';
const HAIRLINE = '#E4E4E7';

const decode = (s) => String(s ?? '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// Inline Markdown (bold, italic, links...) -> pdfmake text runs.
function inline(tokens = []) {
  const out = [];
  for (const t of tokens) {
    if (t.type === 'strong') out.push({ text: inline(t.tokens), bold: true });
    else if (t.type === 'em') out.push({ text: inline(t.tokens), italics: true });
    else if (t.type === 'codespan') out.push({ text: decode(t.text), background: '#F4F4F5' });
    else if (t.type === 'link') out.push({ text: inline(t.tokens), link: t.href, color: ACCENT, decoration: 'underline' });
    else if (t.type === 'br') out.push('\n');
    else if (t.type === 'image' || t.type === 'html') continue;
    else if (t.tokens?.length) out.push(...inline(t.tokens));
    else out.push(decode(t.text ?? t.raw ?? ''));
  }
  return out;
}

async function toDataUrl(src, cache) {
  if (!cache.has(src)) {
    cache.set(src, fetch(src).then(r => (r.ok ? r.blob() : null)).then(blob => blob && new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    })).catch(() => null));
  }
  return cache.get(src);
}

async function imageBlock(token, cache) {
  const data = await toDataUrl(token.href, cache);
  if (!data) return { text: `[Picture: ${token.text}]`, color: MUTED, italics: true, margin: [0, 4, 0, 8] };
  return {
    stack: [
      { image: data, width: PAGE_WIDTH, margin: [0, 6, 0, 2] },
      token.text ? { text: token.text, style: 'caption' } : null,
    ].filter(Boolean),
    unbreakable: true,
  };
}

// Block Markdown -> pdfmake content.
async function blocks(tokens, cache, first = { h2: true }) {
  const out = [];
  for (const t of tokens) {
    if (t.type === 'heading') {
      if (t.depth === 1) continue; // the manual's title is on the cover
      const text = inline(t.tokens);
      if (t.depth === 2) {
        out.push({ text, style: 'h2', tocItem: true, pageBreak: first.h2 ? undefined : 'before' });
        first.h2 = false;
      } else {
        out.push({ text, style: 'h3' });
      }
    } else if (t.type === 'paragraph') {
      const images = t.tokens.filter(x => x.type === 'image');
      const words = inline(t.tokens);
      if (words.some(w => (typeof w === 'string' ? w.trim() : true))) out.push({ text: words, style: 'p' });
      for (const img of images) out.push(await imageBlock(img, cache));
    } else if (t.type === 'list') {
      const items = [];
      for (const item of t.items) {
        const parts = [];
        for (const sub of item.tokens) {
          if (sub.type === 'list') parts.push(...(await blocks([sub], cache, first)));
          else if (sub.type === 'text' || sub.type === 'paragraph') parts.push({ text: inline(sub.tokens || [sub]) });
          else parts.push(...(await blocks([sub], cache, first)));
        }
        items.push(parts.length === 1 ? parts[0] : { stack: parts });
      }
      out.push(t.ordered ? { ol: items, style: 'list' } : { ul: items, style: 'list' });
    } else if (t.type === 'blockquote') {
      const inner = await blocks(t.tokens, cache, first);
      out.push({
        table: { widths: ['*'], body: [[{ stack: inner, fillColor: '#F5F3FF', margin: [8, 6, 8, 2] }]] },
        layout: 'noBorders', margin: [0, 2, 0, 10],
      });
    } else if (t.type === 'table') {
      const header = t.header.map(c => ({ text: inline(c.tokens), bold: true, color: MUTED }));
      const rows = t.rows.map(r => r.map(c => ({ text: inline(c.tokens) })));
      out.push({
        table: { headerRows: 1, widths: t.header.map((_, i) => (i === 0 ? 'auto' : '*')), body: [header, ...rows] },
        layout: { hLineColor: () => HAIRLINE, vLineWidth: () => 0, hLineWidth: (i) => (i === 0 ? 0 : 0.6), paddingTop: () => 4, paddingBottom: () => 4 },
        fontSize: 9.5, margin: [0, 2, 0, 10],
      });
    } else if (t.type === 'code') {
      out.push({ text: t.text, fontSize: 9, background: '#F4F4F5', margin: [0, 2, 0, 8] });
    }
    // 'space', 'hr' and 'html' (the include/only markers) add nothing.
  }
  return out;
}

let pdfMakePromise = null;
function loadPdfMake() {
  if (!pdfMakePromise) {
    pdfMakePromise = Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')]).then(([pm, fonts]) => {
      const pdfMake = pm.default || pm;
      pdfMake.addVirtualFileSystem(fonts.default || fonts);
      return pdfMake;
    });
  }
  return pdfMakePromise;
}

const built = new Map();

// The finished PDF for one manual, as a Blob. Cached for the visit.
export function buildManualPdf(manual) {
  if (!built.has(manual)) {
    built.set(manual, (async () => {
      const [pdfMake, markdown] = await Promise.all([loadPdfMake(), loadManual(manual)]);
      const tokens = lexer.lexer(markdown);
      const title = tokens.find(t => t.type === 'heading' && t.depth === 1)?.text || `${MANUALS.find(m => m.key === manual)?.label} manual`;
      const intro = [];
      for (const t of tokens) { if (t.type === 'heading' && t.depth === 2) break; if (t.type === 'paragraph') intro.push({ text: inline(t.tokens), style: 'introText' }); }
      const firstSection = tokens.findIndex(x => x.type === 'heading' && x.depth === 2);
      // Fetch every screenshot at once (one at a time took ~30s).
      const cache = new Map();
      const srcs = [...markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map(m => m[1]);
      await Promise.all([...new Set(srcs)].map(src => toDataUrl(src, cache)));
      const body = await blocks(firstSection >= 0 ? tokens.slice(firstSection) : tokens, cache);
      const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

      const doc = {
        pageSize: 'LETTER',
        pageMargins: [54, 60, 54, 54],
        info: { title: `The Kidz Lounge – ${title}`, author: 'The Kidz Lounge' },
        defaultStyle: { font: 'Roboto', fontSize: 10.5, lineHeight: 1.3, color: INK },
        styles: {
          coverTitle: { fontSize: 30, bold: true, margin: [0, 210, 0, 6] },
          coverSub: { fontSize: 13, color: MUTED },
          introText: { fontSize: 11.5, color: '#3F3F46', margin: [0, 26, 0, 0] },
          tocTitle: { fontSize: 18, bold: true, margin: [0, 0, 0, 14] },
          h2: { fontSize: 18, bold: true, margin: [0, 0, 0, 10] },
          h3: { fontSize: 13, bold: true, margin: [0, 12, 0, 5] },
          p: { margin: [0, 0, 0, 7] },
          list: { margin: [0, 0, 0, 8] },
          caption: { fontSize: 8.5, color: MUTED, alignment: 'center', margin: [0, 0, 0, 10] },
        },
        header: (page) => (page <= 2 ? null : { text: `The Kidz Lounge · ${title}`, fontSize: 8.5, color: MUTED, margin: [54, 28, 54, 0] }),
        footer: (page, pages) => (page === 1 ? null : { text: `Page ${page} of ${pages}`, fontSize: 8.5, color: MUTED, alignment: 'right', margin: [54, 18, 54, 0] }),
        content: [
          { text: 'The Kidz Lounge', fontSize: 12, color: ACCENT, bold: true, margin: [0, 160, 0, 0] },
          { text: title, style: 'coverTitle', margin: [0, 8, 0, 6] },
          { text: `How to use the app · ${today}`, style: 'coverSub' },
          ...intro,
          { text: 'Contents', style: 'tocTitle', pageBreak: 'before' },
          { toc: { numberStyle: { color: MUTED } } },
          { text: '', pageBreak: 'after' },
          ...body,
        ],
      };
      return pdfMake.createPdf(doc).getBlob();
    })().catch((err) => { built.delete(manual); throw err; }));
  }
  return built.get(manual);
}
