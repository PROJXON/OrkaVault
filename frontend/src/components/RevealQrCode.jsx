import React, { useState, useEffect, useRef } from "react";
import { QrCode, CheckCircle } from "lucide-react";
import api from "../lib/api";

export default function RevealQrCode({ accountId, isAdmin, onGrantExpired }) {
  const [phase, setPhase] = useState("idle"); // idle | revealed | expired
  const [qrCodeBase64, setQrCodeBase64] = useState(null);
  const [screenTimeLeft, setScreenTimeLeft] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const screenTimerRef = useRef(null);
  const grantTimerRef = useRef(null);
  const screenCountRef = useRef(null);
  const grantExpiredRef = useRef(false);

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
      const { data } = await api.post(`/accounts/${accountId}/reveal-qr`);
      const { qrCodeBase64: qr, expiresIn, grantExpiresAt } = data;

      clearScreenTimers();
      if (grantTimerRef.current) {
        clearTimeout(grantTimerRef.current);
      }
      grantExpiredRef.current = false;
      setQrCodeBase64(qr);
      setPhase("revealed");

      if (expiresIn !== null && expiresIn > 0) {
        let secs = expiresIn;
        setScreenTimeLeft(secs);

        screenCountRef.current = setInterval(() => {
          secs -= 1;
          setScreenTimeLeft(Math.max(0, secs));
          if (secs <= 0) clearInterval(screenCountRef.current);
        }, 1000);

        screenTimerRef.current = setTimeout(() => {
          setQrCodeBase64(null);
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
            setQrCodeBase64(null);
            setScreenTimeLeft(null);
            setPhase("expired");
            if (onGrantExpired) onGrantExpired();
          }, msRemaining);
        } else {
          grantExpiredRef.current = true;
          setQrCodeBase64(null);
          setPhase("expired");
          if (onGrantExpired) onGrantExpired();
        }
      }
    } catch (err) {
      if (err.response?.status === 403) {
        setPhase("expired");
        if (onGrantExpired) onGrantExpired();
      } else {
        setError(err.response?.data?.error || "Failed to reveal QR code");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDone = () => {
    clearScreenTimers();
    setQrCodeBase64(null);
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

  // Expired — hide the QR button entirely (parent shows Request Access)
  if (phase === "expired" && !isAdmin) return null;

  // Revealed — modal overlay
  if (phase === "revealed" && qrCodeBase64) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
        <div className="bg-white p-6 rounded-lg shadow-xl text-center relative max-w-md w-full mx-4">
          <div className="absolute top-4 right-4 flex items-center space-x-3">
            {screenTimeLeft !== null && screenTimeLeft > 0 && (
              <div className="flex items-center justify-center min-w-[36px] px-2 h-8 rounded-full bg-amber-100 border border-amber-300 text-sm font-bold text-amber-600 shadow-sm shrink-0">
                {formatTime(screenTimeLeft)}
              </div>
            )}
            <button
              onClick={handleDone}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-green-100 border border-green-300 text-green-600 hover:bg-green-200 transition-colors shrink-0"
              title="Done"
            >
              <CheckCircle className="h-4 w-4" />
            </button>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Authenticator QR Code</h3>
          <div
            className="flex justify-center"
            onCopy={(e) => e.preventDefault()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <img
              src={qrCodeBase64.startsWith('data:') ? qrCodeBase64 : `data:image/png;base64,${qrCodeBase64}`}
              alt="TOTP QR Code"
              className="w-48 h-48 select-none"
              style={{ userSelect: "none", WebkitUserSelect: "none" }}
              draggable={false}
            />
          </div>
          <p className="mt-4 text-xs text-gray-500">Scan with your authenticator app. Do not screenshot.</p>
        </div>
      </div>
    );
  }

  // Idle — QR icon button
  return (
    <button
      onClick={handleReveal}
      disabled={loading}
      className="p-1 text-brand-blue hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
      title="View QR Code"
    >
      <QrCode className="h-4 w-4" />
      {error && <span className="text-xs text-brand-red ml-1">{error}</span>}
    </button>
  );
}
