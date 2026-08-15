import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Search, Sun, Moon, LogOut, UserRound, ShieldCheck, Vault as VaultIcon, Menu } from "lucide-react";
import { useAuth } from "../lib/authContext";
import { useTheme } from "../lib/themeContext";
import NotificationBell from "./NotificationBell";
import logoMark from "../assets/OrkaVault.ico";

export default function TopBar({ onMenuClick }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setSearch(location.pathname === "/vault" ? params.get("q") || "" : "");
  }, [location.pathname, location.search]);

  useEffect(() => {
    const onClick = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const canManage = user.role === "MANAGER" || user.role === "ADMIN";
  const inManageMode = !location.pathname.startsWith("/vault");

  const submitSearch = (e) => {
    e.preventDefault();
    navigate(search ? `/vault?q=${encodeURIComponent(search)}` : "/vault");
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const getInitials = (name) =>
    name?.split(" ").map((n) => n[0]).join("").toUpperCase().substring(0, 2) || "?";

  const avatarSrc = user.avatarUrl
    ? user.avatarUrl.startsWith("http")
      ? user.avatarUrl
      : `${import.meta.env.VITE_API_URL?.replace(/\/api\/?$/, "") || ""}${user.avatarUrl}`
    : null;

  return (
    <header className="topnav">
      <button className="iconbtn hamburger" aria-label="Menu" onClick={onMenuClick}>
        <Menu width={20} height={20} />
      </button>

      <Link to="/vault" className="brand-mark shrink-0">
        <span className="brand-dot">
          <img src={logoMark} alt="" className="w-[22px] h-[22px] object-contain" />
        </span>
        <span className="brand-name">Orka<b>Vault</b></span>
      </Link>

      <div className="flex-1 flex items-center min-w-0" style={{ gap: "var(--space-3)" }}>
        <form onSubmit={submitSearch} className="globalsearch hidden sm:block">
          <Search className="gs-ico" width={16} height={16} />
          <input
            placeholder="Search the vault…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search accounts"
          />
        </form>
      </div>

      {canManage && (
        <div className="role-toggle" role="tablist" aria-label="View mode">
          <button
            role="tab"
            className={!inManageMode ? "on" : ""}
            onClick={() => navigate("/vault")}
          >
            <VaultIcon width={14} height={14} />
            <span className="hidden sm:inline">Vault</span>
          </button>
          <button
            role="tab"
            className={inManageMode ? "on admin" : ""}
            onClick={() => navigate("/manage")}
          >
            <ShieldCheck width={14} height={14} />
            <span className="hidden sm:inline">Manage</span>
          </button>
        </div>
      )}

      <div className="flex items-center" style={{ gap: 6 }}>
        <label className="theme-switch" title="Toggle light / dark">
          <span className="sw" onClick={toggleTheme} />
          {theme === "dark" ? <Moon className="ti" width={15} height={15} /> : <Sun className="ti" width={15} height={15} />}
        </label>

        <NotificationBell />

        <div className="menu-anchor" ref={profileRef}>
          <button
            className="iconbtn"
            style={{ width: 38 }}
            onClick={() => setProfileOpen((o) => !o)}
            aria-label="Profile"
          >
            {avatarSrc ? (
              <img src={avatarSrc} alt="" className="w-[30px] h-[30px] rounded-full object-cover" />
            ) : (
              <span className="avatar" style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(140deg,var(--orka-blue-500),var(--orka-blue-800))", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "var(--fs-2xs)", fontWeight: "var(--fw-bold)" }}>
                {getInitials(user.name)}
              </span>
            )}
          </button>
          <div className={`menu right ${profileOpen ? "" : "hidden"}`}>
            <div className="flex items-center gap-2.5 px-2.5 py-2">
              {avatarSrc ? (
                <img src={avatarSrc} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
              ) : (
                <span style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(140deg,var(--orka-blue-500),var(--orka-blue-800))", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "var(--fs-xs)", fontWeight: "var(--fw-bold)" }}>
                  {getInitials(user.name)}
                </span>
              )}
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{user.name}</div>
                <div className="text-xs truncate" style={{ color: "var(--text-tertiary)" }}>{user.email}</div>
              </div>
            </div>
            <div className="menu-sep" />
            <Link to="/profile" className="menu-item" onClick={() => setProfileOpen(false)}>
              <UserRound width={16} height={16} /> Profile
            </Link>
            <button className="menu-item" onClick={handleLogout}>
              <LogOut width={16} height={16} /> Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
