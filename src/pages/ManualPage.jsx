import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { useIsMobile } from '../useIsMobile';
import { PageHeader, UnderlineTabs } from '../dashboardUi';
import { PAGE_BG, FONT, TONES, buttonStyle } from '../uiTokens';
import { MANUALS, manualForRole } from '../manual';
import { buildManualPdf } from '../manualPdf';
import PdfViewer from '../PdfViewer';

// User manuals (footer > User manual). Each manual is built into a PDF from
// its Markdown in public/manuals (src/manualPdf.js; edit the text there --
// public/manuals/README.md explains how) and shown in a PDF viewer that
// scrolls through every page. Download saves the PDF; Print opens it in the
// browser's own PDF viewer to print. Everyone can read all three; each
// person starts on their own role's manual. Open to signed-out visitors
// too, like Help & Support.

export default function ManualPage() {
  const { user } = useAuth();
  const isMobile = useIsMobile(900);
  const [searchParams, setSearchParams] = useSearchParams();
  const picked = searchParams.get('manual');
  const manual = MANUALS.some(m => m.key === picked) ? picked : manualForRole(user?.role);
  const [pdf, setPdf] = useState({ manual: null, blob: null, error: null });
  const viewerRef = useRef(null);
  const [viewerHeight, setViewerHeight] = useState(600);

  useEffect(() => {
    let alive = true;
    buildManualPdf(manual)
      .then(blob => { if (alive) setPdf({ manual, blob, error: null }); })
      .catch(err => { if (alive) setPdf({ manual, blob: null, error: err.message || 'The manual could not be built.' }); });
    return () => { alive = false; };
  }, [manual]);

  // The viewer fills the window below the header; the manual scrolls
  // inside it.
  // Re-measured after every render too: the header above it settles after
  // the first paint (fonts, tabs), which left the viewer a little too tall.
  const fit = useCallback(() => {
    const el = viewerRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const h = Math.max(320, Math.floor(window.innerHeight - top - (isMobile ? 12 : 20)));
    setViewerHeight(prev => (Math.abs(prev - h) > 1 ? h : prev));
  }, [isMobile]);
  useLayoutEffect(() => { fit(); });
  useEffect(() => {
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [fit]);

  const ready = pdf.manual === manual && pdf.blob;
  const label = MANUALS.find(m => m.key === manual)?.label || '';
  const fileName = `The Kidz Lounge - ${label} manual.pdf`;
  const pick = (key) => setSearchParams(key === manualForRole(user?.role) ? {} : { manual: key }, { replace: true });

  const download = () => {
    const url = URL.createObjectURL(pdf.blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  // The browser's own PDF viewer has Print (and works on phones too).
  const openForPrint = () => {
    const url = URL.createObjectURL(pdf.blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  return (
    <div style={{ background: PAGE_BG, fontFamily: FONT, minHeight: '100%' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '14px 12px 0' : '24px 28px 0' }}>
        <PageHeader
          title="User manual"
          isMobile={isMobile}
          actions={(
            <>
              <button type="button" onClick={openForPrint} disabled={!ready} style={buttonStyle('secondary', { opacity: ready ? 1 : 0.6 })}>Print</button>
              <button type="button" onClick={download} disabled={!ready} style={buttonStyle('primary', { opacity: ready ? 1 : 0.6 })}>Download PDF</button>
            </>
          )}
        />
        <UnderlineTabs label="Manual" active={manual} onPick={pick} tabs={MANUALS} style={{ marginBottom: 14 }} />
        {pdf.error && pdf.manual === manual && (
          <p role="alert" style={{ fontSize: 13.5, color: TONES.danger.fg, background: TONES.danger.bg, borderRadius: 6, padding: '10px 12px' }}>
            The manual couldn't be loaded. Check your connection and reload the page.
          </p>
        )}
        <div ref={viewerRef}>
          <PdfViewer key={manual} data={ready ? pdf.blob : null} height={viewerHeight} />
        </div>
      </div>
    </div>
  );
}
