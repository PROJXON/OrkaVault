import React, { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Moon, Printer, Sun, TriangleAlert } from "lucide-react";
import { useAuth } from "../../lib/authContext";
import { useTheme } from "../../lib/themeContext";
import LegalLinks from "../../components/LegalLinks";

/** An open placeholder in draft legal text, e.g. <Tbd>hosting region</Tbd>. */
export const Tbd = ({ children }) => <span className="legal-tbd">[TBD: {children}]</span>;

// Shared shell for /legal/* (NEW-FEAT §1.1). Public: rendered outside
// ProtectedRoute, so it must work with or without a signed-in user.
//
// `sections` is [{ id, title, content }]. The table of contents is built
// from it, and each id is a stable anchor other pages link to
// (e.g. /legal/privacy#personal-vault from the vault setup wizard).
export default function LegalLayout({ title, summary, doc, sections }) {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    document.title = `${title} · OrkaVault`;
    return () => {
      document.title = "OrkaVault";
    };
  }, [title]);

  // React Router doesn't scroll to #fragments itself.
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [location.pathname, location.hash]);

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

      <main className="consent-safe max-w-5xl mx-auto px-4 pt-8 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
        <nav aria-label="On this page" className="no-print mb-8 lg:mb-0">
          <div className="lg:sticky lg:top-20">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">On this page</p>
            <ol className="flex flex-col gap-1 text-sm">
              {sections.map((s) => (
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

        <article className="legal-prose min-w-0">
          <h1>{title}</h1>
          <p className="legal-meta">
            Version {doc.version} · Effective {doc.effectiveDate}
          </p>

          {doc.draft && (
            <div role="note" className="legal-draft">
              <TriangleAlert width={18} height={18} className="shrink-0 mt-0.5" />
              <div>
                <strong>DRAFT, pending legal review.</strong> This text has not yet been approved by PROJXON
                leadership or counsel and may change. Items marked [TBD] are still open.
              </div>
            </div>
          )}

          {summary && <p className="legal-summary">{summary}</p>}

          {sections.map((s) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`}>
              <h2 id={`${s.id}-h`}>{s.title}</h2>
              {s.content}
            </section>
          ))}

          <footer className="no-print mt-12 pt-6 border-t border-[var(--border-subtle)]">
            <LegalLinks />
          </footer>
        </article>
      </main>
    </div>
  );
}
