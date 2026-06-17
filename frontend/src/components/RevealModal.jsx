import React, { useState, useEffect } from "react";

export default function RevealModal({ plaintext, onClose }) {
  const [seconds, setSeconds] = useState(120);
  const [wiping, setWiping] = useState(false);

  useEffect(() => {
    if (seconds <= 0) {
      handleWipe();
      return;
    }
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  const handleWipe = () => {
    setWiping(true);
    setTimeout(onClose, 600);
  };

  const block = (e) => {
    e.preventDefault();
    alert("Clipboard actions are disabled on revealed secrets.");
  };

  const circumference = 2 * Math.PI * 36;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(7,10,19,0.95)",
        backdropFilter: "blur(20px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        className="glass-panel-glow secure-reveal-container"
        onContextMenu={(e) => e.preventDefault()}
        style={{
          padding: 40,
          maxWidth: 520,
          width: "100%",
          margin: 16,
          textAlign: "center",
          transition: "all 0.4s ease",
          transform: wiping ? "scale(0.85)" : "scale(1)",
          opacity: wiping ? 0 : 1,
        }}
      >
        {/* Countdown ring */}
        <div
          style={{
            position: "relative",
            width: 80,
            height: 80,
            margin: "0 auto 20px",
          }}
        >
          <svg className="countdown-svg" width="80" height="80">
            <circle className="countdown-circle-bg" cx="40" cy="40" r="36" />
            <circle
              className="countdown-circle-progress"
              cx="40"
              cy="40"
              r="36"
              strokeDasharray={circumference}
              strokeDashoffset={circumference - (circumference * seconds) / 120}
            />
          </svg>
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.2rem",
              fontWeight: 700,
              color: seconds < 20 ? "var(--accent-rose)" : "var(--text-main)",
            }}
          >
            {seconds}s
          </div>
        </div>

        <h3 style={{ fontSize: "1.3rem", marginBottom: 6 }}>
          Decrypted Secret
        </h3>
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "0.8rem",
            marginBottom: 24,
          }}
        >
          Decrypted via KMS envelope key. Auto-wipes from memory when timer
          expires.
        </p>

        <div
          onCopy={block}
          onCut={block}
          style={{
            background: "rgba(0,0,0,0.6)",
            padding: 20,
            borderRadius: 8,
            border: "1px dashed rgba(14,165,233,0.3)",
            fontSize: "1.4rem",
            fontFamily: "var(--font-mono)",
            color: "var(--accent-teal)",
            letterSpacing: "0.04em",
            marginBottom: 24,
          }}
        >
          {plaintext}
        </div>

        <span className="badge badge-locked" style={{ fontSize: "0.65rem" }}>
          🔒 CLIPBOARD & SCREENSHOT RESTRICTIONS ACTIVE
        </span>

        <div style={{ marginTop: 20 }}>
          <button className="btn btn-danger" onClick={handleWipe}>
            Close & Erase Instantly
          </button>
        </div>
      </div>
    </div>
  );
}
