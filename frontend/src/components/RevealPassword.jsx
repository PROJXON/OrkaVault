import React, { useState, useRef, useEffect } from "react";
import { Eye, ShieldOff, CheckCircle, Copy, Check } from "lucide-react";
import useAccountReveal, { formatRevealTime } from "../lib/useAccountReveal";
import { entryTypeInfo } from "../lib/entryTypes";

// `reveal` (optional): a useAccountReveal() session shared with sibling
// components (e.g. the custom field rows in Vault.jsx) so they all use one
// reveal call. The owner of a shared session attaches its containerRef to
// a wrapper around all of them. Without it, this component runs its own.
// `entryType` (optional): SECURE_NOTE reveals as a multi-line block instead of the one-line pill.
export default function RevealPassword({ accountId, isAdmin, onRequestAccess, onGrantExpired, onRevealed, reveal: sharedReveal, entryType }) {
  const typeInfo = entryTypeInfo(entryType);
  const ownReveal = useAccountReveal(sharedReveal ? null : accountId, { onGrantExpired, onRevealed });
  const reveal = sharedReveal || ownReveal;
  const { data, expired, shown, screenTimeLeft, loading, error, setError } = reveal;
  const password = data?.password ?? null;

  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(copiedTimerRef.current), []);

  const handleCopy = async () => {
    if (!password || password === "USE_GOOGLE_SSO") return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Failed to copy to clipboard");
    }
  };

  const handleReveal = () => {
    if (loading) return;
    reveal.show("password");
  };

  const handleDone = () => reveal.hideAll();

  // Standalone: the pill itself is the click-outside boundary.
  const pillRef = sharedReveal ? undefined : reveal.containerRef;

  // ── EXPIRED: Admin can never be expired from the UI ───────────────────────
  if (expired && !isAdmin) {
    // We render null here because Vault.jsx parent will unmount us immediately
    // when we call onGrantExpired() and it flips hasGrant to false.
    return null;
  }

  // ── REVEALED ──────────────────────────────────────────────────────────────
  if (password && shown.has("password")) {
    if (password === "USE_GOOGLE_SSO") {
      return (
        <div
          ref={pillRef}
          className="inline-flex items-center space-x-2 bg-blue-50 px-3 py-1.5 rounded-md border border-brand-blue"
        >
          <span className="text-brand-blue text-xs font-medium">
            Use the Google account in the email field to login
          </span>
          {screenTimeLeft !== null && screenTimeLeft > 0 && (
            <div className="flex items-center justify-center min-w-[36px] px-1.5 h-7 rounded-full bg-white dark:bg-[var(--bg-surface)] border border-brand-blue text-xs font-bold text-brand-blue shadow-xs shrink-0">
              {formatRevealTime(screenTimeLeft)}
            </div>
          )}
          <button
            onClick={handleDone}
            className="flex items-center justify-center w-7 h-7 rounded-full bg-green-100 border border-green-300 text-green-600 hover:bg-green-200 transition-colors shrink-0 ml-2"
            title="Done — dismiss"
          >
            <CheckCircle className="h-4 w-4" />
          </button>
        </div>
      );
    }

    if (typeInfo.multiline) {
      return (
        <div
          ref={pillRef}
          className="w-full bg-amber-50 px-3 py-2 rounded-md border border-amber-200 text-left"
          onCopy={(e) => e.preventDefault()}
          onContextMenu={(e) => e.preventDefault()}
          onDragStart={(e) => e.preventDefault()}
        >
          <div className="flex items-center gap-2 mb-2">
            <ShieldOff className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            <span className="text-xs font-medium text-amber-700 grow">{typeInfo.secretLabel}</span>
            <button
              type="button"
              onClick={handleCopy}
              title="Copy note"
              className="p-1 rounded-sm hover:bg-amber-100 transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5 text-amber-600" />}
            </button>
            {screenTimeLeft !== null && screenTimeLeft > 0 && (
              <div className="flex items-center justify-center min-w-[36px] px-1.5 h-7 rounded-full bg-white dark:bg-[var(--bg-surface)] border border-amber-300 text-xs font-bold text-amber-600 shadow-xs shrink-0">
                {formatRevealTime(screenTimeLeft)}
              </div>
            )}
            <button
              onClick={handleDone}
              className="flex items-center justify-center w-7 h-7 rounded-full bg-green-100 border border-green-300 text-green-600 hover:bg-green-200 transition-colors shrink-0"
              title="Done — hide note now"
            >
              <CheckCircle className="h-4 w-4" />
            </button>
          </div>
          <pre
            className="font-mono text-sm text-gray-900 dark:text-[var(--text-primary)] whitespace-pre-wrap break-words overflow-y-auto"
            style={{ maxHeight: 280, margin: 0, userSelect: "none", WebkitUserSelect: "none", MozUserSelect: "none" }}
          >
            {password}
          </pre>
          {copied && <div className="text-xs text-green-600 font-medium mt-1">Copied!</div>}
        </div>
      );
    }

    return (
      <div
        ref={pillRef}
        className="inline-flex items-center space-x-2 bg-amber-50 px-3 py-1.5 rounded-md border border-amber-200"
        onCopy={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
      >
        <ShieldOff className="h-3.5 w-3.5 text-amber-500 shrink-0" />
        <button
          type="button"
          onClick={handleCopy}
          title="Click to copy"
          className="font-mono text-gray-900 dark:text-[var(--text-primary)] text-sm hover:bg-amber-100 rounded-sm px-1 -mx-1 transition-colors flex items-center gap-1"
          style={{ userSelect: "none", WebkitUserSelect: "none", MozUserSelect: "none" }}
        >
          {password}
          {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3 opacity-50" />}
        </button>
        {copied && <span className="text-xs text-green-600 font-medium">Copied!</span>}
        {screenTimeLeft !== null && screenTimeLeft > 0 && (
          <div className="flex items-center justify-center min-w-[36px] px-1.5 h-7 rounded-full bg-white dark:bg-[var(--bg-surface)] border border-amber-300 text-xs font-bold text-amber-600 shadow-xs shrink-0">
            {formatRevealTime(screenTimeLeft)}
          </div>
        )}
        <button
          onClick={handleDone}
          className="flex items-center justify-center w-7 h-7 rounded-full bg-green-100 border border-green-300 text-green-600 hover:bg-green-200 transition-colors shrink-0"
          title="Done — hide password now"
        >
          <CheckCircle className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // ── IDLE: dots + eye ──────────────────────────────────────────────────────
  return (
    <div className="flex items-center space-x-2 justify-end">
      <span className="text-gray-400 dark:text-[var(--text-tertiary)] select-none tracking-widest">••••••••</span>
      <button
        onClick={handleReveal}
        disabled={loading}
        className="p-1 text-brand-blue hover:bg-blue-50 rounded-sm transition-colors disabled:opacity-50"
        title={`View ${typeInfo.secretLabel}`}
      >
        <Eye className="h-4 w-4" />
      </button>
      {error && <span className="text-xs text-brand-red ml-2">{error}</span>}
    </div>
  );
}
