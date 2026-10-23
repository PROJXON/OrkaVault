import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import api from "../lib/api";
import { useAuth } from "../lib/authContext";
import { NOTICE, TERMS } from "../lib/legalVersions";
import { InlineLegalLink as LegalLink } from "./LegalLinks";
import logo from "../assets/OrkaVault.png";

// Post-authentication System Use Notice gate (NEW-FEAT §3.2, NIST SP 800-53
// AC-8 b: the notice stays until the user explicitly acknowledges it).
// ProtectedRoute renders this instead of the app while /auth/me reports
// needsNoticeAcknowledgment or needsTermsAcceptance. It runs before the MFA
// setup redirect, so a new user sees it first. The only ways out are
// acknowledging or signing out.
//
// Shown on first sign-in and whenever LEGAL_NOTICE_VERSION / LEGAL_TERMS_VERSION
// is bumped (decision §14.3 default), not every session.
export default function SystemUseNotice({ needsNotice, needsTerms }) {
  const { refreshUser, logout } = useAuth();
  const navigate = useNavigate();
  const [termsChecked, setTermsChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = !submitting && (!needsTerms || termsChecked);

  const handleAcknowledge = async () => {
    setError("");
    setSubmitting(true);
    try {
      if (needsTerms) {
        await api.post("/auth/acknowledge", { type: "terms", version: TERMS.version });
      }
      if (needsNotice) {
        await api.post("/auth/acknowledge", { type: "notice", version: NOTICE.version });
      }
      await refreshUser();
    } catch (err) {
      setError(err.response?.data?.error || "Could not record your acknowledgment. Try again.");
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
        aria-labelledby="system-use-notice-title"
        className="mx-auto w-full max-w-2xl bg-white dark:bg-[var(--bg-surface)] shadow-sm rounded-lg p-6 sm:p-8"
      >
        <div className="flex items-center gap-3 mb-4">
          <img src={logo} alt="" className="h-10 w-auto object-contain" />
          <h1 id="system-use-notice-title" className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" aria-hidden="true" />
            System Use Notice
          </h1>
        </div>

        {NOTICE.draft && (
          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
            Draft, pending legal review
          </p>
        )}

        {needsNotice ? (
          <div className="space-y-3 text-sm leading-relaxed text-[var(--text-secondary)]">
            <p className="font-semibold text-[var(--text-primary)]">
              OrkaVault is a private PROJXON system for authorized users only.
            </p>
            <p>By continuing to use this system, you understand and agree that:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                You are accessing a PROJXON information system that holds confidential credentials. Access is
                limited to PROJXON members whose accounts an administrator has approved.
              </li>
              <li>
                Your use of this system, including sign-ins, credential access requests, approvals, and
                credential reveals, is monitored, recorded, and subject to audit.
              </li>
              <li>
                Unauthorized access or use, or use beyond what you have been granted, is prohibited and may
                result in loss of access, disciplinary action, and civil or criminal penalties.
              </li>
              <li>Using this system means you consent to this monitoring and recording.</li>
            </ul>
            <p>
              Details are in the <LegalLink to="/legal/terms#monitoring">Terms of Use</LegalLink> and
              the <LegalLink to="/legal/privacy">Privacy notice</LegalLink>.
            </p>
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
            The Terms of Use have been updated. Review and accept them to continue.
          </p>
        )}

        {needsTerms && (
          <label className="mt-5 flex items-start gap-3 text-sm text-[var(--text-secondary)] cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={termsChecked}
              onChange={(e) => setTermsChecked(e.target.checked)}
              disabled={submitting}
            />
            <span>
              I have read and accept the <LegalLink to="/legal/terms">Terms of Use</LegalLink> and
              the <LegalLink to="/legal/privacy">Privacy notice</LegalLink>.
            </span>
          </label>
        )}

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
            onClick={handleAcknowledge}
            disabled={!canSubmit}
          >
            {submitting ? "Saving..." : needsNotice ? "I acknowledge" : "Accept and continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
