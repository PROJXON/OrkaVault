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
      return "/health";
    case "OFFBOARDING_ALERT":
      return "/users";
    // ROTATION_DUE and REGISTRATION_APPROVED will return null to trigger the popup modal
    default:
      return null;
  }
};

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedNotif, setSelectedNotif] = useState(null);
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
    // Optimistic UI update
    setNotifications(
      notifications.map((n) => (n.id === notif.id ? { ...n, read: true } : n)),
    );
    try {
      await api.patch(`/notifications/${notif.id}/read`);
    } catch (e) {
      console.error("Failed to mark as read", e);
    }

    // Navigate to the relevant page OR open modal if no route
    const route = getNotifRoute(notif.type);
    setIsOpen(false);
    if (route) {
      navigate(route);
    } else {
      setSelectedNotif(notif);
    }
  };

  const markAllRead = async () => {
    // Optimistic UI update
    setNotifications(notifications.map((n) => ({ ...n, read: true })));
    try {
      await api.patch("/notifications/read-all");
    } catch (e) {
      console.error("Failed to mark all as read", e);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-400 hover:text-gray-500 focus:outline-none"
      >
        <Bell className="h-6 w-6" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-brand-red ring-2 ring-white text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
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
                    <p className="text-sm text-gray-500 mt-1">
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

      {selectedNotif && (
        <div className="fixed inset-0 z-[100] overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
            <div
              className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
              onClick={() => setSelectedNotif(null)}
            />
            <div className="relative inline-block w-full max-w-md p-6 overflow-hidden text-left align-middle transition-all transform bg-white rounded-lg shadow-xl sm:my-8">
              <h3 className="text-lg font-medium leading-6 text-gray-900 mb-2">
                {selectedNotif.title}
              </h3>
              <p className="text-xs text-gray-500 mb-4">
                {format(new Date(selectedNotif.createdAt), "MMMM d, yyyy 'at' h:mm a")}
              </p>
              <div className="text-sm text-gray-700 bg-gray-50 p-4 rounded-md border border-gray-100 whitespace-pre-wrap">
                {selectedNotif.body}
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setSelectedNotif(null)}
                  className="px-4 py-2 text-sm font-medium text-white bg-brand-blue border border-transparent rounded-md hover:bg-blue-700 focus:outline-none"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
