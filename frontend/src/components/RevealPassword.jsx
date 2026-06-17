import React, { useState, useEffect, useRef } from "react";
import { Eye, ShieldOff, CheckCircle } from "lucide-react";
import api from "../lib/api";

export default function RevealPassword({ accountId, isAdmin, onRequestAccess, onGrantExpired }) {
  const [phase, setPhase] = useState("idle"); // idle | revealed | expired
  const [password, setPassword] = useState(null);
  const [screenTimeLeft, setScreenTimeLeft] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const screenTimerRef = useRef(null);
  const grantTimerRef = useRef(null);
  const screenCountRef = useRef(null);
  const grantExpiredRef = useRef(false); // set true when grant truly expires

  const clearScreenTimers = () => {
    clearTimeout(screenTimerRef.current);
    clearInterval(screenCountRef.current);
  };

  const clearAllTimers = () => {
    clearScreenTimers();
    clearTimeout(grantTimerRef.current);
  };

  const handleReveal = async () => {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post(`/accounts/${accountId}/reveal`);
      const { password: pw, expiresIn, grantExpiresAt } = data;

      clearScreenTimers();
      // Only clear grant timer if we're setting a new one
      if (grantTimerRef.current) {
        clearTimeout(grantTimerRef.current);
      }
      grantExpiredRef.current = false;
      setPassword(pw);
      setPhase("revealed");

      // ── Screen security timer (≤90s display, null = infinite for ONGOING/Admin) ──
      if (expiresIn !== null && expiresIn > 0) {
        let secs = expiresIn;
        setScreenTimeLeft(secs);

        screenCountRef.current = setInterval(() => {
          secs -= 1;
          setScreenTimeLeft(Math.max(0, secs));
          if (secs <= 0) clearInterval(screenCountRef.current);
        }, 1000);

        screenTimerRef.current = setTimeout(() => {
          setPassword(null);
          setScreenTimeLeft(null);
          // If grant already expired → keep showing "expired" (Request Access)
          // Otherwise → go idle (eye) so user can re-reveal within their grant window
          setPhase(grantExpiredRef.current ? "expired" : "idle");
        }, expiresIn * 1000);
      } else {
        setScreenTimeLeft(null); // no screen timer for ONGOING / Admin
      }

      // ── Grant expiry timer (null = ONGOING, never expires) ──
      if (grantExpiresAt) {
        const msRemaining = new Date(grantExpiresAt).getTime() - Date.now();
        if (msRemaining > 0) {
          grantTimerRef.current = setTimeout(() => {
            grantExpiredRef.current = true;
            clearScreenTimers(); // cancel screen timer so it can't overwrite "expired"
            setPassword(null);
            setScreenTimeLeft(null);
            setPhase("expired");
            if (onGrantExpired) onGrantExpired();
          }, msRemaining);
        } else {
          // Grant already past due
          grantExpiredRef.current = true;
          setPassword(null);
          setPhase("expired");
          if (onGrantExpired) onGrantExpired();
        }
      }
    } catch (err) {
      if (err.response?.status === 403) {
        setPhase("expired");
        if (onGrantExpired) onGrantExpired();
      } else {
        setError(err.response?.data?.error || "Failed to reveal password");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDone = () => {
    clearScreenTimers();
    setPassword(null);
    setScreenTimeLeft(null);
    setPhase(grantExpiredRef.current ? "expired" : "idle");
  };

  useEffect(() => () => clearAllTimers(), []);

  const formatTime = (secs) => {
    if (secs == null) return null;
    if (secs >= 3600) return `${Math.floor(secs / 3600)}h`;
    if (secs >= 60) return `${Math.floor(secs / 60)}m`;
    return `${secs}s`;
  };

  // ── EXPIRED: Admin can never be expired from the UI ───────────────────────
  if (phase === "expired" && !isAdmin) {
    // We render null here because Vault.jsx parent will unmount us immediately
    // when we call onGrantExpired() and it flips hasGrant to false.
    return null;
  }

  // ── REVEALED ──────────────────────────────────────────────────────────────
  if (phase === "revealed" && password) {
    return (
      <div
        className="inline-flex items-center space-x-2 bg-amber-50 px-3 py-1.5 rounded-md border border-amber-200"
        onCopy={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
      >
        <ShieldOff className="h-3.5 w-3.5 text-amber-500 shrink-0" />
        <span
          className="font-mono text-gray-900 text-sm"
          style={{ userSelect: "none", WebkitUserSelect: "none", MozUserSelect: "none" }}
        >
          {password}
        </span>
        {screenTimeLeft !== null && screenTimeLeft > 0 && (
          <div className="flex items-center justify-center min-w-[36px] px-1.5 h-7 rounded-full bg-white border border-amber-300 text-xs font-bold text-amber-600 shadow-sm shrink-0">
            {formatTime(screenTimeLeft)}
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
      <span className="text-gray-400 select-none tracking-widest">••••••••</span>
      <button
        onClick={handleReveal}
        disabled={loading}
        className="p-1 text-brand-blue hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
        title="View Password"
      >
        <Eye className="h-4 w-4" />
      </button>
      {error && <span className="text-xs text-brand-red ml-2">{error}</span>}
    </div>
  );
}
