import React, { useEffect } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ChevronRight, ExternalLink } from "lucide-react";
import LegalDocument from "../../components/legal/LegalDocument";
import DocsArticle from "../../components/documentation/DocsArticle";

// /docs/policies/:page (Phase 4d): the same published policy as the public
// /legal/:page, inside the app layout. No copy of the text: LegalDocument
// loads it from the content API. Links inside the Markdown point at
// /legal/... and open the public page, which is intended.
export default function PolicyDoc() {
  const { page } = useParams();

  return (
    <LegalDocument page={page}>
      {({ found, title, meta, notice, actions, bodyKey, body }) =>
        !found ? <Navigate to="/docs/policies" replace /> : (
          <PolicyFrame page={page} title={title} meta={meta} notice={notice} actions={actions} bodyKey={bodyKey}>
            {body}
          </PolicyFrame>
        )
      }
    </LegalDocument>
  );
}

function PolicyFrame({ page, title, meta, notice, actions, bodyKey, children }) {
  useEffect(() => {
    if (!title) return undefined;
    document.title = `${title} · OrkaVault`;
    return () => {
      document.title = "OrkaVault";
    };
  }, [title]);

  const header = (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-[var(--text-tertiary)] min-w-0">
        <Link to="/docs" className="hover:text-[var(--brand-text)]">Documentation</Link>
        <ChevronRight width={14} height={14} className="shrink-0" />
        <Link to="/docs/policies" className="hover:text-[var(--brand-text)]">Policies</Link>
        {title && (
          <>
            <ChevronRight width={14} height={14} className="shrink-0" />
            <span className="text-[var(--text-secondary)] truncate">{title}</span>
          </>
        )}
      </nav>
      <div className="ml-auto flex items-center gap-1">
        {actions}
        <Link to={`/legal/${page}`} className="btn btn-ghost btn-sm" title="Open the public, printable page">
          <ExternalLink width={16} height={16} />
          <span className="hidden sm:inline">Public page</span>
        </Link>
      </div>
    </div>
  );

  return (
    <DocsArticle bodyKey={bodyKey} header={header}>
      {title && <h1>{title}</h1>}
      {meta && <p className="legal-meta">{meta}</p>}
      {notice}
      {children}
    </DocsArticle>
  );
}
