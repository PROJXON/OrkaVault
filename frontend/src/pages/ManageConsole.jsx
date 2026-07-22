import React from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckSquare, Folder, Users, Activity, Shield, Globe, Settings, ShieldCheck,
} from "lucide-react";
import { useAuth } from "../lib/authContext";

export default function ManageConsole() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const tiles = [
    { name: "Approvals", href: "/approvals", icon: CheckSquare, desc: "Review and act on pending access requests for accounts in your scope.", roles: ["MANAGER", "ADMIN"] },
    { name: "My Collections", href: "/my-collections", icon: Folder, desc: "Manage the account collections assigned to you.", roles: ["MANAGER"] },
    { name: "Directory", href: "/directory", icon: Globe, desc: "Browse the full organization directory.", roles: ["ADMIN"] },
    { name: "Users & Roles", href: "/users", icon: Users, desc: "Approve new users, manage roles, and offboard staff.", roles: ["ADMIN"] },
    { name: "Collections", href: "/collections", icon: Folder, desc: "Create and assign account collections to managers.", roles: ["ADMIN"] },
    { name: "Health Audit", href: "/health", icon: Activity, desc: "Review password health scores across the vault.", roles: ["ADMIN"] },
    { name: "Audit Log", href: "/audit", icon: Shield, desc: "Inspect the append-only action log for the organization.", roles: ["ADMIN"] },
    { name: "Workspace Activity", href: "/workspace-activity", icon: Globe, desc: "Monitor Google Workspace login and OAuth-grant activity.", roles: ["ADMIN"] },
    { name: "Settings", href: "/settings", icon: Settings, desc: "Configure org-wide policies, departments, and alerts.", roles: ["ADMIN"] },
  ].filter((t) => t.roles.includes(user.role));

  return (
    <div className="max-w-6xl mx-auto">
      <div className="admin-head">
        <div>
          <h1>Manage Console</h1>
          <p>
            High-level management for OrkaVault — approvals, collections, users and
            org-wide configuration live here, separate from your own vault.
          </p>
        </div>
        <span className="grow" />
        <span className="admin-badge">
          <ShieldCheck width={12} height={12} /> {user.role === "ADMIN" ? "Admin Mode" : "Manager Mode"}
        </span>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
        {tiles.map((tile) => (
          <button key={tile.name} className="admin-tile text-left" onClick={() => navigate(tile.href)}>
            <div className="at-ic"><tile.icon width={20} height={20} /></div>
            <div className="at-t">{tile.name}</div>
            <div className="at-d">{tile.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
