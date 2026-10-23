import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api from "./api";
import { CONTENT_REGISTRY } from "./contentRegistry";
import { setConsentVersion } from "./consent";

// Admin-editable policies and banners (Phase 4b). ContentProvider fetches
// GET /content/current once per page load (public, never drafts);
// useContent(key) reads one item. Components render it with
// <ContentMarkdown>, never as HTML.

const ContentContext = createContext({ status: "loading", items: {}, required: {}, refreshContent: async () => {} });

export function ContentProvider({ children }) {
  const [state, setState] = useState({ status: "loading", items: {}, required: {} });

  const load = useCallback(async (fresh) => {
    try {
      // The response is HTTP-cacheable for 60s; `t` bypasses that after a
      // publish or a stale-version 400.
      const { data } = await api.get("/content/current", fresh ? { params: { t: Date.now() } } : undefined);
      const items = Object.fromEntries((data.items || []).map((item) => [item.key, item]));
      const required = data.required || {};
      setState({ status: "ready", items, required });
      setConsentVersion(required.COOKIES);
    } catch {
      setState((s) => (s.status === "ready" ? s : { ...s, status: "error" }));
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  const refreshContent = useCallback(() => load(true), [load]);
  const value = useMemo(() => ({ ...state, refreshContent }), [state, refreshContent]);

  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
}

/** {status, items, required, refreshContent} */
export function useContentState() {
  return useContext(ContentContext);
}

/**
 * The current published item for `key`, or the registry fallback when the
 * API is unreachable. null while loading (or when there's no fallback), so
 * a banner never flashes its fallback before the real text arrives.
 */
export function useContent(key) {
  const { status, items } = useContext(ContentContext);
  if (items[key]) return items[key];
  if (status === "loading") return null;
  const fallback = CONTENT_REGISTRY[key]?.fallback;
  return fallback
    ? { key, version: null, title: null, body: fallback, draftBanner: false, requiresReacceptance: true, fallback: true }
    : null;
}

/** Version labels are ISO UTC timestamps (seeded v1 is the plain date "2026-10-23"); show them in local time. */
export function formatVersion(version) {
  if (!version) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(version)) return version;
  const d = new Date(version);
  return Number.isNaN(d.getTime()) ? version : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

export function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
