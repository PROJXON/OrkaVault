import React, { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Clock } from "lucide-react";
import api from "../../lib/api";
import LegalLayout, { LegalDraftBanner } from "./LegalLayout";
import ContentMarkdown from "../../components/ContentMarkdown";
import { formatVersion, useContent } from "../../lib/content";
import { LEGAL_PAGES } from "../../lib/contentRegistry";

// Public "Previous versions" of a policy (Phase 4b). Versions are immutable,
// so /legal/:page/versions/:version always shows exactly the text that was
// published (and accepted) at that time. Linked from Profile → My agreements.

function useApi(url) {
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, data: null, error: "" });
    api
      .get(url)
      .then(({ data }) => !cancelled && setState({ loading: false, data, error: "" }))
      .catch((err) =>
        !cancelled &&
        setState({
          loading: false,
          data: null,
          error: err.response?.status === 404 ? "This version doesn't exist." : "Couldn't load this page. Try again.",
        }),
      );
    return () => {
      cancelled = true;
    };
  }, [url]);
  return state;
}

export function LegalVersionList() {
  const { page } = useParams();
  const key = LEGAL_PAGES[page];
  const current = useContent(key);
  const { loading, data, error } = useApi(`/content/${key}/versions`);

  if (!key) return <Navigate to="/legal/terms" replace />;
  const title = current?.title || data?.[0]?.title || "Policy";

  return (
    <LegalLayout
      title={`${title}: previous versions`}
      meta={<Link to={`/legal/${page}`}>View current version</Link>}
      bodyKey={`${key}-versions`}
    >
      {loading ? (
        <p>Loading…</p>
      ) : error ? (
        <p>{error}</p>
      ) : (
        <ol className="flex flex-col gap-3 mt-6 !list-none !pl-0">
          {data.map((v, i) => (
            <li key={v.version} className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] p-3 !mt-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link to={`/legal/${page}/versions/${encodeURIComponent(v.version)}`} className="font-semibold">
                  {formatVersion(v.version)}
                </Link>
                <span className="text-xs text-[var(--text-tertiary)]">
                  {v.requiresReacceptance ? "Required acceptance" : "Minor update"}
                  {i === 0 && " · Current"}
                </span>
              </div>
              {v.changeNote && <p className="!mb-0 mt-1 text-sm">{v.changeNote}</p>}
            </li>
          ))}
        </ol>
      )}
    </LegalLayout>
  );
}

export function LegalVersionView() {
  const { page, version } = useParams();
  const key = LEGAL_PAGES[page];
  const { loading, data, error } = useApi(`/content/${key}/versions/${encodeURIComponent(version)}`);

  if (!key) return <Navigate to="/legal/terms" replace />;

  if (loading || error) {
    return (
      <LegalLayout bodyKey={`${key}@loading`}>
        <p>{loading ? "Loading…" : error}</p>
        <p>
          <Link to={`/legal/${page}/versions`}>All versions</Link>
        </p>
      </LegalLayout>
    );
  }

  return (
    <LegalLayout
      title={data.title}
      meta={
        <>
          Version {formatVersion(data.version)}
          {!data.requiresReacceptance && " · Minor update"}
          {" · "}
          <Link to={`/legal/${page}/versions`}>All versions</Link>
        </>
      }
      notice={
        <>
          <div role="note" className="legal-draft !text-[var(--info-text)] !bg-[var(--info-subtle)] !border-[var(--info-border)]">
            <Clock width={18} height={18} className="shrink-0 mt-0.5" />
            <div>
              You're viewing the version from {formatVersion(data.version)}.{" "}
              <Link to={`/legal/${page}`}>View current</Link>
            </div>
          </div>
          {data.draftBanner && <LegalDraftBanner />}
        </>
      }
      bodyKey={`${key}@${data.version}`}
    >
      <ContentMarkdown>{data.body}</ContentMarkdown>
    </LegalLayout>
  );
}
