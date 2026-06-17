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
  User,
  Folder
} from "lucide-react";
import { useAuth } from "../lib/authContext";
import clsx from "clsx";
import logo from "../assets/OrkaVault.png";

export default function Sidebar() {
  const { user } = useAuth();
  const location = useLocation();

  const navigation = [
    {
      name: "Vault",
      href: "/vault",
      icon: Key,
      roles: ["HOLDER", "MANAGER", "ADMIN"],
    },
    {
      name: "Directory",
      href: "/directory",
      icon: Users,
      roles: ["ADMIN"],
    },
    {
      name: "My Requests",
      href: "/requests",
      icon: FileText,
      roles: ["HOLDER", "MANAGER"],
    },
    {
      name: "Approvals",
      href: "/approvals",
      icon: CheckSquare,
      roles: ["MANAGER", "ADMIN"],
    },
    {
      name: "My Collections",
      href: "/my-collections",
      icon: Folder,
      roles: ["MANAGER"],
    },
    { name: "Users & Roles", href: "/users", icon: Users, roles: ["ADMIN"] },
    { name: "Collections", href: "/collections", icon: Folder, roles: ["ADMIN"] },
    { name: "Health Audit", href: "/health", icon: Activity, roles: ["ADMIN"] },
    { name: "Audit Log", href: "/audit", icon: Shield, roles: ["ADMIN"] },
    { name: "Settings", href: "/settings", icon: Settings, roles: ["ADMIN"] },
  ];

  const allowedNav = navigation.filter((item) =>
    item.roles.includes(user.role),
  );

  const getInitials = (name) =>
    name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2) || "?";

  return (
    <div className="w-64 bg-navy-900 text-white flex flex-col h-full shadow-lg">
      <div className="flex items-center justify-center h-16 border-b border-navy-800 shrink-0 px-4">
        <img
          src={logo}
          alt="OrkaVault"
          className="h-9 w-auto object-contain"
          style={{ filter: "drop-shadow(0 0 6px rgba(255,255,255,0.25))" }}
        />
      </div>
      <div className="flex-1 overflow-y-auto py-4">
        <nav className="space-y-1 px-2">
          {allowedNav.map((item) => {
            const isActive = location.pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                to={item.href}
                className={clsx(
                  isActive
                    ? "bg-brand-teal text-white"
                    : "text-gray-300 hover:bg-navy-800 hover:text-white",
                  "group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors",
                )}
              >
                <item.icon
                  className={clsx(
                    isActive
                      ? "text-white"
                      : "text-gray-400 group-hover:text-gray-300",
                    "mr-3 flex-shrink-0 h-5 w-5",
                  )}
                  aria-hidden="true"
                />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Clickable profile area at bottom */}
      <Link
        to="/profile"
        className="p-4 border-t border-navy-800 bg-navy-900 shrink-0 flex items-center space-x-3 hover:bg-navy-800 transition-colors group"
        title="Edit my profile"
      >
        {user.avatarUrl ? (
          <img
            src={`http://localhost:5001${user.avatarUrl}`}
            alt="Avatar"
            className="w-9 h-9 rounded-full object-cover shrink-0 ring-2 ring-navy-800"
          />
        ) : (
          <img
            src={logo}
            alt="Default Avatar"
            className="w-9 h-9 rounded-full object-contain shrink-0 ring-2 ring-navy-800 bg-white"
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{user.name}</p>
          <p className="text-xs text-gray-400 capitalize">
            {user.role.toLowerCase()}
          </p>
        </div>
        <span className="text-gray-500 group-hover:text-gray-300 text-xs">→</span>
      </Link>
    </div>
  );
}
