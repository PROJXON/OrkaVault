import React from "react";
import { useAuth } from "../lib/authContext";
import NotificationBell from "./NotificationBell";
import { LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function TopBar() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-6 shrink-0 shadow-sm">
      <div className="flex-1" />
      <div className="flex items-center space-x-6">
        <NotificationBell />
        <div className="h-6 w-px bg-gray-200" />
        <button
          onClick={handleLogout}
          className="flex items-center text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
        >
          <LogOut className="h-5 w-5 mr-2" />
          Sign out
        </button>
      </div>
    </header>
  );
}
