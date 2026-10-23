import React from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Cookie } from "lucide-react";
import LegalLayout, { LegalDraftBanner } from "./LegalLayout";
import ContentMarkdown from "../../components/ContentMarkdown";
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

// /legal/terms, /legal/privacy, /legal/cookies, /legal/notice (Phase 4b):
// the current published version of a policy, edited in Settings → Content.
export default function LegalPage() {
  const { page } = useParams();
  const key = LEGAL_PAGES[page];
  const item = useContent(key);
  const { status } = useContentState();

  if (!key) return <Navigate to="/legal/terms" replace />;

  const cookieSettings =
    key === "COOKIES" && !isDesktopApp() ? (
      <button type="button" className="btn btn-ghost btn-sm" onClick={openConsentSettings}>
        <Cookie width={16} height={16} />
        <span className="hidden sm:inline">Cookie settings</span>
      </button>
    ) : null;

  if (!item) {
    return (
      <LegalLayout headerActions={cookieSettings}>
        <p>{status === "loading" ? "Loading…" : "This policy couldn't be loaded. Check your connection and reload the page."}</p>
      </LegalLayout>
    );
  }

  return (
    <LegalLayout
      title={item.title}
      meta={item.version ? <VersionMeta item={item} page={page} /> : null}
      notice={item.draftBanner ? <LegalDraftBanner /> : null}
      headerActions={cookieSettings}
      bodyKey={`${key}@${item.version}`}
    >
      <ContentMarkdown>{item.body}</ContentMarkdown>
    </LegalLayout>
  );
}
