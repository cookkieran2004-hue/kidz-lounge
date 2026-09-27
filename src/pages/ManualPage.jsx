import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Marked } from 'marked';
import { useAuth } from '../AuthContext';
import { useIsMobile } from '../useIsMobile';
import { PageHeader, UnderlineTabs } from '../dashboardUi';
import { INK, MUTED, HAIRLINE, PAGE_BG, FONT, TONES, buttonStyle } from '../uiTokens';
import { MANUALS, manualForRole, loadManual, slugify } from '../manual';

// User manuals (footer > User manual). The text lives in public/manuals/ as
// Markdown -- edit it there (public/manuals/README.md explains how) -- and
// is loaded and rendered here. Everyone can read all three; each person
// starts on their own role's manual. Open to signed-out visitors too, like
// Help & Support, so "how to sign in" is reachable.

// Headings get ids so the contents list can jump to them.
const marked = new Marked({
  gfm: true,
  renderer: {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      return `<h${depth} id="${slugify(text)}">${text}</h${depth}>\n`;
    },
  },
});

export default function ManualPage() {
  const { user } = useAuth();
  const isMobile = useIsMobile(900);
  const [searchParams, setSearchParams] = useSearchParams();
  const picked = searchParams.get('manual');
  const manual = MANUALS.some(m => m.key === picked) ? picked : manualForRole(user?.role);
  const [doc, setDoc] = useState({ manual: null, markdown: '', error: null });

  useEffect(() => {
    let alive = true;
    loadManual(manual)
      .then(markdown => { if (alive) setDoc({ manual, markdown, error: null }); })
      .catch(err => { if (alive) setDoc({ manual, markdown: '', error: err.message }); });
    return () => { alive = false; };
  }, [manual]);

  const { html, contents } = useMemo(() => {
    if (!doc.markdown) return { html: '', contents: [] };
    const tokens = marked.lexer(doc.markdown);
    const contents = tokens.filter(t => t.type === 'heading' && t.depth === 2).map(t => ({ id: slugify(marked.parseInline(t.text)), text: t.text.replace(/[*_`]/g, '') }));
    return { html: marked.parser(tokens), contents };
  }, [doc.markdown]);

  const loading = doc.manual !== manual;
  const pick = (key) => setSearchParams(key === manualForRole(user?.role) ? {} : { manual: key }, { replace: true });
  const jump = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div style={{ background: PAGE_BG, fontFamily: FONT, minHeight: '100%' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? '18px 14px 40px' : '28px 28px 56px' }}>
        <div className="kl-no-print">
          <PageHeader
            title="User manual"
            isMobile={isMobile}
            actions={<button type="button" onClick={() => window.print()} style={buttonStyle('secondary')}>Print / Save as PDF</button>}
          />
          <UnderlineTabs label="Manual" active={manual} onPick={pick} tabs={MANUALS} style={{ marginBottom: 20 }} />
        </div>

        {doc.error && !loading && (
          <p role="alert" style={{ fontSize: 13.5, color: TONES.danger.fg, background: TONES.danger.bg, borderRadius: 6, padding: '10px 12px' }}>
            The manual couldn't be loaded. Check your connection and reload the page.
          </p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : '220px minmax(0, 1fr)', gap: isMobile ? 14 : 28, alignItems: 'start' }}>
          {!isMobile && (
            <nav aria-label="Contents" className="kl-no-print" style={{ position: 'sticky', top: 16 }}>
              <div style={{ fontSize: 12, color: MUTED, fontWeight: 500, margin: '0 0 8px 10px' }}>Contents</div>
              {contents.map(c => (
                <button
                  key={c.id} type="button" onClick={() => jump(c.id)}
                  style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderRadius: 4, padding: '6px 10px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, color: INK }}
                  className="kl-manual-toc"
                >
                  {c.text}
                </button>
              ))}
            </nav>
          )}
          <article
            className="kl-manual"
            style={{ background: 'white', border: `1px solid ${HAIRLINE}`, borderRadius: 8, padding: isMobile ? '18px 16px' : '28px 36px', minWidth: 0, opacity: loading ? 0.5 : 1 }}
            // The manuals are our own files in public/manuals, not user input.
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    </div>
  );
}
