import React, { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

export default function DashboardLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

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
