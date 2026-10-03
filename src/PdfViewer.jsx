import { useState, useEffect, useRef } from 'react';
import { MUTED } from './uiTokens';

// Shows a PDF as one continuous, scrollable column of pages (pdf.js), the
// same on every device -- iPhones won't scroll a PDF embedded the normal
// way. Pages are drawn when they come near the screen and dropped again
// when they're far away, so a long manual doesn't use up a phone's memory.
// `data`: the PDF as a Blob. `height`: the viewer's height (it scrolls
// inside itself).

let pdfjsPromise = null;
function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

const PAGE_GAP = 14;

export default function PdfViewer({ data, height }) {
  const scrollRef = useRef(null);
  const [doc, setDoc] = useState(null);
  const [pages, setPages] = useState([]); // [{ width, height }] at scale 1
  const [width, setWidth] = useState(0);
  const [current, setCurrent] = useState(1);
  const [error, setError] = useState(null);

  // Open the document.
  useEffect(() => {
    if (!data) return undefined;
    let alive = true;
    let loaded = null;
    (async () => {
      try {
        const pdfjs = await loadPdfJs();
        const bytes = new Uint8Array(await data.arrayBuffer());
        loaded = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
        // The manuals are all one page size: measure the first page only
        // (asking for every page first held the viewer up for ~30s).
        const vp = (await loaded.getPage(1)).getViewport({ scale: 1 });
        const sizes = Array.from({ length: loaded.numPages }, () => ({ width: vp.width, height: vp.height }));
        if (alive) { setDoc(loaded); setPages(sizes); setError(null); }
      } catch (err) {
        if (alive) setError(err.message || 'The PDF could not be shown.');
      }
    })();
    return () => { alive = false; loaded?.destroy(); };
  }, [data]);

  // Page width follows the viewer's width.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pageWidth = Math.max(200, Math.min(width - 2 * PAGE_GAP, 900));

  // Draw pages near the screen, drop far ones, and track the current page.
  useEffect(() => {
    const root = scrollRef.current;
    if (!doc || !root || !pages.length) return undefined;
    const canvases = [...root.querySelectorAll('canvas[data-page]')];
    const drawn = new Map(); // page number -> render task or 'done'
    const draw = async (canvas) => {
      const n = Number(canvas.dataset.page);
      if (drawn.has(n)) return;
      drawn.set(n, 'pending');
      try {
        const page = await doc.getPage(n);
        const ratio = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: (pageWidth / pages[n - 1].width) * ratio });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const task = page.render({ canvasContext: canvas.getContext('2d'), viewport });
        drawn.set(n, task);
        await task.promise;
        drawn.set(n, 'done');
      } catch { drawn.delete(n); }
    };
    const drop = (canvas) => {
      const n = Number(canvas.dataset.page);
      const state = drawn.get(n);
      if (state && state !== 'done' && state !== 'pending') state.cancel();
      drawn.delete(n);
      canvas.width = 0; canvas.height = 0;
    };
    const near = new IntersectionObserver((entries) => {
      entries.forEach(e => (e.isIntersecting ? draw(e.target) : drop(e.target)));
    }, { root, rootMargin: '1500px 0px' });
    const visible = new Map();
    const seen = new IntersectionObserver((entries) => {
      entries.forEach(e => visible.set(Number(e.target.dataset.page), e.intersectionRatio));
      let best = 1, bestRatio = -1;
      visible.forEach((r, n) => { if (r > bestRatio) { best = n; bestRatio = r; } });
      setCurrent(best);
    }, { root, threshold: [0, 0.25, 0.5, 0.75, 1] });
    canvases.forEach(c => { near.observe(c); seen.observe(c); });
    return () => { near.disconnect(); seen.disconnect(); drawn.forEach(s => { if (s && s !== 'done' && s !== 'pending') s.cancel(); }); };
  }, [doc, pages, pageWidth]);

  return (
    <div style={{ position: 'relative', border: '1px solid #E4E4E7', borderRadius: 8, overflow: 'hidden', background: '#E4E4E7' }}>
      <div ref={scrollRef} style={{ height, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch' }}>
        {error && <p style={{ padding: 20, fontSize: 13.5, color: '#B42318' }}>{error}</p>}
        {!error && !pages.length && <p style={{ padding: 20, fontSize: 13.5, color: MUTED }}>Preparing the manual...</p>}
        {pages.map((p, i) => (
          <canvas
            key={`${i}-${pageWidth}`}
            data-page={i + 1}
            aria-label={`Page ${i + 1}`}
            style={{
              display: 'block', margin: `${PAGE_GAP}px auto`, background: 'white',
              width: pageWidth, height: Math.round(pageWidth * (p.height / p.width)),
              boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
            }}
          />
        ))}
      </div>
      {pages.length > 0 && (
        <div style={{ position: 'absolute', left: 12, bottom: 12, background: 'rgba(24,24,27,0.75)', color: 'white', fontSize: 12, padding: '3px 9px', borderRadius: 4, pointerEvents: 'none' }}>
          Page {current} of {pages.length}
        </div>
      )}
    </div>
  );
}
