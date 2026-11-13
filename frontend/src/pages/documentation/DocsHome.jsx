import React from "react";
import { Link } from "react-router-dom";
import { Code2, HelpCircle, ScrollText } from "lucide-react";
import { useAuth } from "../../lib/authContext";
import { DOC_POLICIES } from "./docsNav";

// /docs (Phase 4d): entry point for the Documentation section.
function DocCard({ to, icon: Icon, title, children, badge }) {
  const inner = (
    <>
      <div className="flex items-center gap-3 mb-2">
        <Icon width={20} height={20} className="shrink-0 text-[var(--brand-text)]" />
        <h2 className="font-semibold text-[var(--text-primary)]">{title}</h2>
        {badge && <span className="badge-pill ml-auto">{badge}</span>}
      </div>
      <div className="text-sm text-[var(--text-secondary)]">{children}</div>
    </>
  );
  if (!to) {
    return (
      <div className="card p-5 opacity-60" aria-disabled="true">
        {inner}
      </div>
    );
  }
  return (
    <Link to={to} className="card p-5 block transition-colors hover:border-[var(--border-strong)]">
      {inner}
    </Link>
  );
}

export default function DocsHome() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Documentation</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">Policies, integration guides and answers about OrkaVault.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* UX only: GET /api/docs/rest-api is the real ADMIN gate. */}
        {isAdmin && (
          <DocCard to="/docs/api" icon={Code2} title="REST API" badge="Admins">
            Read-only audit log API for authorized security-monitoring applications: authentication, endpoints,
            polling, errors and the audit action catalog.
          </DocCard>
        )}
        <DocCard to="/docs/policies" icon={ScrollText} title="Policies">
          {DOC_POLICIES.map((p) => p.label).join(" · ")}
        </DocCard>
        <DocCard icon={HelpCircle} title="FAQs" badge="Coming soon">
          Answers to common questions about requesting and using shared credentials.
        </DocCard>
      </div>
    </div>
  );
}
