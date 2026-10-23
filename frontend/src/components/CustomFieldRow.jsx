import React, { useState, useRef, useEffect } from "react";
import { Copy, Check, Eye, EyeOff } from "lucide-react";
import { formatRevealTime } from "../lib/useAccountReveal";

// One custom field on a vault entry: label, a fixed-length mask (never the
// value's real length), and Copy / Eye buttons. `reveal` is the account's
// shared useAccountReveal() session, so every row plus the password share
// one reveal call. `disabled` (no grant / insufficient clearance) keeps the
// row visible but inert, with `disabledReason` as the tooltip.
export default function CustomFieldRow({ field, reveal, disabled, disabledReason }) {
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(copiedTimerRef.current), []);

  const visible = !disabled && reveal.data && reveal.shown.has(field.id);
  const value = visible
    ? reveal.data.customFields.find((f) => f.id === field.id)?.value ?? ""
    : null;

  const handleCopy = async () => {
    const ok = await reveal.copy((d) => d.customFields.find((f) => f.id === field.id)?.value ?? null);
    if (ok) {
      setCopied(true);
      clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleToggle = () => {
    if (visible) reveal.hide(field.id);
    else reveal.show(field.id);
  };

  const btnClass =
    "iconbtn shrink-0 disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className="flex items-start gap-3 py-1.5">
      <div
        className="w-32 shrink-0 truncate text-xs font-semibold uppercase tracking-wide pt-1"
        style={{ color: "var(--text-tertiary)" }}
        title={field.label}
      >
        {field.label}
      </div>
      <div
        className="flex-1 min-w-0 text-sm font-mono pt-0.5"
        style={{ userSelect: "none", WebkitUserSelect: "none", color: visible ? "var(--text-primary)" : "var(--text-tertiary)" }}
      >
        {visible ? (
          <span className="whitespace-pre-wrap break-all">{value}</span>
        ) : (
          <span className="tracking-widest select-none">••••••••</span>
        )}
      </div>
      {visible && reveal.screenTimeLeft !== null && reveal.screenTimeLeft > 0 && (
        <span className="text-xs font-semibold shrink-0 pt-1" style={{ color: "var(--text-tertiary)" }}>
          {formatRevealTime(reveal.screenTimeLeft)}
        </span>
      )}
      <button
        type="button"
        className={btnClass}
        style={{ width: 28, height: 28 }}
        onClick={handleCopy}
        disabled={disabled || reveal.loading}
        title={disabled ? disabledReason : copied ? "Copied" : `Copy ${field.label}`}
        aria-label={`Copy ${field.label}`}
      >
        {copied ? (
          <Check width={14} height={14} style={{ color: "var(--success-text)" }} />
        ) : (
          <Copy width={14} height={14} />
        )}
      </button>
      <button
        type="button"
        className={btnClass}
        style={{ width: 28, height: 28 }}
        onClick={handleToggle}
        disabled={disabled || reveal.loading}
        title={disabled ? disabledReason : visible ? `Hide ${field.label}` : `Show ${field.label}`}
        aria-label={visible ? `Hide ${field.label}` : `Show ${field.label}`}
      >
        {visible ? <EyeOff width={14} height={14} /> : <Eye width={14} height={14} />}
      </button>
    </div>
  );
}
