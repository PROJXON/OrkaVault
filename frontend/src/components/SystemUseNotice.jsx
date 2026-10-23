import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import api from "../lib/api";
import { useAuth } from "../lib/authContext";
import { formatDate, useContent, useContentState } from "../lib/content";
import { legalPath } from "../lib/contentRegistry";
import { InlineLegalLink as LegalLink } from "./LegalLinks";
import ContentMarkdown from "./ContentMarkdown";
import { LegalDraftBanner } from "../pages/legal/LegalLayout";
import logo from "../assets/OrkaVault.png";

// Post-authentication policy gate (NEW-FEAT §3.2, NIST SP 800-53 AC-8 b;
// Phase 4b). ProtectedRoute renders this instead of the app while /auth/me
// reports pendingAcceptances: policies (Terms, Privacy, System Use Notice)
// the user has never accepted, or that an admin re-published with "Publish &
// require re-acceptance". It runs before the MFA setup redirect, so a new
// user sees it first. The only ways out are accepting or signing out.
//
// One card per pending policy, one checkbox each; "Accept and continue"
// sends them all in one /auth/acknowledge call. The server enforces the same
// gate (requireAuth), so this is UX only.

function PolicyCard({ pending, checked, onChange, disabled }) {
  const item = useContent(pending.key);
  const title = pending.title || item?.title || pending.key;
  const isNotice = pending.key === "NOTICE";
  const path = legalPath(pending.key);
  const heading = pending.firstTime ? title : `Our ${title} has changed`;
  const showChangeNote = !pending.firstTime && pending.changeNote;

  return (
    <section
      aria-labelledby={`pending-${pending.key}`}
      className="rounded-[var(--radius-sm)] border border-[var(--border-default)] p-4"
    >
      <h2 id={`pending-${pending.key}`} className="text-base font-semibold text-[var(--text-primary)]">
        {heading}
      </h2>
      {!pending.firstTime && (
        <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">Updated {formatDate(pending.publishedAt)}</p>
      )}
      {item?.draftBanner && <LegalDraftBanner />}

      {showChangeNote && (
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--text-primary)]">What changed:</span> {pending.changeNote}
        </p>
      )}

      {/* AC-8: the full notice text has to be on screen, not behind a link. */}
      {isNotice ? (
        <div className="legal-prose mt-3 !max-w-none text-sm">
          {item ? (
            <ContentMarkdown newTabLinks className="space-y-3">
              {item.body}
            </ContentMarkdown>
          ) : (
            <p>Loading…</p>
          )}
        </div>
      ) : (
        path && (
          <p className="mt-3 text-sm">
            <LegalLink to={path}>{pending.firstTime ? `Read the ${title}` : "Read the updated policy"}</LegalLink>
          </p>
        )
      )}

      <label className="mt-4 flex items-start gap-3 text-sm text-[var(--text-secondary)] cursor-pointer">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
        />
        <span>{isNotice ? `I acknowledge the ${title}.` : `I have read and accept the ${title}.`}</span>
      </label>
    </section>
  );
}

export default function SystemUseNotice({ pending }) {
  const { refreshUser, logout } = useAuth();
  const { refreshContent } = useContentState();
  const intro = useContent("POLICY_UPDATED_BANNER");
  const navigate = useNavigate();
  const [checked, setChecked] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // /content/current may be served from the 60s HTTP cache; make sure the
  // text shown is the version being accepted.
  useEffect(() => {
    refreshContent();
  }, [refreshContent]);

  const allChecked = pending.every((p) => checked[p.key]);

  const handleAccept = async () => {
    setError("");
    setSubmitting(true);
    try {
      await api.post("/auth/acknowledge", {
        acceptances: pending.map((p) => ({ key: p.key, version: p.currentVersion })),
      });
      await refreshUser();
    } catch (err) {
      // An admin published again while this screen was open: reload the
      // text and the pending list, and ask again.
      if (err.response?.data?.currentVersions || err.response?.data?.missing) {
        await Promise.all([refreshContent(), refreshUser().catch(() => {})]);
        setChecked({});
        setError("A policy was updated while this page was open. Review the latest version below.");
      } else {
        setError(err.response?.data?.error || "Could not record your acceptance. Try again.");
      }
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="consent-safe min-h-screen bg-gray-50 dark:bg-[var(--bg-canvas)] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="policy-gate-title"
        className="mx-auto w-full max-w-2xl bg-white dark:bg-[var(--bg-surface)] shadow-sm rounded-lg p-6 sm:p-8"
      >
        <div className="flex items-center gap-3 mb-4">
          <img src={logo} alt="" className="h-10 w-auto object-contain" />
          <h1 id="policy-gate-title" className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" aria-hidden="true" />
            {pending.length === 1 && pending[0].key === "NOTICE" && pending[0].firstTime ? "System Use Notice" : "Policy review"}
          </h1>
        </div>

        {intro && (
          <p className="mb-5 text-sm leading-relaxed text-[var(--text-secondary)] [&_strong]:text-[var(--text-primary)]">
            <ContentMarkdown variant="inline">{intro.body}</ContentMarkdown>
          </p>
        )}

        <div className="flex flex-col gap-4">
          {pending.map((p) => (
            <PolicyCard
              key={`${p.key}@${p.currentVersion}`}
              pending={p}
              checked={!!checked[p.key]}
              onChange={(value) => setChecked((c) => ({ ...c, [p.key]: value }))}
              disabled={submitting}
            />
          ))}
        </div>

        {error && (
          <div className="mt-5 bg-red-50 border-l-4 border-brand-red p-3">
            <p className="text-sm text-brand-red">{error}</p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleSignOut} disabled={submitting}>
            Sign out
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm disabled:opacity-50"
            onClick={handleAccept}
            disabled={submitting || !allChecked}
          >
            {submitting ? "Saving..." : "Accept and continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
