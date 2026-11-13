import React, { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { KeyRound, RefreshCw, Trash2, X, Copy, Check, AlertTriangle } from "lucide-react";
import api, { API_BASE_URL } from "../../lib/api";

// Settings → Integrations (Phase 4c §4b). ADMIN only; the server enforces it
// on every /api/api-keys route, the Settings route guard is UX only.
//
// The plaintext key exists only in KeyDialog's local state, for as long as
// the reveal step is open. It's never put in parent/global state, storage,
// the URL or the console, and it's cleared on close and unmount.

const EXPIRY_OPTIONS = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "365 days" },
  { value: "never", label: "Never" },
];
const ENDPOINT = `${API_BASE_URL}/external/v1/audit`;

const fmt = (d) => (d ? format(new Date(d), "MMM d, yyyy") : "—");
const fmtTime = (d) => (d ? format(new Date(d), "MMM d, yyyy, h:mm a") : "Never");

function errorText(e) {
  if (e.response?.status === 429) return e.response.data?.error || "Too many attempts. Wait a few minutes and try again.";
  return e.response?.data?.error || "Something went wrong. Try again.";
}

function CopyButton({ text, label = "Copy" }) {
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
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-md border border-gray-300 dark:border-[var(--border-default)] text-gray-700 dark:text-[var(--text-secondary)] hover:bg-gray-50 dark:hover:bg-[var(--bg-muted)] shrink-0"
    >
      {copied ? <Check className="h-4 w-4 text-brand-green" /> : <Copy className="h-4 w-4" />}
      {copied ? "Copied" : label}
    </button>
  );
}

