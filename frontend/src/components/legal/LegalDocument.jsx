import React from "react";
import { Link } from "react-router-dom";
import { Cookie } from "lucide-react";
import ContentMarkdown from "../ContentMarkdown";
import { LegalDraftBanner } from "../../pages/legal/LegalLayout";
import { formatVersion, useContent, useContentState } from "../../lib/content";
import { LEGAL_PAGES } from "../../lib/contentRegistry";
import { isDesktopApp, openConsentSettings } from "../../lib/consent";

/** "Version <local time> · Minor update · Previous versions" */
export function VersionMeta({ item, page }) {
  return (
    <>
      Version {formatVersion(item.version)}
      {item.requiresReacceptance === false && " · Minor update"}
      {" · "}
      <Link to={`/legal/${page}/versions`}>Previous versions</Link>
    </>
  );
}

// The current published version of one policy (Phase 4b content), shared by
// the public /legal/:page shell (LegalPage) and the in-app Documentation →
// Policies pages (Phase 4d PolicyDoc). It owns the loading, the version line,
// the draft banner, the COOKIES "Cookie settings" button and the Markdown
// body; the caller owns the frame around them via a render prop:
//
//   <LegalDocument page="terms">
//     {({ title, meta, notice, actions, bodyKey, body }) => …}
//   </LegalDocument>
//
// Without children it renders the pieces in order. `found` is false for an
// unknown page; `body` is the loading/error text until the item arrives.
export default function LegalDocument({ page, children }) {
  const key = LEGAL_PAGES[page];
  const item = useContent(key);
  const { status } = useContentState();

  const actions =
    key === "COOKIES" && !isDesktopApp() ? (
      <button type="button" className="btn btn-ghost btn-sm" onClick={openConsentSettings}>
        <Cookie width={16} height={16} />
        <span className="hidden sm:inline">Cookie settings</span>
      </button>
    ) : null;

  const parts = item
    ? {
        found: true,
        loaded: true,
        title: item.title,
        meta: item.version ? <VersionMeta item={item} page={page} /> : null,
        notice: item.draftBanner ? <LegalDraftBanner /> : null,
        actions,
        bodyKey: `${key}@${item.version}`,
        body: <ContentMarkdown>{item.body}</ContentMarkdown>,
      }
    : {
        found: Boolean(key),
        loaded: false,
        title: null,
        meta: null,
        notice: null,
        actions,
        bodyKey: null,
        body: (
          <p>
            {status === "loading"
              ? "Loading…"
              : "This policy couldn't be loaded. Check your connection and reload the page."}
          </p>
        ),
      };

  if (typeof children === "function") return children(parts);

  return (
    <>
      {parts.title && <h1>{parts.title}</h1>}
      {parts.meta && <p className="legal-meta">{parts.meta}</p>}
      {parts.notice}
      {parts.body}
    </>
  );
}
