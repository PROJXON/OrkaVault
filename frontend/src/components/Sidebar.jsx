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
import api from "../lib/api";
import { NAV_BADGES_REFRESH_EVENT } from "../lib/navBadges";
import LegalLinks from "./LegalLinks";
import clsx from "clsx";

export default function Sidebar({ mobileOpen, onClose }) {
  const { user } = useAuth();
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const [pendingUserCount, setPendingUserCount] = React.useState(0);
  const [pendingApprovalCount, setPendingApprovalCount] = React.useState(0);

  // Badges on "Approvals" (access requests this Manager/Admin can act on) and
  // "Users & Roles" (registrations awaiting approval, Admin-only). Both are
  // cheap count endpoints; polled so actions elsewhere clear the badge within
  // a minute, and refreshed immediately on NAV_BADGES_REFRESH_EVENT.
  React.useEffect(() => {
    const isStaff = user.role === "MANAGER" || user.role === "ADMIN";
    const isAdmin = user.role === "ADMIN";
    if (!isStaff) setPendingApprovalCount(0);
    if (!isAdmin) setPendingUserCount(0);
    if (!isStaff) return;

    let cancelled = false;
    const load = async () => {
      // Each count fails independently — leave the previous value in place on
      // a transient failure.
      const [approvals, users] = await Promise.allSettled([
        api.get("/requests/pending-count"),
        isAdmin ? api.get("/users/pending-count") : Promise.resolve(null),
      ]);
      if (cancelled) return;
      if (approvals.status === "fulfilled") setPendingApprovalCount(approvals.value.data.count);
      if (isAdmin && users.status === "fulfilled") setPendingUserCount(users.value.data.count);
    };
    load();
    const id = setInterval(load, 60000);
    window.addEventListener(NAV_BADGES_REFRESH_EVENT, load);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener(NAV_BADGES_REFRESH_EVENT, load);
    };
  }, [user.role, location.pathname]);

  const workspaceNav = [
    { name: "Vault", href: "/vault", icon: Key, roles: ["USER", "MANAGER", "ADMIN"] },
    { name: "My Requests", href: "/requests", icon: FileText, roles: ["USER", "MANAGER"] },
  ];

  const manageNav = [
    { name: "Manage Console", href: "/manage", icon: LayoutGrid, roles: ["MANAGER", "ADMIN"] },
    { name: "Approvals", href: "/approvals", icon: CheckSquare, roles: ["MANAGER", "ADMIN"], badge: pendingApprovalCount, badgeTitle: "pending access requests" },
    { name: "My Collections", href: "/my-collections", icon: Folder, roles: ["MANAGER"] },
    { name: "Directory", href: "/directory", icon: Users, roles: ["ADMIN"] },
    { name: "Users & Roles", href: "/users", icon: Users, roles: ["ADMIN"], badge: pendingUserCount, badgeTitle: "registrations awaiting approval" },
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
              {item.badge > 0 && (
                <span className="nav-badge" title={`${item.badge} ${item.badgeTitle}`}>
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              )}
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
        <LegalLinks className="sidenav-legal px-[11px] pb-2" onNavigate={onClose} />
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