/** Create (no `target`) or regenerate (`target` = the key being replaced). */
function KeyDialog({ target, onClose }) {
  const isRegen = !!target;
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("90");
  const [keepPeriod, setKeepPeriod] = useState(true);
  const [mfaCode, setMfaCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [key, setKey] = useState(null); // plaintext, reveal step only
  const [stored, setStored] = useState(false);

  // Clear the plaintext if the dialog is unmounted any other way.
  useEffect(() => () => setKey(null), []);

  // While the key is shown, Esc must not close the dialog.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (key) {
        e.preventDefault();
        e.stopPropagation();
      } else {
        onClose(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [key, onClose]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const expiresInDays = expiry === "never" ? null : Number(expiry);
    try {
      const { data } = isRegen
        ? await api.post(`/api-keys/${target.id}/regenerate`, {
            mfaCode,
            ...(!keepPeriod && { expiresInDays }),
          })
        : await api.post("/api-keys", { name, expiresInDays, mfaCode });
      setKey(data.key);
    } catch (err) {
      setError(errorText(err));
      setMfaCode(""); // keep the rest of the form
    } finally {
      setSubmitting(false);
    }
  };

  const done = () => {
    setKey(null);
    onClose(true);
  };

  const inputCls =
    "w-full border border-gray-300 dark:border-[var(--border-default)] rounded-md px-3 py-2 text-sm shadow-xs focus:ring-brand-blue focus:border-brand-blue";

  return (
    <div className="scrim" onClick={() => !key && onClose(false)}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <div className="mt grow flex items-center gap-2 font-semibold">
            <KeyRound className="w-5 h-5 text-brand-blue" />
            {key ? "Copy your API key" : isRegen ? `Regenerate "${target.name}"` : "Generate API key"}
          </div>
          {!key && (
            <button onClick={() => onClose(false)} className="iconbtn" style={{ width: 32, height: 32 }}>
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {key ? (
          <div className="modal-b space-y-4">
            <div className="flex gap-2">
              <input
                readOnly
                value={key}
                onFocus={(e) => e.target.select()}
                className={`${inputCls} font-mono text-xs`}
                aria-label="API key"
              />
              <CopyButton text={key} />
            </div>
            <div className="p-3 text-sm rounded-sm bg-red-50 dark:bg-red-950/20 text-brand-red border border-red-200 dark:border-red-900/30 flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                This is the only time this key will be shown. Store it in OrkaSecurity's secret settings now.
                If you lose it, regenerate a new one.
              </span>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-[var(--text-secondary)]">
              <input type="checkbox" checked={stored} onChange={(e) => setStored(e.target.checked)} />
              I've stored this key
            </label>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={done}
                disabled={!stored}
                className="bg-brand-blue text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="modal-b space-y-4">
            {isRegen ? (
              <p className="text-sm text-gray-700 dark:text-[var(--text-secondary)]">
                The current key (…{target.last4}) stops working immediately, so OrkaSecurity fails until you paste in
                the new one. For zero downtime, generate a second key instead, switch OrkaSecurity to it, then revoke
                this one.
              </p>
            ) : (
              <div>
                <label className="text-sm font-medium text-gray-900 dark:text-[var(--text-primary)] block mb-1">Name</label>
                <input
                  type="text"
                  required
                  maxLength={64}
                  placeholder="e.g. OrkaSecurity production"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputCls}
                />
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-gray-900 dark:text-[var(--text-primary)] block mb-1">Expires</label>
              {isRegen && (
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-[var(--text-secondary)] mb-2">
                  <input type="checkbox" checked={keepPeriod} onChange={(e) => setKeepPeriod(e.target.checked)} />
                  Keep the current key's expiry period
                </label>
              )}
              {(!isRegen || !keepPeriod) && (
                <>
                  <select value={expiry} onChange={(e) => setExpiry(e.target.value)} className={inputCls}>
                    {EXPIRY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {expiry === "never" && (
                    <p className="mt-1 text-xs text-amber-600">
                      A key that never expires stays valid until someone revokes it. Prefer an expiry and rotate.
                    </p>
                  )}
                </>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-gray-900 dark:text-[var(--text-primary)] block mb-1">
                Authenticator code
              </label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                pattern="\d{6}"
                maxLength={6}
                placeholder="6-digit code"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                className={`${inputCls} font-mono tracking-widest w-40`}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-[var(--text-tertiary)]">
                Required to create a long-lived credential.
              </p>
            </div>

            {error && <p className="text-sm text-brand-red">{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => onClose(false)}
                className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-[var(--border-default)] hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || mfaCode.length !== 6 || (!isRegen && !name.trim())}
                className="bg-brand-blue text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? "Working..." : isRegen ? "Regenerate" : "Generate"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function RevokeDialog({ target, onClose }) {
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const revoke = async () => {
    setWorking(true);
    setError("");
    try {
      await api.delete(`/api-keys/${target.id}`);
      onClose(true);
    } catch (e) {
      setError(errorText(e));
      setWorking(false);
    }
  };
  return (
    <div className="scrim" onClick={() => onClose(false)}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <div className="mt grow text-brand-red flex items-center gap-2 font-semibold">
            <Trash2 className="w-5 h-5" />
            Revoke "{target.name}"?
          </div>
        </div>
        <div className="modal-b space-y-4">
          <p className="text-sm text-gray-700 dark:text-[var(--text-secondary)]">
            OrkaSecurity will stop receiving audit logs immediately if it's using this key (…{target.last4}).
          </p>
          {error && <p className="text-sm text-brand-red">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => onClose(false)}
              className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-[var(--border-default)] hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={revoke}
              disabled={working}
              className="bg-brand-red hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
            >
              {working ? "Revoking..." : "Revoke"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const STATUS_STYLE = {
  ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  EXPIRED: "bg-gray-100 text-gray-700 dark:bg-[var(--bg-muted)] dark:text-[var(--text-secondary)]",
  REVOKED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

export default function IntegrationsTab() {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [dialog, setDialog] = useState(null); // { type: "create" | "regenerate" | "revoke", target? }

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/api-keys${showHistory ? "?include=all" : ""}`);
      setData(data);
      setLoadError("");
    } catch (e) {
      setLoadError(errorText(e));
    }
  }, [showHistory]);

  useEffect(() => {
    load();
  }, [load]);

  const closeDialog = useCallback(
    (changed) => {
      setDialog(null);
      if (changed) load();
    },
    [load],
  );

  const keys = data?.keys ?? [];
  const visible = showHistory ? keys : keys.filter((k) => k.status === "ACTIVE");
  const atLimit = data && data.activeCount >= data.maxActive;

  return (
    <div className="bg-white dark:bg-[var(--bg-surface)] shadow-sm rounded-lg overflow-hidden border border-gray-200 dark:border-[var(--border-subtle)] mb-6">
      <div className="px-6 py-5 border-b border-gray-200 dark:border-[var(--border-subtle)]">
        <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-[var(--text-primary)]">
          OrkaSecurity API keys
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-[var(--text-tertiary)]">
          OrkaSecurity pulls OrkaVault's audit log over a read-only API using one of these keys. A key can only read
          the audit log; it can't sign in or change anything. Send it only in the{" "}
          <code className="font-mono">Authorization: Bearer</code> header.
        </p>
        <div className="mt-3 flex gap-2 items-center">
          <input
            readOnly
            value={ENDPOINT}
            className="flex-1 min-w-0 border border-gray-300 dark:border-[var(--border-default)] rounded-md px-3 py-2 text-xs font-mono bg-gray-50 dark:bg-[var(--bg-canvas)]"
            aria-label="Endpoint"
          />
          <CopyButton text={ENDPOINT} />
        </div>
      </div>

      {data && !data.externalApiEnabled && (
        <div className="px-6 py-3 bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-900/30 text-sm text-amber-800 dark:text-amber-300">
          The external audit API is turned off on the server (kill switch), so every key is rejected right now. Keys
          can still be managed here. See DEVHELP.md to enable it.
        </div>
      )}
      {loadError && (
        <div className="px-6 py-3 bg-red-50 border-b border-red-100 text-sm text-brand-red">{loadError}</div>
      )}

      <div className="overflow-x-auto custom-scrollbar">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-[var(--border-subtle)] text-sm">
          <thead className="bg-gray-50 dark:bg-[var(--bg-canvas)]">
            <tr>
              {["Name", "Key", "Created", "Expires", "Last used", "Status", ""].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-[var(--text-tertiary)] uppercase whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-[var(--border-subtle)]">
            {!data ? (
              <tr>
                <td colSpan="7" className="px-4 py-4 text-center text-gray-500 dark:text-[var(--text-tertiary)]">
                  {loadError ? "—" : "Loading..."}
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan="7" className="px-4 py-4 text-center italic text-gray-500 dark:text-[var(--text-tertiary)]">
                  No {showHistory ? "" : "active "}keys.
                </td>
              </tr>
            ) : (
              visible.map((k) => {
                const active = k.status === "ACTIVE";
                return (
                  <tr key={k.id} className={active ? "" : "opacity-60"}>
                    <td className="px-4 py-3 text-gray-900 dark:text-[var(--text-primary)] whitespace-nowrap">{k.name}</td>
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">oksec_…{k.last4}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500 dark:text-[var(--text-tertiary)]">
                      {fmt(k.createdAt)}
                      {k.createdBy && (
                        <div className="text-xs">
                          by {k.createdBy.name}
                          {!k.createdBy.active && " (deactivated)"}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500 dark:text-[var(--text-tertiary)]">
                      {k.expiresAt ? fmt(k.expiresAt) : "Never"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500 dark:text-[var(--text-tertiary)]">
                      {fmtTime(k.lastUsedAt)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-sm text-xs font-medium ${STATUS_STYLE[k.status]}`}>
                        {k.status.charAt(0) + k.status.slice(1).toLowerCase()}
                      </span>
                      {k.status === "REVOKED" && k.revokedBy && (
                        <div className="text-xs text-gray-500 dark:text-[var(--text-tertiary)] mt-0.5">
                          by {k.revokedBy.name}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      {active && (
                        <div className="inline-flex gap-3">
                          <button
                            onClick={() => setDialog({ type: "regenerate", target: k })}
                            className="text-brand-blue hover:text-blue-700 inline-flex items-center gap-1"
                            title="Regenerate"
                          >
                            <RefreshCw className="h-4 w-4" /> Regenerate
                          </button>
                          <button
                            onClick={() => setDialog({ type: "revoke", target: k })}
                            className="text-brand-red hover:text-red-700 inline-flex items-center gap-1"
                            title="Revoke"
                          >
                            <Trash2 className="h-4 w-4" /> Revoke
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="px-6 py-4 bg-gray-50 dark:bg-[var(--bg-canvas)] flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-[var(--text-secondary)]">
          <input type="checkbox" checked={showHistory} onChange={(e) => setShowHistory(e.target.checked)} />
          Show history (revoked and expired keys)
        </label>
        <div className="flex items-center gap-3">
          {data && (
            <span className="text-xs text-gray-500 dark:text-[var(--text-tertiary)]">
              {atLimit
                ? `Maximum of ${data.maxActive} active API keys. Revoke one to create another.`
                : `${data.activeCount} of ${data.maxActive} active`}
            </span>
          )}
          <button
            onClick={() => setDialog({ type: "create" })}
            disabled={!data || atLimit}
            className="inline-flex items-center gap-1 bg-brand-blue text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <KeyRound className="h-4 w-4" /> Generate key
          </button>
        </div>
      </div>

      {dialog?.type === "create" && <KeyDialog onClose={closeDialog} />}
      {dialog?.type === "regenerate" && <KeyDialog target={dialog.target} onClose={closeDialog} />}
      {dialog?.type === "revoke" && <RevokeDialog target={dialog.target} onClose={closeDialog} />}
    </div>
  );
}
