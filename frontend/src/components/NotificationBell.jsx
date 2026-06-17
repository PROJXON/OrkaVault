import React, { useState, useEffect, useRef } from "react";
import { Bell } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";

// Map notification types to the page where the admin/user should go
const getNotifRoute = (type) => {
  switch (type) {
    case "ACCESS_REQUEST":
      return "/approvals";
    case "ACCESS_APPROVED":
    case "ACCESS_DENIED":
      return "/vault";
    case "NEW_ENTRY_QA":
      return "/vault";
    case "PASSWORD_WEAK":
    case "ROTATION_DUE":
      return "/health";
    case "OFFBOARDING_ALERT":
    case "REGISTRATION_APPROVED": // new registrations pending approval
      return "/users";
    default:
      return null;
  }
};

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const navigate = useNavigate();

  const fetchNotifications = async () => {
    try {
      const { data } = await api.get("/notifications");
      setNotifications(data);
    } catch (e) {
      console.error("Failed to fetch notifications");
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown when clicking anywhere outside the bell component
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleNotifClick = async (notif) => {
    // Mark as read
    try {
      await api.patch(`/notifications/${notif.id}/read`);
      setNotifications(
        notifications.map((n) => (n.id === notif.id ? { ...n, read: true } : n)),
      );
    } catch (e) {}

    // Navigate to the relevant page
    const route = getNotifRoute(notif.type);
    if (route) {
      setIsOpen(false);
      navigate(route);
    }
  };

  const markAllRead = async () => {
    try {
      await api.patch("/notifications/read-all");
      setNotifications(notifications.map((n) => ({ ...n, read: true })));
    } catch (e) {}
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-400 hover:text-gray-500 focus:outline-none"
      >
        <Bell className="h-6 w-6" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 block h-2.5 w-2.5 rounded-full bg-brand-red ring-2 ring-white" />
        )}
      </button>

      {isOpen && (
        <div className="origin-top-right absolute right-0 mt-2 w-80 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-50">
          <div className="p-4 border-b border-gray-100 flex justify-between items-center">
            <h3 className="text-sm font-medium text-gray-900">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-brand-blue hover:text-blue-700"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto custom-scrollbar">
            {notifications.length === 0 ? (
              <div className="p-4 text-sm text-gray-500 text-center">
                No notifications
              </div>
            ) : (
              notifications.map((notif) => {
                const hasRoute = !!getNotifRoute(notif.type);
                return (
                  <div
                    key={notif.id}
                    onClick={() => handleNotifClick(notif)}
                    className={`p-4 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors ${
                      !notif.read ? "bg-blue-50/50" : ""
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <p
                        className={`text-sm font-medium ${!notif.read ? "text-gray-900" : "text-gray-600"}`}
                      >
                        {notif.title}
                      </p>
                      {hasRoute && (
                        <span className="text-xs text-brand-blue ml-2 shrink-0 mt-0.5">
                          View →
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                      {notif.body}
                    </p>
                    <p className="text-xs text-gray-400 mt-2">
                      {format(new Date(notif.createdAt), "MMM d, yyyy, h:mm a")}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
