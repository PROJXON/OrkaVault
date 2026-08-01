import React, { useState, useEffect, useRef } from "react";
import { Bell } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import api, { API_BASE_URL } from "../lib/api";

// Map notification types to the page where the admin/user should go
const getNotifRoute = (type) => {
  switch (type) {
    case "ACCESS_REQUEST":
      return "/approvals";
    case "ACCESS_APPROVED":
    case "ACCESS_DENIED":
    case "ACCESS_APPROVAL_EXPIRED":
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

// Must match the toast's CSS transition duration below, or dismissToast
// removes the element from the DOM before its fade-out finishes playing.
const TOAST_FADE_MS = 250;

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedNotif, setSelectedNotif] = useState(null);
  // In-app toasts — the guaranteed-visible half of "pop up on approval".
  // The native OS Notification below depends on browser/OS permission state
  // (and, on Windows/Electron, an AppUserModelID — see main.cjs) that can
  // silently be denied or dropped with no error; this doesn't, so it's the
  // primary way the user actually sees "approved" happen live.
  const [toasts, setToasts] = useState([]);
  const containerRef = useRef(null);
  const navigate = useNavigate();
  // null until the first fetch resolves — used to tell "already had this
  // notification" apart from "brand new since last poll" so we don't toast/
  // popup a user's entire pre-existing notification backlog on load.
  const knownIdsRef = useRef(null);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const dismissToast = (id) => {
    // Flip to "leaving" first so the fade-out transition actually plays,
    // then drop it from the array once the transition finishes.
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, phase: "leaving" } : t)));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), TOAST_FADE_MS);
  };

  const announceApproval = (n) => {
    setToasts((prev) => [...prev, { ...n, phase: "entering" }]);
    // Flip to "visible" on the next frame so the opacity/transform change
    // from the "entering" styles is a transition, not an instant jump.
    requestAnimationFrame(() => {
      setToasts((prev) => prev.map((t) => (t.id === n.id ? { ...t, phase: "visible" } : t)));
    });
    setTimeout(() => dismissToast(n.id), 6000);

    if ("Notification" in window && Notification.permission === "granted") {
      const popup = new Notification(n.title, { body: n.body });
      popup.onclick = () => {
        window.focus();
        navigate("/vault");
      };
    }
  };

  const fetchNotifications = async () => {
    try {
      const { data } = await api.get("/notifications");

      // knownIdsRef is null only before the very first fetch — skip
      // announcing on that pass so we don't replay a user's entire
      // pre-existing backlog as "new" on page load. On every pass after,
      // this is just the fallback path for a notification that arrived
      // while the SSE stream below was disconnected/reconnecting; the live
      // push is the fast path.
      if (knownIdsRef.current) {
        data
          .filter((n) => n.type === "ACCESS_APPROVED" && !knownIdsRef.current.has(n.id))
          .forEach(announceApproval);
      }
      knownIdsRef.current = new Set(data.map((n) => n.id));

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

  // Live push: an open SSE connection per logged-in tab, fed by
  // services/sseHub.ts on the backend whenever notifyUser() fires (e.g. an
  // admin approving a request). This is what makes the toast/popup appear
  // the instant it's approved instead of waiting for the 60s poll above —
  // that poll now only matters as a fallback while this connection is down/
  // reconnecting. EventSource can't set an Authorization header, so the
  // access token travels as a query param instead (see the route's comment
  // in backend/src/routes/misc.ts); it isn't re-opened on token refresh, so
  // a session that outlives one 8h access token reconnects on next reload.
  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token || typeof EventSource === "undefined") return;

    const es = new EventSource(`${API_BASE_URL}/notifications/stream?token=${encodeURIComponent(token)}`);
    es.onerror = () => {
      // EventSource retries on its own; this just makes a stuck/misconfigured
      // connection (bad CORS, backend down, etc.) visible in devtools instead
      // of silently doing nothing.
      console.warn("[NotificationBell] SSE connection error — browser will auto-retry.");
    };
    es.onmessage = (e) => {
      let notif;
      try {
        notif = JSON.parse(e.data);
      } catch {
        return;
      }
      knownIdsRef.current?.add(notif.id);
      setNotifications((prev) => (prev.some((n) => n.id === notif.id) ? prev : [notif, ...prev]));
      if (notif.type === "ACCESS_APPROVED") announceApproval(notif);
    };

    return () => es.close();
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

      {toasts.length > 0 && (
        // Anchored to the bell itself (same spot the Alerts dropdown opens
        // from, via .menu-anchor's position:relative on the wrapper), not
        // a viewport corner — so it visibly comes from the bell icon.
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            zIndex: "var(--z-popover)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            width: 320,
            maxWidth: "calc(100vw - 24px)",
          }}
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              onClick={() => {
                dismissToast(t.id);
                navigate("/vault");
              }}
              className="notif"
              style={{
                cursor: "pointer",
                background: "var(--bg-surface-raised)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                boxShadow: "var(--shadow-lg)",
                padding: 12,
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
                opacity: t.phase === "visible" ? 1 : 0,
                transform: t.phase === "visible" ? "translateY(0)" : "translateY(-6px)",
                transition: `opacity ${TOAST_FADE_MS}ms ease, transform ${TOAST_FADE_MS}ms ease`,
              }}
            >
              <span className="dotcol"><i /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{t.title}</p>
                <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>{t.body}</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  dismissToast(t.id);
                }}
                aria-label="Dismiss"
                style={{ color: "var(--text-tertiary)", lineHeight: 1, fontSize: 16, padding: 2 }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
