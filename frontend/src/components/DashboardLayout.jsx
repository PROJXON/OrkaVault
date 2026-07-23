import React, { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import { useAuth } from "../lib/authContext";

export default function DashboardLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();
  const { user, logout } = useAuth();

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  // If MFA is not enabled, hide the sidebar/topbar and show a simplified configuration layout
  if (user && !user.mfaEnabled) {
    return (
      <div className="flex flex-col h-screen overflow-hidden" style={{ background: "var(--bg-canvas)" }}>
        <header className="bg-white dark:bg-[var(--bg-surface)] border-b border-gray-200 dark:border-[var(--border-subtle)] px-6 py-4 flex items-center justify-between shadow-sm">
          <span className="text-xl font-extrabold text-gray-900 dark:text-[var(--text-primary)]">OrkaVault Security</span>
          <button 
            onClick={logout}
            className="text-xs text-brand-blue hover:text-blue-700 font-semibold"
          >
            Logout
          </button>
        </header>
        <main className="flex-1 relative overflow-y-auto focus:outline-none p-6 min-h-0">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg-canvas)" }}>
      <Sidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div
        className={`mobile-scrim ${mobileNavOpen ? "show" : ""}`}
        onClick={() => setMobileNavOpen(false)}
      />
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <TopBar onMenuClick={() => setMobileNavOpen((o) => !o)} />
        <main className="flex-1 relative overflow-y-auto focus:outline-none p-6 min-h-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
