import React, { createContext, useContext, useState, useEffect } from "react";
import api from "./api";

const AuthContext = createContext(null);

const ROLE_RANK = { USER: 0, MANAGER: 1, ADMIN: 2 };

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewAsRole, setViewAsRoleState] = useState(() => {
    try {
      return sessionStorage.getItem("viewAsRole") || null;
    } catch {
      return null;
    }
  });

  const setViewAsRole = (role) => {
    setViewAsRoleState(role);
    try {
      if (role) sessionStorage.setItem("viewAsRole", role);
      else sessionStorage.removeItem("viewAsRole");
    } catch {}
  };

  // Drop any active preview once the user is definitively logged out.
  useEffect(() => {
    if (!loading && !user) setViewAsRole(null);
  }, [loading, user]);

  const fetchUser = async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // One-time cleanup: older builds stored the access/refresh tokens in
    // localStorage. Auth is cookie-only now, so wipe any leftovers rather
    // than leave credentials readable by page scripts.
    try {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
    } catch {}
    fetchUser();
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    if (data.mfaRequired) {
      return data;
    }
    await fetchUser();
    return data;
  };

  // Re-reads /auth/me without flipping `loading`, so the screen doesn't
  // flash "Loading..." (used by the System Use Notice gate).
  const refreshUser = async () => {
    const { data } = await api.get("/auth/me");
    setUser(data);
    return data;
  };

  const register = async (name, email, password, department, startDate, setupToken) => {
    const { data } = await api.post("/auth/register", {
      name,
      email,
      password,
      department,
      startDate,
      setupToken,
    });
    return data;
  };

  const continueWithGoogle = async (credential) => {
    const { data } = await api.post("/auth/google", { credential });
    if (data.action === "login") {
      if (data.mfaRequired) {
        return data;
      }
      await fetchUser();
    }
    return data; // returns action ('login' | 'register') and data
  };

  const mfaVerify = async ({ tempToken, totpCode, signature, mfaDeviceId, deviceName, publicKey }) => {
    const { data } = await api.post("/auth/mfa/verify", {
      tempToken,
      totpCode,
      signature,
      mfaDeviceId,
      deviceName,
      publicKey
    });
    if (data.mfaDeviceId) {
      localStorage.setItem("mfaDeviceId", data.mfaDeviceId);
    }
    await fetchUser();
    return data;
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (e) {}
    setUser(null);
  };

  const realRole = user?.role || null;
  const canPreview = realRole === "ADMIN" || realRole === "MANAGER";
  // A preview only takes effect for a strictly lower role than the real one —
  // frontend-only: nav, role-gated controls and <ProtectedRoute> guards follow
  // this role, but the API still enforces the real role server-side.
  const activePreview =
    canPreview && viewAsRole && ROLE_RANK[viewAsRole] < ROLE_RANK[realRole]
      ? viewAsRole
      : null;
  const effectiveUser = activePreview ? { ...user, role: activePreview } : user;

  return (
    <AuthContext.Provider
      value={{
        user: effectiveUser,
        setUser,
        loading,
        login,
        register,
        logout,
        fetchUser,
        refreshUser,
        continueWithGoogle,
        mfaVerify,
        realUser: user,
        realRole,
        canPreview,
        viewAsRole: activePreview,
        setViewAsRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
