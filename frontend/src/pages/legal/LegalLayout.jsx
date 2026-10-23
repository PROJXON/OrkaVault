import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Moon, Printer, Sun, TriangleAlert } from "lucide-react";
import { useAuth } from "../../lib/authContext";
import { useTheme } from "../../lib/themeContext";
import { useContent } from "../../lib/content";
import LegalLinks from "../../components/LegalLinks";
import ContentMarkdown from "../../components/ContentMarkdown";

/** The "DRAFT, pending legal review" box. Its text is the LEGAL_DRAFT_BANNER content item. */
export function LegalDraftBanner() {
  const banner = useContent("LEGAL_DRAFT_BANNER");
  if (!banner) return null;
  return (
    <div role="note" className="legal-draft">
      <TriangleAlert width={18} height={18} className="shrink-0 mt-0.5" />
      <ContentMarkdown variant="inline">{banner.body}</ContentMarkdown>
    </div>
  );
}

// Shared shell for /legal/* (NEW-FEAT §1.1, Phase 4b). Public: rendered
// outside ProtectedRoute, so it must work with or without a signed-in user.
//
// The body is admin-authored Markdown (ContentMarkdown). The table of
// contents is built from the rendered <h2 id> headings; `bodyKey` (the
// version shown) re-reads them when the text changes. Heading ids are
// stable anchors other pages link to (e.g. /legal/privacy#personal-vault).
export default function LegalLayout({ title, meta, notice, headerActions, bodyKey, children }) {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const articleRef = useRef(null);
  const [toc, setToc] = useState([]);

  useEffect(() => {
    if (!title) return undefined;
    document.title = `${title} · OrkaVault`;
    return () => {
      document.title = "OrkaVault";
    };
  }, [title]);

  useEffect(() => {
    const headings = articleRef.current?.querySelectorAll(".legal-body h2[id]") ?? [];
    setToc(Array.from(headings, (h) => ({ id: h.id, title: h.textContent })));
  }, [bodyKey]);

  // React Router doesn't scroll to #fragments itself. Re-run once the body
  // has rendered, since the text arrives after the first paint.
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [location.pathname, location.hash, bodyKey]);

  // React Router keeps a history index in history.state; idx 0 means this
  // page was opened directly (new tab, typed URL), so there's no "back".
  const goBack = () => {
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate(user ? "/vault" : "/login");
  };

  return (
    <div className="legal-page min-h-full bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <header className="no-print sticky top-0 z-10 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={goBack}>
            <ArrowLeft width={16} height={16} />
            Back
          </button>
          <span className="ml-1 font-semibold text-[var(--text-secondary)] truncate">OrkaVault · Policies</span>
          <div className="ml-auto flex items-center gap-1">
            {headerActions}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.print()} title="Print">
              <Printer width={16} height={16} />
              <span className="hidden sm:inline">Print</span>
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            >
              {theme === "dark" ? <Sun width={16} height={16} /> : <Moon width={16} height={16} />}
            </button>
          </div>
        </div>
      </header>

      <main
        className={`consent-safe max-w-5xl mx-auto px-4 pt-8 ${toc.length ? "lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10" : ""}`}
      >
        {toc.length > 0 && (
          <nav aria-label="On this page" className="no-print mb-8 lg:mb-0">
            <div className="lg:sticky lg:top-20">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">On this page</p>
              <ol className="flex flex-col gap-1 text-sm">
                {toc.map((s) => (
                  <li key={s.id}>
                    <Link
                      to={{ hash: s.id }}
                      replace
                      className="block py-0.5 text-[var(--text-secondary)] hover:text-[var(--brand-text)]"
                    >
                      {s.title}
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          </nav>
        )}

        <article ref={articleRef} className="legal-prose min-w-0">
          {title && <h1>{title}</h1>}
          {meta && <p className="legal-meta">{meta}</p>}
          {notice}
          {children}

          <footer className="no-print mt-12 pt-6 border-t border-[var(--border-subtle)]">
            <LegalLinks />
          </footer>
        </article>
      </main>
    </div>
  );
}
