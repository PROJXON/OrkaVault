import React, { useMemo } from "react";
import { diffLines } from "diff";

// Line diff of two Markdown texts (Settings → Content: publish dialogs and
// history Compare). Plain text in <pre>-style lines, never rendered HTML.

const CONTEXT = 2; // unchanged lines kept around each change

function splitLines(value) {
  const lines = value.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** {changed: number of added + removed lines, headingChanged: a heading line was added or removed} */
export function diffStats(from, to) {
  let changed = 0;
  let headingChanged = false;
  for (const part of diffLines(from ?? "", to ?? "")) {
    if (!part.added && !part.removed) continue;
    const lines = splitLines(part.value);
    changed += lines.length;
    if (lines.some((l) => /^ {0,3}#{1,6}\s/.test(l))) headingChanged = true;
  }
  return { changed, headingChanged };
}

export default function LineDiff({ from, to, maxHeight = 360 }) {
  const rows = useMemo(() => {
    const out = [];
    const parts = diffLines(from ?? "", to ?? "");
    parts.forEach((part, i) => {
      const lines = splitLines(part.value);
      if (part.added || part.removed) {
        for (const line of lines) out.push({ type: part.added ? "add" : "del", line });
        return;
      }
      const keepHead = i === 0 ? 0 : CONTEXT;
      const keepTail = i === parts.length - 1 ? 0 : CONTEXT;
      if (lines.length <= keepHead + keepTail + 1) {
        for (const line of lines) out.push({ type: "same", line });
        return;
      }
      for (const line of lines.slice(0, keepHead)) out.push({ type: "same", line });
      out.push({ type: "skip", line: `… ${lines.length - keepHead - keepTail} unchanged lines …` });
      for (const line of lines.slice(lines.length - keepTail)) out.push({ type: "same", line });
    });
    return out;
  }, [from, to]);

  if (!rows.some((r) => r.type === "add" || r.type === "del")) {
    return <p className="text-sm text-[var(--text-tertiary)] italic">No text changes.</p>;
  }

  return (
    <div className="legal-diff py-1" style={{ maxHeight }} role="region" aria-label="Changes">
      {rows.map((r, i) => (
        <div key={i} className={`d-line ${r.type === "add" ? "d-add" : r.type === "del" ? "d-del" : r.type === "skip" ? "d-skip" : ""}`}>
          {r.type === "add" ? "+ " : r.type === "del" ? "− " : "  "}
          {r.line || " "}
        </div>
      ))}
    </div>
  );
}
