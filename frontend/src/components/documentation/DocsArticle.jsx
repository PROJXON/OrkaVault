import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

// In-app frame for a Documentation page (Phase 4d): a sticky "On this page"
// list built from the rendered <h2 id> headings (ContentMarkdown gives them
// ids via rehype-slug or an explicit {#id}), plus #fragment scrolling, which
// React Router doesn't do itself. `bodyKey` changes whenever the Markdown
// does, so the headings are re-read once it has rendered.
//
// The public /legal/* shell (LegalLayout) has its own copy of this logic
// inside a full-page layout; this one sits inside DashboardLayout.
export default function DocsArticle({ bodyKey, header, children, aside }) {
  const location = useLocation();
  const articleRef = useRef(null);
  const [toc, setToc] = useState([]);

  useEffect(() => {
    const headings = articleRef.current?.querySelectorAll(".legal-body h2[id]") ?? [];
    setToc(Array.from(headings, (h) => ({ id: h.id, title: h.textContent })));
  }, [bodyKey]);

  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id && bodyKey) document.getElementById(id)?.scrollIntoView();
  }, [location.hash, bodyKey]);

  return (
    <div className="max-w-6xl mx-auto">
      {header}
      <div className={toc.length ? "lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-8" : ""}>
        {toc.length > 0 && (
          <nav aria-label="On this page" className="mb-6 lg:mb-0">
            <div className="lg:sticky lg:top-0">
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
                {aside}
              </ol>
            </div>
          </nav>
        )}
        <article ref={articleRef} className="card legal-prose min-w-0 max-w-none p-6 sm:p-8">
          {children}
        </article>
      </div>
    </div>
  );
}
