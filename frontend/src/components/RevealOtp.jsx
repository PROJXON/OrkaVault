import React, { useState, useEffect, useRef } from "react";
import { Timer, ShieldOff, CheckCircle, Copy, Check } from "lucide-react";
import api from "../lib/api";

// Shows the current 6-digit TOTP code for an account's authenticator seed
// (the raw QR image itself is admin-only — see AdminQrModal). The code
// rotates every 30s; while revealed, this silently re-fetches a fresh
// code at each rotation boundary so what's on screen is always valid.
export default function RevealOtp({ accountId, isAdmin, onRequestAccess, onGrantExpired }) {
  const [phase, setPhase] = useState("idle"); // idle | revealed | expired
  const [otp, setOtp] = useState(null);
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(null);
  const [screenTimeLeft, setScreenTimeLeft] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const screenTimerRef = useRef(null);
  const grantTimerRef = useRef(null);
  const screenCountRef = useRef(null);
  const otpCountRef = useRef(null);
  const otpRefreshRef = useRef(null);
  const copiedTimerRef = useRef(null);
  const grantExpiredRef = useRef(false);

  const handleCopy = async () => {
    if (!otp) return;
    try {
      await navigator.clipboard.writeText(otp);
      setCopied(true);
      clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Failed to copy to clipboard");
    }
  };

  const clearOtpTimers = () => {
    clearTimeout(otpRefreshRef.current);
    clearInterval(otpCountRef.current);
  };

  const clearScreenTimers = () => {
    clearTimeout(screenTimerRef.current);
    clearInterval(screenCountRef.current);
    clearOtpTimers();
  };

  const clearAllTimers = () => {
    clearScreenTimers();
    clearTimeout(grantTimerRef.current);
    clearTimeout(copiedTimerRef.current);
  };

  const armOtpRotation = (secondsRemaining) => {
    clearOtpTimers();
    let secs = secondsRemaining;
    setOtpSecondsLeft(secs);

    otpCountRef.current = setInterval(() => {
      secs -= 1;
      setOtpSecondsLeft(Math.max(0, secs));
      if (secs <= 0) clearInterval(otpCountRef.current);
    }, 1000);

    // When this code rotates, silently fetch the next one (screen/grant
    // timers above are unaffected and keep counting down independently).
    otpRefreshRef.current = setTimeout(fetchNextOtp, secondsRemaining * 1000);
  };

  const fetchNextOtp = async () => {
    try {
      const { data } = await api.post(`/accounts/${accountId}/reveal-otp`);
      setOtp(data.otp);
      armOtpRotation(data.secondsRemaining);
    } catch (err) {
      // Grant may have expired between rotations — let the normal
      // expiry handling in handleReveal's catch cover the 403 case
      // on next manual reveal; for a silent background refresh we
      // just stop rotating quietly.
      clearOtpTimers();
    }
  };

  const handleReveal = async () => {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post(`/accounts/${accountId}/reveal-otp`);
      const { otp: token, secondsRemaining, expiresIn, grantExpiresAt } = data;

      clearScreenTimers();
      if (grantTimerRef.current) {
        clearTimeout(grantTimerRef.current);
      }
      grantExpiredRef.current = false;
      setOtp(token);
      setPhase("revealed");
      armOtpRotation(secondsRemaining);

      if (expiresIn !== null && expiresIn > 0) {
        let secs = expiresIn;
        setScreenTimeLeft(secs);

        screenCountRef.current = setInterval(() => {
          secs -= 1;
          setScreenTimeLeft(Math.max(0, secs));
          if (secs <= 0) clearInterval(screenCountRef.current);
        }, 1000);

        screenTimerRef.current = setTimeout(() => {
          clearOtpTimers();
          setOtp(null);
          setScreenTimeLeft(null);
          setPhase(grantExpiredRef.current ? "expired" : "idle");
        }, expiresIn * 1000);
      } else {
        setScreenTimeLeft(null);
      }

      if (grantExpiresAt) {
        const msRemaining = new Date(grantExpiresAt).getTime() - Date.now();
        if (msRemaining > 0) {
          grantTimerRef.current = setTimeout(() => {
            grantExpiredRef.current = true;
            clearScreenTimers();
            setOtp(null);
            setScreenTimeLeft(null);
            setPhase("expired");
            if (onGrantExpired) onGrantExpired();
          }, msRemaining);
        } else {
          grantExpiredRef.current = true;
          setOtp(null);
          setPhase("expired");
          if (onGrantExpired) onGrantExpired();
        }
      }
    } catch (err) {
      if (err.response?.status === 403) {
        setPhase("expired");
        if (onGrantExpired) onGrantExpired();
      } else {
        setError(err.response?.data?.error || "Failed to generate OTP");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDone = () => {
    clearScreenTimers();
    setOtp(null);
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

  // Expired — hide the OTP button entirely (parent shows Request Access)
  if (phase === "expired" && !isAdmin) return null;

  // Revealed — inline pill, same footprint as RevealPassword
  if (phase === "revealed" && otp) {
    return (
      <div
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
          className="font-mono text-gray-900 text-sm tracking-widest hover:bg-amber-100 rounded px-1 -mx-1 transition-colors flex items-center gap-1"
          style={{ userSelect: "none", WebkitUserSelect: "none", MozUserSelect: "none" }}
        >
          {otp.slice(0, 3)} {otp.slice(3)}
          {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3 opacity-50" />}
        </button>
        {copied && <span className="text-xs text-green-600 font-medium">Copied!</span>}
        {otpSecondsLeft !== null && (
          <span className="text-xs text-amber-600" title="Time until this code rotates">
            ({otpSecondsLeft}s)
          </span>
        )}
        {screenTimeLeft !== null && screenTimeLeft > 0 && (
          <div className="flex items-center justify-center min-w-[36px] px-1.5 h-7 rounded-full bg-white border border-amber-300 text-xs font-bold text-amber-600 shadow-sm shrink-0">
            {formatTime(screenTimeLeft)}
          </div>
        )}
        <button
          onClick={handleDone}
          className="flex items-center justify-center w-7 h-7 rounded-full bg-green-100 border border-green-300 text-green-600 hover:bg-green-200 transition-colors shrink-0"
          title="Done — hide code now"
        >
          <CheckCircle className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // Idle — OTP icon button
  return (
    <div className="flex items-center space-x-2 justify-end">
      <button
        onClick={handleReveal}
        disabled={loading}
        className="p-1 text-brand-blue hover:bg-blue-50 rounded transition-colors disabled:opacity-50 inline-flex items-center gap-1 text-xs font-medium"
        title="Show current OTP"
      >
        <Timer className="h-4 w-4" /> OTP
      </button>
      {error && <span className="text-xs text-brand-red ml-2">{error}</span>}
    </div>
  );
}
