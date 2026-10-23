import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Eye, FileText, GitCompare, Megaphone, Pencil, RotateCcw, Trash2, TriangleAlert, X } from "lucide-react";
import api from "../lib/api";
import { formatDateTime, formatVersion, useContentState } from "../lib/content";
import { legalPath, reacceptLabel } from "../lib/contentRegistry";
import ContentMarkdown from "./ContentMarkdown";
import { InlineLegalLink } from "./LegalLinks";
import LineDiff, { diffStats } from "./LineDiff";
import { LegalDraftBanner } from "../pages/legal/LegalLayout";

// Settings → Content (Phase 4b, ADMIN). Every policy page and legal banner
// is edited here. Edits autosave to a draft that users never see; only the
// publish buttons change what users see:
//   policies: "Publish & require re-acceptance" (primary) or "Publish minor
//             fix" (no re-prompt, for typos/formatting/links);
//   banners:  "Publish".
// Published versions are immutable; "Start draft from this version" is how
// old text is restored (it publishes again as a new version).
// The server enforces all of this (routes/content.ts); this is UX.

const AUTOSAVE_MS = 800;
const MINOR_FIX_SOFT_LIMIT = 10; // changed lines before "this looks like more than a minor fix"

function Modal({ title, onClose, children, footer, maxWidth = 760 }) {
  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" style={{ maxWidth, width: "100%" }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-h">
          <div className="mt grow font-semibold">{title}</div>
          <button onClick={onClose} className="iconbtn" style={{ width: 32, height: 32 }} aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}

