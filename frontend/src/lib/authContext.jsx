import React, { createContext, useContext, useState, useEffect } from "react";
import api from "./api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

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
    fetchUser();
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    if (data.mfaRequired) {
      return data;
    }
    localStorage.setItem("accessToken", data.accessToken);
    localStorage.setItem("refreshToken", data.refreshToken);
    await fetchUser();
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
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("refreshToken", data.refreshToken);
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
    localStorage.setItem("accessToken", data.accessToken);
    localStorage.setItem("refreshToken", data.refreshToken);
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

  return (
    <AuthContext.Provider
      value={{ user, setUser, loading, login, register, logout, fetchUser, continueWithGoogle, mfaVerify }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
