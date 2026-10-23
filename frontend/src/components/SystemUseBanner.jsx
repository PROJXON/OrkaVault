import React from "react";
import { ShieldAlert } from "lucide-react";
import { useContent } from "../lib/content";
import ContentMarkdown from "./ContentMarkdown";

// Pre-authentication System Use Notice (NEW-FEAT §3.1, NIST SP 800-53 AC-8).
// Shown on Login and Register above the form, before any credentials are
// entered. The text is the NOTICE_BANNER content item (Settings → Content);
// the full notice and the acknowledgment are in SystemUseNotice.jsx.
export default function SystemUseBanner() {
  const banner = useContent("NOTICE_BANNER");
  if (!banner) return null;
  return (
    <div
      role="note"
      aria-label="System use notice"
      className="mb-6 flex gap-3 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--bg-subtle)] p-3 text-xs leading-relaxed text-[var(--text-secondary)] [&_strong]:font-semibold [&_strong]:text-[var(--text-primary)]"
    >
      <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-[var(--text-primary)]" aria-hidden="true" />
      <ContentMarkdown variant="inline">{banner.body}</ContentMarkdown>
    </div>
  );
}
