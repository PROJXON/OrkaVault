import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Shield,
  Key,
  FileText,
  CheckSquare,
  Users,
  Activity,
  Settings,
  Folder,
  Globe,
  ChevronLeft,
  LayoutGrid,
} from "lucide-react";
import { useAuth } from "../lib/authContext";
import clsx from "clsx";

export default function Sidebar({ mobileOpen, onClose }) {
  const { user } = useAuth();
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = React.useState(false);

  const workspaceNav = [
    { name: "Vault", href: "/vault", icon: Key, roles: ["USER", "MANAGER", "ADMIN"] },
    { name: "My Requests", href: "/requests", icon: FileText, roles: ["USER", "MANAGER"] },
  ];

  const manageNav = [
    { name: "Manage Console", href: "/manage", icon: LayoutGrid, roles: ["MANAGER", "ADMIN"] },
    { name: "Approvals", href: "/approvals", icon: CheckSquare, roles: ["MANAGER", "ADMIN"] },
    { name: "My Collections", href: "/my-collections", icon: Folder, roles: ["MANAGER"] },
    { name: "Directory", href: "/directory", icon: Users, roles: ["ADMIN"] },
    { name: "Users & Roles", href: "/users", icon: Users, roles: ["ADMIN"] },
    { name: "Collections", href: "/collections", icon: Folder, roles: ["ADMIN"] },
    { name: "Health Audit", href: "/health", icon: Activity, roles: ["ADMIN"] },
    { name: "Audit Log", href: "/audit", icon: Shield, roles: ["ADMIN"] },
    { name: "Workspace Activity", href: "/workspace-activity", icon: Globe, roles: ["ADMIN"] },
    { name: "Settings", href: "/settings", icon: Settings, roles: ["ADMIN"] },
  ];

  const allowed = (items) => items.filter((item) => item.roles.includes(user.role));
  const allowedWorkspace = allowed(workspaceNav);
  const allowedManage = allowed(manageNav);

  const renderGroup = (label, items) => (
    <div className="nav-group mb-2">
      <div className="nav-grouphead"><span className="gtxt">{label}</span></div>
      <div className="flex flex-col">
        {items.map((item) => {
          const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.name}
              to={item.href}
              className={clsx("navitem", isActive && "active")}
              data-tip={item.name}
              onClick={onClose}
            >
              <item.icon width={18} height={18} className="shrink-0" />
              <span className="label truncate">{item.name}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className={clsx("sidenav shrink-0 relative", isCollapsed && "collapsed", mobileOpen && "mobile-open")}>
      <div className="sidenav-scroll scroll-area flex-1 overflow-y-auto py-3 px-3">
        {renderGroup("Workspace", allowedWorkspace)}
        {allowedManage.length > 0 && renderGroup("Manage", allowedManage)}
      </div>

      <div style={{ borderTop: "1px solid var(--border-subtle)", padding: "10px 12px" }}>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="navitem hidden md:flex"
          style={{ color: "var(--text-tertiary)" }}
        >
          <ChevronLeft width={17} height={17} className={clsx("shrink-0 transition-transform", isCollapsed && "rotate-180")} />
          <span className="label">Collapse</span>
        </button>
      </div>
    </div>
  );
}
