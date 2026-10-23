import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileCheck } from "lucide-react";
import api from "../lib/api";
import { formatDateTime, formatVersion, useContentState } from "../lib/content";
import { CONTENT_REGISTRY, legalPath } from "../lib/contentRegistry";

// Profile → "My agreements" (Phase 4b): every policy version this user
// accepted, newest first per policy, each linking to that exact text.
// From GET /content/me/acceptances (the caller's own rows only).

const VIA_LABEL = { registration: "At registration", gate: "After an update" };
const ORDER = ["TERMS", "PRIVACY", "NOTICE", "COOKIES"];

export default function MyAgreements() {
  const { items } = useContentState();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/content/me/acceptances")
      .then(({ data }) => setRows(data))
      .catch(() => setError("Couldn't load your agreements."));
  }, []);

  const groups = rows
    ? ORDER.map((key) => ({ key, rows: rows.filter((r) => r.key === key) })).filter((g) => g.rows.length)
    : [];

  return (
    <div className="bg-white dark:bg-[var(--bg-surface)] rounded-lg shadow-xs border border-gray-200 dark:border-[var(--border-subtle)] p-6 mt-6">
      <h2 className="text-sm font-semibold text-gray-700 dark:text-[var(--text-secondary)] uppercase tracking-wider mb-2 flex items-center gap-2">
        <FileCheck className="w-4 h-4" />
        My agreements
      </h2>
      <p className="text-sm text-gray-500 dark:text-[var(--text-tertiary)] mb-4">
        The policy versions you accepted, and when. Each link opens the exact text you agreed to.
      </p>

      {error ? (
        <p className="text-sm text-brand-red">{error}</p>
      ) : !rows ? (
        <p className="text-sm text-gray-500 dark:text-[var(--text-tertiary)]">Loading…</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-[var(--text-tertiary)] italic">No recorded agreements yet.</p>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map(({ key, rows: list }) => {
            const current = items[key];
            const page = CONTENT_REGISTRY[key]?.page;
            const path = legalPath(key);
            return (
              <div key={key}>
                <h3 className="text-sm font-semibold text-gray-800 dark:text-[var(--text-primary)] mb-2">
                  {current?.title || list[0].title || key}
                </h3>
                <ul className="divide-y divide-gray-100 dark:divide-[var(--border-subtle)] border border-gray-200 dark:border-[var(--border-subtle)] rounded-md">
                  {list.map((r, i) => {
                    const isCurrent = current?.version === r.version;
                    // Inside the app every pending re-acceptance is already
                    // done, so a newer current version can only be a minor fix.
                    const minorSince = i === 0 && current && !isCurrent;
                    return (
                      <li key={`${r.version}-${r.acceptedAt}`} className="px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <span className="font-medium text-gray-900 dark:text-[var(--text-primary)]">
                          Version {formatVersion(r.version)}
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-sm bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400">
                            Current
                          </span>
                        )}
                        <span className="text-gray-500 dark:text-[var(--text-tertiary)]">
                          Accepted {formatDateTime(r.acceptedAt)} · {VIA_LABEL[r.via] || r.via}
                        </span>
                        <span className="ml-auto flex items-center gap-3">
                          {minorSince && path && (
                            <Link to={path} className="text-xs text-gray-500 dark:text-[var(--text-tertiary)] hover:underline">
                              Minor updates since — view current
                            </Link>
                          )}
                          {page && (
                            <Link
                              to={`/legal/${page}/versions/${encodeURIComponent(r.version)}`}
                              className="text-brand-blue hover:underline"
                            >
                              View
                            </Link>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
