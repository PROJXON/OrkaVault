import { useState, useEffect, useRef, useCallback } from "react";
import api from "./api";

// One reveal session per account, shared by everything that shows a
// secret for it (the password pill and each custom field row). A single
// POST /accounts/:id/reveal returns the password and every custom field
// value, so revealing/copying several of them costs one audit entry and
// one single-view window instead of one per item.
//
// `shown` tracks which items are visible on screen ("password" or a
// custom field id); the revealed data itself stays in memory until the
// screen window ends, the grant expires, the user clicks outside
// `containerRef`, or hideAll() — so a Copy never has to put a value on
// screen.
export default function useAccountReveal(accountId, { onGrantExpired, onRevealed } = {}) {
  const [data, setData] = useState(null); // { password, customFields: [{id,label,value}] }
  const [expired, setExpired] = useState(false);
  const [shown, setShown] = useState(() => new Set());
  const [screenTimeLeft, setScreenTimeLeft] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const containerRef = useRef(null);

  const dataRef = useRef(null);
  const inflightRef = useRef(null);
  const screenTimerRef = useRef(null);
  const screenCountRef = useRef(null);
  const grantTimerRef = useRef(null);
  const grantExpiredRef = useRef(false);
  const accountIdRef = useRef(accountId);
  accountIdRef.current = accountId;
  const callbacksRef = useRef({});
  callbacksRef.current = { onGrantExpired, onRevealed };

  const clearScreenTimers = () => {
    clearTimeout(screenTimerRef.current);
    clearInterval(screenCountRef.current);
  };

  const dropData = () => {
    dataRef.current = null;
    setData(null);
    setShown(new Set());
    setScreenTimeLeft(null);
  };

  const markExpired = () => {
    grantExpiredRef.current = true;
    clearScreenTimers();
    dropData();
    setExpired(true);
    callbacksRef.current.onGrantExpired?.();
  };

  // Fresh state per account; drop everything on unmount.
  useEffect(() => {
    grantExpiredRef.current = false;
    inflightRef.current = null;
    setExpired(false);
    setError("");
    setLoading(false);
    dropData();
    return () => {
      clearScreenTimers();
      clearTimeout(grantTimerRef.current);
    };
  }, [accountId]);

  // Returns the revealed data (fetching it if not already held), or null.
  const ensure = useCallback(async () => {
    if (dataRef.current) return dataRef.current;
    if (inflightRef.current) return inflightRef.current;
    const forAccount = accountId;
    const run = (async () => {
      setLoading(true);
      setError("");
      try {
        const { data: res } = await api.post(`/accounts/${forAccount}/reveal`);
        if (forAccount !== accountIdRef.current) return null; // switched accounts mid-request
        const { password, customFields, expiresIn, grantExpiresAt } = res;

        clearScreenTimers();
        clearTimeout(grantTimerRef.current);
        grantExpiredRef.current = false;
        const revealed = { password, customFields: customFields || [] };
        dataRef.current = revealed;
        setData(revealed);
        setExpired(false);
        callbacksRef.current.onRevealed?.(grantExpiresAt);

        // ── Screen security timer (≤90s, null = no limit for ONGOING/Admin) ──
        if (expiresIn !== null && expiresIn > 0) {
          let secs = expiresIn;
          setScreenTimeLeft(secs);
          screenCountRef.current = setInterval(() => {
            secs -= 1;
            setScreenTimeLeft(Math.max(0, secs));
            if (secs <= 0) clearInterval(screenCountRef.current);
          }, 1000);
          screenTimerRef.current = setTimeout(() => {
            clearScreenTimers();
            dropData();
          }, expiresIn * 1000);
        } else {
          setScreenTimeLeft(null);
        }

        // ── Grant expiry timer (null = ONGOING, never expires) ──
        if (grantExpiresAt) {
          const msRemaining = new Date(grantExpiresAt).getTime() - Date.now();
          if (msRemaining > 0) {
            grantTimerRef.current = setTimeout(markExpired, msRemaining);
          } else {
            markExpired();
            return null;
          }
        }
        return revealed;
      } catch (err) {
        if (err.response?.status === 403) {
          markExpired();
        } else {
          setError(err.response?.data?.error || "Failed to reveal");
        }
        return null;
      } finally {
        setLoading(false);
        if (inflightRef.current === run) inflightRef.current = null;
      }
    })();
    inflightRef.current = run;
    return run;
  }, [accountId]);

  const show = useCallback(async (key) => {
    const revealed = await ensure();
    if (revealed) setShown((prev) => new Set(prev).add(key));
    return revealed;
  }, [ensure]);

  const hide = useCallback((key) => {
    setShown((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  // Hide everything and forget the revealed values.
  const hideAll = useCallback(() => {
    clearScreenTimers();
    dropData();
  }, []);

  // Copies pick(data) without putting it on screen. Returns true on success.
  const copy = useCallback(async (pick) => {
    const revealed = await ensure();
    if (!revealed) return false;
    const value = pick(revealed);
    if (value == null) return false;
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      setError("Failed to copy to clipboard");
      return false;
    }
  }, [ensure]);

  // Auto-hide when the user clicks anywhere outside the protected area.
  useEffect(() => {
    if (!data) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        hideAll();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [data, hideAll]);

  return {
    data,
    expired,
    shown,
    screenTimeLeft,
    loading,
    error,
    setError,
    containerRef,
    show,
    hide,
    hideAll,
    copy,
  };
}

export const formatRevealTime = (secs) => {
  if (secs == null) return null;
  if (secs >= 3600) return `${Math.floor(secs / 3600)}h`;
  if (secs >= 60) return `${Math.floor(secs / 60)}m`;
  return `${secs}s`;
};
