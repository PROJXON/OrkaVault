import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Check, ChevronRight, Copy, KeyRound, Lock, Search } from "lucide-react";
import api, { API_BASE_URL } from "../../lib/api";
import { useAuth } from "../../lib/authContext";
import ContentMarkdown from "../../components/ContentMarkdown";
import DocsArticle from "../../components/documentation/DocsArticle";

// /docs/api (Phase 4d). ADMIN only. The role check below is UX; the real
// gate is GET /api/docs/rest-api, which is also where the text lives,
// so none of it is in the public JS bundle. The audit action catalog is
// served from backend config/auditActions.ts, so it always matches the code.

const ENDPOINT = `${API_BASE_URL}/external/v1/audit`;
const CATALOG_ID = "audit-action-catalog";

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button type="button" onClick={copy} className="btn btn-secondary btn-sm shrink-0">
      {copied ? <Check width={14} height={14} /> : <Copy width={14} height={14} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function ActionCatalog({ groups }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");

  const rows = useMemo(
    () => groups.flatMap((g) => g.actions.map((a) => ({ ...a, category: g.category }))),
    [groups],
  );
  const q = query.trim().toLowerCase();
  const shown = rows.filter(
    (r) =>
      (!category || r.category === category) &&
      (!q ||
        r.action.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        Object.keys(r.metadata).some((k) => k.toLowerCase().includes(q))),
  );

  return (
    <section aria-labelledby={CATALOG_ID}>
      <h2 id={CATALOG_ID}>Audit action catalog</h2>
      <p>
        Every value of <code>action</code>, generated from the server's code. Metadata lists field names and what
        they hold; no field ever contains a secret.
      </p>
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <label className="relative flex-1">
          <span className="sr-only">Search actions</span>
          <Search width={16} height={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            type="search"
            className="input pl-9"
            placeholder="Search actions, descriptions or fields"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="sm:w-56">
          <span className="sr-only">Category</span>
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {groups.map((g) => (
              <option key={g.category} value={g.category}>
                {g.category}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="legal-meta" aria-live="polite">
        {shown.length} of {rows.length} actions
      </p>
      <div className="legal-table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Action</th>
              <th scope="col">Category</th>
              <th scope="col">Description</th>
              <th scope="col">Metadata fields</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.action}>
                <td>
                  <code>{r.action}</code>
                </td>
                <td className="whitespace-nowrap">{r.category}</td>
                <td>{r.description}</td>
                <td>
                  {Object.keys(r.metadata).length === 0 ? (
                    <span className="text-[var(--text-tertiary)]">—</span>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {Object.entries(r.metadata).map(([k, v]) => (
                        <div key={k}>
                          <code>{k}</code>
                          {v && <span className="text-[var(--text-tertiary)]">: {v}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-[var(--text-tertiary)]">
                  No actions match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function RestApiDocs() {
  const { user } = useAuth();
  // UX only (also covers an admin previewing another role); the server
  // answers 403 to anyone who isn't really an ADMIN.
  const isAdmin = user?.role === "ADMIN";
  const [state, setState] = useState({ status: isAdmin ? "loading" : "forbidden" });

  useEffect(() => {
    if (!isAdmin) {
      setState({ status: "forbidden" });
      return undefined;
    }
    setState({ status: "loading" });
    let cancelled = false;
    api
      .get("/docs/rest-api")
      .then(({ data }) => !cancelled && setState({ status: "ready", data }))
      .catch((e) => {
        if (cancelled) return;
        setState({
          status: e.response?.status === 403 ? "forbidden" : "error",
          error: e.response?.data?.error,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  useEffect(() => {
    document.title = "REST API · OrkaVault";
    return () => {
      document.title = "OrkaVault";
    };
  }, []);

  const markdown = useMemo(
    () => (state.data ? state.data.markdown.replaceAll("{{AUDIT_BASE_URL}}", ENDPOINT) : ""),
    [state.data],
  );

  const breadcrumb = (
    <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 text-sm text-[var(--text-tertiary)]">
      <Link to="/docs" className="hover:text-[var(--brand-text)]">Documentation</Link>
      <ChevronRight width={14} height={14} className="shrink-0" />
      <span className="text-[var(--text-secondary)]">REST API</span>
    </nav>
  );

  if (state.status !== "ready") {
    return (
      <div className="max-w-3xl mx-auto">
        {breadcrumb}
        <div className="card p-8 text-center">
          {state.status === "loading" && <p className="text-[var(--text-secondary)]">Loading…</p>}
          {state.status === "forbidden" && (
            <>
              <Lock width={28} height={28} className="mx-auto mb-3 text-[var(--text-tertiary)]" />
              <h1 className="text-xl font-bold text-[var(--text-primary)]">Admins only</h1>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                The REST API documentation is available to OrkaVault administrators.
              </p>
            </>
          )}
          {state.status === "error" && (
            <p className="text-[var(--text-secondary)]">
              {state.error || "The documentation couldn't be loaded. Check your connection and reload the page."}
            </p>
          )}
        </div>
      </div>
    );
  }

  const { data } = state;

  const header = (
    <>
      {breadcrumb}
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">REST API</h1>
          <span className="badge-pill">{data.apiVersion}</span>
          <span className="badge-pill">Read-only</span>
        </div>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Audit log access for security-monitoring applications PROJXON authorizes.
        </p>
      </div>

      {!data.externalApiEnabled && (
        <div role="status" className="legal-draft mt-0 mb-4">
          <AlertTriangle width={18} height={18} className="shrink-0 mt-0.5" />
          <span>
            <strong>The external API is currently disabled on this server.</strong> Every request returns 404 until
            it is switched on.
          </span>
        </div>
      )}

      <div className="card p-4 mb-6 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] shrink-0 sm:w-20">
            Base URL
          </span>
          <code className="flex-1 min-w-0 font-mono text-sm text-[var(--text-primary)] bg-[var(--bg-muted)] rounded px-2 py-1.5 break-all">
            {ENDPOINT}
          </code>
          <CopyButton text={ENDPOINT} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/settings?tab=integrations" className="btn btn-primary btn-sm">
            <KeyRound width={14} height={14} />
            Generate a key
          </Link>
          <Link to="/legal/terms#api" className="btn btn-ghost btn-sm">
            Terms of Use: API keys and integrations
          </Link>
        </div>
      </div>
    </>
  );

  return (
    <DocsArticle
      bodyKey={`rest-api@${data.apiVersion}`}
      header={header}
      aside={
        <li>
          <Link
            to={{ hash: CATALOG_ID }}
            replace
            className="block py-0.5 text-[var(--text-secondary)] hover:text-[var(--brand-text)]"
          >
            Audit action catalog
          </Link>
        </li>
      }
    >
      <ContentMarkdown>{markdown}</ContentMarkdown>
      <ActionCatalog groups={data.actions} />
    </DocsArticle>
  );
}
