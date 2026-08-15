import React from "react";

export default function HealthPill({ label }) {
  const tone = {
    WEAK: "lo",
    MEDIUM: "mid",
    STRONG: "hi",
    SSO: "info",
  };

  return (
    <span className={`health-tag ${tone[label] || "mid"}`}>
      <i />
      {label?.toLowerCase()}
    </span>
  );
}
