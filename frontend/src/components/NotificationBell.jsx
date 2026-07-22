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
    <div className="menu-anchor" ref={containerRef}>
      <button onClick={() => setIsOpen(!isOpen)} className="iconbtn" aria-label="Alerts">
        <Bell width={18} height={18} />
        {unreadCount > 0 && <span className="badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>

      {isOpen && (
        <div className="menu right" style={{ width: 320, maxWidth: "calc(100vw - 24px)" }}>
          <div className="menu-label">
            <span>Alerts</span>
            {unreadCount > 0 && (
              <a onClick={markAllRead} style={{ cursor: "pointer" }}>Mark all read</a>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto scroll-area">
            {notifications.length === 0 ? (
              <div className="p-4 text-sm text-muted text-center">No notifications</div>
            ) : (
              notifications.map((notif) => {
                const hasRoute = !!getNotifRoute(notif.type);
                return (
                  <div key={notif.id} onClick={() => handleNotifClick(notif)} className={`notif ${notif.read ? "read" : ""}`}>
                    <span className="dotcol"><i /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between items-start gap-2">
                        <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{notif.title}</p>
                        {hasRoute && <span className="text-xs shrink-0 mt-0.5" style={{ color: "var(--brand-text)" }}>View →</span>}
                      </div>
                      <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>{notif.body}</p>
                      <p className="text-xs mt-1 text-muted">{format(new Date(notif.createdAt), "MMM d, yyyy, h:mm a")}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {selectedNotif && (
        <div className="scrim" onClick={() => setSelectedNotif(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-b">
              <div className="mt" style={{ marginBottom: 8 }}>{selectedNotif.title}</div>
              <p className="text-xs text-muted mb-4">
                {format(new Date(selectedNotif.createdAt), "MMMM d, yyyy 'at' h:mm a")}
              </p>
              <div className="text-sm p-4 rounded-md whitespace-pre-wrap" style={{ color: "var(--text-secondary)", background: "var(--bg-surface-sunken)", border: "1px solid var(--border-subtle)" }}>
                {selectedNotif.body}
              </div>
            </div>
            <div className="modal-f">
              <button onClick={() => setSelectedNotif(null)} className="btn btn-primary">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
