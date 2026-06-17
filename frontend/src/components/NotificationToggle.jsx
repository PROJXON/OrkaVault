import React, { useState } from "react";
import { useAuth } from "../lib/authContext";
import api from "../lib/api";

export default function NotificationToggle() {
  const { user, setUser } = useAuth();
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const { data } = await api.patch("/users/me/notifications", {
        notificationsOn: !user.notificationsOn,
      });
      setUser({ ...user, notificationsOn: data.notificationsOn });
    } catch (e) {
      console.error("Failed to toggle notifications");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center space-x-2">
      <span className="text-sm text-gray-500">Email Alerts</span>
      <button
        type="button"
        onClick={toggle}
        disabled={loading}
        className={`${
          user.notificationsOn ? "bg-brand-teal" : "bg-gray-200"
        } relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50`}
      >
        <span
          className={`${
            user.notificationsOn ? "translate-x-4" : "translate-x-0"
          } pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
        />
      </button>
    </div>
  );
}