function Badge({ tone = "neutral", children }) {
  const tones = {
    neutral: "bg-gray-100 text-gray-700 dark:bg-[var(--bg-muted)] dark:text-[var(--text-secondary)]",
    warn: "bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300",
    info: "bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-300",
    ok: "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400",
  };
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-sm ${tones[tone]}`}>
      {children}
    </span>
  );
}

function Warning({ children }) {
  return (
    <div className="flex gap-2 p-3 text-sm rounded-sm bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-900/40">
      <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
      <div>{children}</div>
    </div>
  );
}

function Preview({ isPolicy, title, body, draftBanner }) {
  if (!isPolicy) {
    return (
      <div className="rounded-md border border-gray-200 dark:border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3 text-sm text-[var(--text-secondary)] [&_strong]:font-semibold [&_strong]:text-[var(--text-primary)]">
        <ContentMarkdown variant="inline">{body}</ContentMarkdown>
      </div>
    );
  }
  return (
    <div className="legal-prose !max-w-none text-sm rounded-md border border-gray-200 dark:border-[var(--border-subtle)] p-4 overflow-auto max-h-[640px]">
      <h1 className="!text-2xl">{title || "Untitled"}</h1>
      {draftBanner && <LegalDraftBanner />}
      <ContentMarkdown>{body}</ContentMarkdown>
    </div>
  );
}

// ─── Publish dialog ────────────────────────────────────────────────────

function PublishDialog({ mode, entry, title, currentBody, draft, hasTbd, activeUsers, onClose, onPublished }) {
  const isPolicy = entry.kind === "policy";
  const [changeNote, setChangeNote] = useState("");
  const [allowTbd, setAllowTbd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const stats = useMemo(() => diffStats(currentBody, draft.body), [currentBody, draft.body]);

  const needsTbdConfirm = isPolicy && !draft.draftBanner && hasTbd;
  const looksBig = mode === "minor" && (stats.changed > MINOR_FIX_SOFT_LIMIT || stats.headingChanged);
  const canSubmit = !submitting && changeNote.trim().length > 0 && changeNote.length <= 300 && (!needsTbdConfirm || allowTbd);

  const heading =
    mode === "reaccept" ? reacceptLabel(entry.acceptance) : mode === "minor" ? "Publish minor fix" : `Publish ${entry.label}`;

  let summary;
  if (mode === "reaccept") {
    if (entry.acceptance === "consent") {
      summary = "Everyone will see the cookie consent bar again and must make a new choice. Takes effect immediately.";
    } else if (entry.acceptance === "notice") {
      summary = `All ${activeUsers} active users will see the updated ${title} and must acknowledge it before they can continue. Takes effect immediately.`;
    } else {
      summary = `All ${activeUsers} active users will see "Our ${title} has changed" and must accept before they can continue. Takes effect immediately.`;
    }
  } else if (mode === "minor") {
    summary =
      "Users will see the corrected text immediately but will NOT be asked to accept again. Use this only for typos, formatting or broken links, not changes to what the policy says.";
  } else {
    summary = "The new text is shown to everyone from their next page load.";
  }

  const submit = async () => {
    setSubmitting(true);
    setError("");
    try {
      const payload = { changeNote: changeNote.trim() };
      if (isPolicy) {
        payload.requiresReacceptance = mode === "reaccept";
        payload.draftBanner = draft.draftBanner;
        payload.allowTbd = allowTbd;
      }
      const { data } = await api.post(`/content/${entry.key}/publish`, payload);
      onPublished(data);
    } catch (e) {
      setError(e.response?.data?.error || "Publishing failed.");
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={heading}
      onClose={submitting ? () => {} : onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm disabled:opacity-50" onClick={submit} disabled={!canSubmit}>
            {submitting ? "Publishing..." : mode === "reaccept" ? "Publish and re-prompt users" : "Publish now"}
          </button>
        </>
      }
    >
      <p className="text-sm text-gray-800 dark:text-[var(--text-primary)] font-medium">{summary}</p>

      <label className="block text-sm">
        <span className="font-medium text-gray-700 dark:text-[var(--text-secondary)]">
          {mode === "reaccept"
            ? "Change note (shown to users as \"What changed\")"
            : mode === "minor"
              ? "Change note (internal: what was fixed)"
              : "Change note (internal)"}
        </span>
        <textarea
          rows={2}
          maxLength={300}
          value={changeNote}
          onChange={(e) => setChangeNote(e.target.value)}
          placeholder={mode === "reaccept" ? "e.g. Added the hosting region" : "e.g. Fixed a broken link"}
          className="mt-1 w-full border border-gray-300 dark:border-[var(--border-default)] rounded-md px-3 py-2 text-sm"
        />
        <span className="text-xs text-gray-500 dark:text-[var(--text-tertiary)]">{changeNote.length}/300</span>
      </label>

      {looksBig && (
        <Warning>
          This looks like more than a minor fix ({stats.changed} changed lines{stats.headingChanged ? ", headings added or removed" : ""}).
          Consider requiring re-acceptance instead.
        </Warning>
      )}

      {needsTbdConfirm && (
        <Warning>
          The text still contains [TBD] placeholders and the DRAFT banner is off.
          <label className="mt-2 flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={allowTbd} onChange={(e) => setAllowTbd(e.target.checked)} />
            Publish with the placeholders anyway
          </label>
        </Warning>
      )}

      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-[var(--text-secondary)] mb-1">
          Changes from the published version
        </p>
        <LineDiff from={currentBody} to={draft.body} />
      </div>

      {error && <p className="text-sm text-brand-red">{error}</p>}
    </Modal>
  );
}

// ─── History ───────────────────────────────────────────────────────────

function HistoryPanel({ entry, reloadKey, onRestore }) {
  const isPolicy = entry.kind === "policy";
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState([]);
  const [viewing, setViewing] = useState(null);
  const [comparing, setComparing] = useState(null);

  useEffect(() => {
    setError("");
    api
      .get(`/content/${entry.key}/history`)
      .then(({ data }) => setRows(data))
      .catch((e) => setError(e.response?.data?.error || "Failed to load history."));
  }, [entry.key, reloadKey]);

  const fetchVersion = async (version) =>
    (await api.get(`/content/${entry.key}/versions/${encodeURIComponent(version)}`)).data;

  const toggle = (version) =>
    setSelected((s) => (s.includes(version) ? s.filter((v) => v !== version) : [...s, version].slice(-2)));

  const view = async (row) => {
    try {
      setViewing(await fetchVersion(row.version));
    } catch {
      setError("Failed to load that version.");
    }
  };

  const compare = async () => {
    try {
      const [a, b] = await Promise.all(selected.map(fetchVersion));
      const [older, newer] = new Date(a.publishedAt) <= new Date(b.publishedAt) ? [a, b] : [b, a];
      setComparing({ older, newer });
    } catch {
      setError("Failed to load those versions.");
    }
  };

  const restore = async (row) => {
    try {
      onRestore(await fetchVersion(row.version));
    } catch {
      setError("Failed to load that version.");
    }
  };

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-gray-800 dark:text-[var(--text-primary)]">Published versions</h4>
        <button
          type="button"
          className="btn btn-secondary btn-sm disabled:opacity-50"
          disabled={selected.length !== 2}
          onClick={compare}
          title="Tick two versions to compare them"
        >
          <GitCompare className="w-4 h-4" /> Compare selected
        </button>
      </div>
      {error && <p className="text-sm text-brand-red mb-2">{error}</p>}
      {!rows ? (
        <p className="text-sm text-gray-500 dark:text-[var(--text-tertiary)]">Loading…</p>
      ) : (
        <ul className="divide-y divide-gray-200 dark:divide-[var(--border-subtle)] border border-gray-200 dark:border-[var(--border-subtle)] rounded-md">
          {rows.map((r, i) => (
            <li key={r.version} className="px-3 py-2 text-sm flex flex-wrap items-start gap-x-3 gap-y-1">
              <input
                type="checkbox"
                className="mt-1"
                checked={selected.includes(r.version)}
                onChange={() => toggle(r.version)}
                aria-label={`Select version ${formatVersion(r.version)} to compare`}
              />
              <div className="min-w-0 grow">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-gray-900 dark:text-[var(--text-primary)]">{formatVersion(r.version)}</span>
                  {isPolicy ? (
                    r.requiresReacceptance ? <Badge tone="info">Re-acceptance</Badge> : <Badge>Minor fix</Badge>
                  ) : null}
                  {i === 0 && <Badge tone="ok">Current</Badge>}
                </div>
                <p className="text-gray-600 dark:text-[var(--text-secondary)]">{r.changeNote}</p>
                <p className="text-xs text-gray-500 dark:text-[var(--text-tertiary)]">
                  {r.publishedBy ? `by ${r.publishedBy}` : "seeded"}
                  {isPolicy && entry.acceptance !== "consent" && ` · accepted by ${r.acceptedBy} user${r.acceptedBy === 1 ? "" : "s"}`}
                  {` · sha256 ${r.bodySha256.slice(0, 12)}…`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => view(r)}>
                  <Eye className="w-4 h-4" /> View
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => restore(r)} title="Copy this text into the draft">
                  <RotateCcw className="w-4 h-4" /> Start draft from this
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {viewing && (
        <Modal title={`Version ${formatVersion(viewing.version)}`} onClose={() => setViewing(null)}>
          <Preview isPolicy={isPolicy} title={viewing.title} body={viewing.body} draftBanner={viewing.draftBanner} />
        </Modal>
      )}
      {comparing && (
        <Modal
          title={`Compare ${formatVersion(comparing.older.version)} → ${formatVersion(comparing.newer.version)}`}
          onClose={() => setComparing(null)}
        >
          {comparing.older.title !== comparing.newer.title && (
            <p className="text-sm">
              Title: <s>{comparing.older.title}</s> → {comparing.newer.title}
            </p>
          )}
          <LineDiff from={comparing.older.body} to={comparing.newer.body} maxHeight={560} />
        </Modal>
      )}
    </div>
  );
}

// ─── Editor ────────────────────────────────────────────────────────────

function ContentEditor({ entry, activeUsers, onBack, onChanged }) {
  const isPolicy = entry.kind === "policy";
  const { refreshContent } = useContentState();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [current, setCurrent] = useState(null);
  const [fields, setFields] = useState({ title: "", body: "", draftBanner: false });
  const [draftInfo, setDraftInfo] = useState(null);
  const [meta, setMeta] = useState({ staleBase: false, changed: false, warnings: null });
  const [saveState, setSaveState] = useState("idle"); // idle | pending | saving | saved | error
  const [saveError, setSaveError] = useState("");
  const [dialog, setDialog] = useState(null); // "reaccept" | "minor" | "publish"
  const [historyKey, setHistoryKey] = useState(0);
  const [notice, setNotice] = useState("");
  const seq = useRef(0);
  const timer = useRef(null);

  const applyDraftResponse = (data) => {
    setCurrent(data.current);
    setDraftInfo(data.draft ? { updatedAt: data.draft.updatedAt, updatedBy: data.draft.updatedBy?.name ?? null } : null);
    setMeta({ staleBase: data.staleBase, changed: data.changed, warnings: data.warnings });
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const { data } = await api.get(`/content/${entry.key}/draft`);
      applyDraftResponse(data);
      const src = data.draft || data.current || {};
      setFields({ title: src.title || "", body: src.body || "", draftBanner: !!src.draftBanner });
      setSaveState("idle");
    } catch (e) {
      setLoadError(e.response?.data?.error || "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [entry.key]);

  useEffect(() => {
    load();
    return () => clearTimeout(timer.current);
  }, [load]);

  const save = async (next) => {
    const mySeq = ++seq.current;
    setSaveState("saving");
    try {
      const { data } = await api.put(`/content/${entry.key}/draft`, next);
      if (mySeq !== seq.current) return;
      applyDraftResponse(data);
      setSaveState("saved");
      setSaveError("");
      onChanged();
    } catch (e) {
      if (mySeq !== seq.current) return;
      setSaveState("error");
      setSaveError(e.response?.data?.error || "Couldn't save the draft.");
    }
  };

  const edit = (patch) => {
    const next = { ...fields, ...patch };
    setFields(next);
    setNotice("");
    clearTimeout(timer.current);
    if (next.body.length > entry.maxLength) {
      setSaveState("error");
      setSaveError(`Too long: the limit is ${entry.maxLength.toLocaleString()} characters.`);
      return;
    }
    setSaveState("pending");
    timer.current = setTimeout(() => save(next), AUTOSAVE_MS);
  };

  const discard = async () => {
    if (!window.confirm("Discard this draft? The published version stays as it is.")) return;
    clearTimeout(timer.current);
    seq.current++;
    try {
      await api.delete(`/content/${entry.key}/draft`);
      setNotice("Draft discarded.");
      await load();
      onChanged();
    } catch (e) {
      setSaveError(e.response?.data?.error || "Couldn't discard the draft.");
    }
  };

  const restore = (version) => {
    if (draftInfo && !window.confirm(`Replace your current draft with the text of version ${formatVersion(version.version)}?`)) return;
    const next = {
      title: version.title || fields.title,
      body: version.body,
      draftBanner: !!version.draftBanner,
    };
    setFields(next);
    clearTimeout(timer.current);
    setNotice(`Draft started from version ${formatVersion(version.version)}. Publish it to make it current again.`);
    save(next);
  };

  const onPublished = async (published) => {
    setDialog(null);
    setNotice(`Published version ${formatVersion(published.version)}.`);
    await load();
    setHistoryKey((k) => k + 1);
    onChanged();
    refreshContent();
  };

  const busy = saveState === "pending" || saveState === "saving";
  const canPublish = !!draftInfo && meta.changed && !busy && saveState !== "error";
  const warnings = meta.warnings;
  const publicPath = legalPath(entry.key);

  if (loading && !current && !loadError) {
    return <p className="text-sm text-gray-500 dark:text-[var(--text-tertiary)]">Loading…</p>;
  }

  return (
    <div className="bg-white dark:bg-[var(--bg-surface)] shadow-sm rounded-lg border border-gray-200 dark:border-[var(--border-subtle)] mb-6">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-[var(--border-subtle)] flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" /> All content
        </button>
        <div className="min-w-0 grow">
          <h3 className="text-lg font-medium text-gray-900 dark:text-[var(--text-primary)]">{entry.label}</h3>
          <p className="text-sm text-gray-500 dark:text-[var(--text-tertiary)]">
            {draftInfo ? (
              <>
                <strong className="text-amber-700 dark:text-amber-300">Editing draft</strong> — users still see version{" "}
                {current ? formatVersion(current.version) : "none"}
              </>
            ) : (
              <>No draft. Edits create one — users keep seeing version {current ? formatVersion(current.version) : "none"} until you publish.</>
            )}
            {publicPath && current && (
              <>
                {" · "}
                <InlineLegalLink to={publicPath}>View live page</InlineLegalLink>
              </>
            )}
          </p>
        </div>
        <span className="text-xs text-gray-500 dark:text-[var(--text-tertiary)]" aria-live="polite">
          {saveState === "pending" || saveState === "saving"
            ? "Saving…"
            : saveState === "saved"
              ? "Draft saved"
              : draftInfo
                ? `Last edited ${formatDateTime(draftInfo.updatedAt)}${draftInfo.updatedBy ? ` by ${draftInfo.updatedBy}` : ""}`
                : ""}
        </span>
      </div>

      <div className="px-6 py-5 flex flex-col gap-4">
        {loadError && <p className="text-sm text-brand-red">{loadError}</p>}
        {notice && <p className="text-sm text-green-700 dark:text-green-400">{notice}</p>}
        {saveState === "error" && saveError && <p className="text-sm text-brand-red">{saveError}</p>}

        {meta.staleBase && (
          <Warning>
            A new version ({current ? formatVersion(current.version) : "?"}) was published after this draft was started, so the
            draft may be missing those changes. Check the diff before publishing, or discard the draft and start again.
          </Warning>
        )}
        {warnings?.missingAnchors?.length > 0 && (
          <Warning>
            Other screens link to {warnings.missingAnchors.map((a) => `#${a}`).join(", ")}. Keep a heading with that id, e.g.{" "}
            <code>## Heading {`{#${warnings.missingAnchors[0]}}`}</code>. Publishing is blocked until it's back.
          </Warning>
        )}
        {isPolicy && warnings?.hasTbd && !fields.draftBanner && (
          <Warning>The text still contains [TBD] placeholders while the DRAFT banner is off. Publishing will ask you to confirm.</Warning>
        )}

        {isPolicy && (
          <div className="flex flex-wrap items-end gap-4">
            <label className="block text-sm grow min-w-[220px]">
              <span className="font-medium text-gray-700 dark:text-[var(--text-secondary)]">Title</span>
              <input
                type="text"
                value={fields.title}
                maxLength={200}
                onChange={(e) => edit({ title: e.target.value })}
                className="mt-1 w-full border border-gray-300 dark:border-[var(--border-default)] rounded-md px-3 py-2 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-[var(--text-secondary)] cursor-pointer pb-2">
              <input type="checkbox" checked={fields.draftBanner} onChange={(e) => edit({ draftBanner: e.target.checked })} />
              Show DRAFT banner
            </label>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-gray-700 dark:text-[var(--text-secondary)]">Markdown</span>
            <textarea
              value={fields.body}
              onChange={(e) => edit({ body: e.target.value })}
              rows={isPolicy ? 24 : 6}
              spellCheck
              className="mt-1 w-full font-mono text-xs leading-relaxed border border-gray-300 dark:border-[var(--border-default)] rounded-md px-3 py-2"
            />
            <span className="text-xs text-gray-500 dark:text-[var(--text-tertiary)]">
              {fields.body.length.toLocaleString()}/{entry.maxLength.toLocaleString()} characters · Markdown with tables; HTML
              and images are not rendered. Use <code>{"{#id}"}</code> after a heading to fix its anchor.
            </span>
          </label>
          <div className="text-sm">
            <span className="font-medium text-gray-700 dark:text-[var(--text-secondary)]">Preview</span>
            <div className="mt-1">
              <Preview isPolicy={isPolicy} title={fields.title} body={fields.body} draftBanner={fields.draftBanner} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-200 dark:border-[var(--border-subtle)]">
          {draftInfo && (
            <button type="button" className="btn btn-ghost btn-sm text-brand-red" onClick={discard}>
              <Trash2 className="w-4 h-4" /> Discard draft
            </button>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {!canPublish && (
              <span className="text-xs text-gray-500 dark:text-[var(--text-tertiary)]">
                {busy ? "Saving…" : !draftInfo ? "No draft to publish" : !meta.changed ? "Draft matches the published version" : ""}
              </span>
            )}
            {isPolicy ? (
              <>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm disabled:opacity-50"
                  disabled={!canPublish}
                  onClick={() => setDialog("minor")}
                >
                  Publish minor fix
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm disabled:opacity-50"
                  disabled={!canPublish}
                  onClick={() => setDialog("reaccept")}
                >
                  {reacceptLabel(entry.acceptance)}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm disabled:opacity-50"
                disabled={!canPublish}
                onClick={() => setDialog("publish")}
              >
                Publish
              </button>
            )}
          </div>
        </div>

        <HistoryPanel entry={entry} reloadKey={historyKey} onRestore={restore} />
      </div>

      {dialog && (
        <PublishDialog
          mode={dialog}
          entry={entry}
          title={fields.title || current?.title || entry.label}
          currentBody={current?.body ?? ""}
          draft={fields}
          hasTbd={!!warnings?.hasTbd}
          activeUsers={activeUsers}
          onClose={() => setDialog(null)}
          onPublished={onPublished}
        />
      )}
    </div>
  );
}

// ─── List ──────────────────────────────────────────────────────────────

function ContentRow({ item, onEdit }) {
  return (
    <li className="px-6 py-3 flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-gray-900 dark:text-[var(--text-primary)]">{item.label}</span>
          <code className="text-[11px] text-gray-500 dark:text-[var(--text-tertiary)]">{item.key}</code>
          {item.draft && <Badge tone="warn">Draft — not published</Badge>}
        </div>
        <p className="text-xs text-gray-500 dark:text-[var(--text-tertiary)]">
          {item.current ? (
            <>
              Version {formatVersion(item.current.version)}
              {item.kind === "policy" && !item.current.requiresReacceptance && " (minor fix)"}
            </>
          ) : (
            "Not published yet"
          )}
          {item.draft &&
            ` · draft last edited ${formatDateTime(item.draft.updatedAt)}${item.draft.updatedBy ? ` by ${item.draft.updatedBy}` : ""}`}
        </p>
      </div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEdit(item.key)}>
        <Pencil className="w-4 h-4" /> Edit
      </button>
    </li>
  );
}

export default function ContentTab() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [selectedKey, setSelectedKey] = useState(null);

  const loadSummary = useCallback(async () => {
    try {
      const { data } = await api.get("/content/admin/summary");
      setSummary(data);
      setError("");
    } catch (e) {
      setError(e.response?.data?.error || "Failed to load content.");
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const entry = summary?.items.find((i) => i.key === selectedKey);
  if (entry) {
    return (
      <ContentEditor
        entry={entry}
        activeUsers={summary.activeUsers}
        onBack={() => {
          setSelectedKey(null);
          loadSummary();
        }}
        onChanged={loadSummary}
      />
    );
  }

  const groups = [
    { kind: "policy", label: "Policies", icon: FileText, hint: "Full pages users accept. Publishing can require everyone to accept again." },
    { kind: "banner", label: "Banners", icon: Megaphone, hint: "Short notices and labels. No acceptance; Publish shows the new text." },
  ];

  return (
    <div className="bg-white dark:bg-[var(--bg-surface)] shadow-sm rounded-lg overflow-hidden border border-gray-200 dark:border-[var(--border-subtle)] mb-6">
      <div className="px-6 py-5 border-b border-gray-200 dark:border-[var(--border-subtle)]">
        <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-[var(--text-primary)]">Content</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-[var(--text-tertiary)]">
          Policy pages and legal banners. Edits are saved as drafts that users never see; nothing changes until you press a
          publish button. Every published version is kept.
        </p>
      </div>
      {error && (
        <div className="px-6 py-3 bg-red-50 border-b border-red-100">
          <p className="text-sm text-brand-red">{error}</p>
        </div>
      )}
      {!summary ? (
        !error && <p className="px-6 py-4 text-sm text-gray-500 dark:text-[var(--text-tertiary)]">Loading...</p>
      ) : (
        groups.map((g) => (
          <div key={g.kind}>
            <div className="px-6 pt-4 pb-2 bg-gray-50 dark:bg-[var(--bg-canvas)] border-b border-gray-200 dark:border-[var(--border-subtle)]">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-[var(--text-secondary)] flex items-center gap-2">
                <g.icon className="w-4 h-4" /> {g.label}
              </h4>
              <p className="text-xs text-gray-500 dark:text-[var(--text-tertiary)]">{g.hint}</p>
            </div>
            <ul className="divide-y divide-gray-200 dark:divide-[var(--border-subtle)]">
              {summary.items
                .filter((i) => i.kind === g.kind)
                .map((item) => (
                  <ContentRow key={item.key} item={item} onEdit={setSelectedKey} />
                ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
