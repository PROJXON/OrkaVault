import React from "react";
import { ShieldAlert } from "lucide-react";

// Pre-authentication System Use Notice (NEW-FEAT §3.1, NIST SP 800-53 AC-8).
// Shown on Login and Register above the form, before any credentials are
// entered. The full text and the acknowledgment are in SystemUseNotice.jsx.
export default function SystemUseBanner() {
  return (
    <div
      role="note"
      aria-label="System use notice"
      className="mb-6 flex gap-3 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-subtle)] p-3 text-xs leading-relaxed text-[var(--text-secondary)]"
    >
      <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-[var(--text-primary)]" aria-hidden="true" />
      <p>
        <span className="font-semibold text-[var(--text-primary)]">Authorized PROJXON users only.</span>{" "}
        This is a private PROJXON system. Activity is monitored, recorded, and subject to audit. Unauthorized
        access or use is prohibited. By signing in you consent to this monitoring.
      </p>
    </div>
  );
}
