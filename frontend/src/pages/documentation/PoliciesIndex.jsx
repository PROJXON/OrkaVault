import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight, ScrollText } from "lucide-react";
import { formatVersion, useContent } from "../../lib/content";
import { DOC_POLICIES } from "./docsNav";

// /docs/policies (Phase 4d): the four policies with their current version.
function PolicyRow({ page, contentKey, label }) {
  const item = useContent(contentKey);
  return (
    <li className="card-flat p-4 flex items-center gap-4">
      <ScrollText width={20} height={20} className="shrink-0 text-[var(--text-tertiary)]" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-[var(--text-primary)]">{item?.title || label}</p>
        <p className="text-sm text-[var(--text-tertiary)]">
          {item?.version ? `Version ${formatVersion(item.version)}` : "Not loaded"}
        </p>
      </div>
      <Link to={`/docs/policies/${page}`} className="btn btn-secondary btn-sm">
        Open
        <ChevronRight width={14} height={14} />
      </Link>
    </li>
  );
}

export default function PoliciesIndex() {
  return (
    <div className="max-w-3xl mx-auto">
      <nav aria-label="Breadcrumb" className="mb-2 text-sm text-[var(--text-tertiary)]">
        <Link to="/docs" className="hover:text-[var(--brand-text)]">Documentation</Link>
      </nav>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Policies</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          The rules and notices that apply to everyone who uses OrkaVault. Each page shows the version in force now;
          earlier versions are linked from it.
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {DOC_POLICIES.map((p) => (
          <PolicyRow key={p.page} page={p.page} contentKey={p.key} label={p.label} />
        ))}
      </ul>
    </div>
  );
}
