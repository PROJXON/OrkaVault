import React from "react";

export default function HealthPill({ label }) {
  const colors = {
    WEAK: "bg-red-100 text-brand-red",
    MEDIUM: "bg-amber-100 text-brand-amber",
    STRONG: "bg-green-100 text-brand-green",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${colors[label] || "bg-gray-100 text-gray-800"}`}
    >
      {label?.toLowerCase()}
    </span>
  );
}
