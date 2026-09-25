import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  fetchCurrentUser,
  loginRequest,
  logoutRequest,
  registerRequest,
} from "../lib/authApi.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  const refreshUser = useCallback(async () => {
    try {
      const next = await fetchCurrentUser();
      setUser(next);
      setAuthError(null);
      return next;
    } catch (err) {
      setUser(null);
      setAuthError(err);
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const next = await fetchCurrentUser();
        if (!active) return;
        setUser(next);
        setAuthError(null);
      } catch (err) {
        if (!active) return;
        setUser(null);
        setAuthError(err);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (payload) => {
    setAuthError(null);
    const next = await loginRequest(payload);
    setUser(next);
    return next;
  }, []);

  const register = useCallback(async (payload) => {
    setAuthError(null);
    const next = await registerRequest(payload);
    if (!next?.id) {
      throw new Error("השרת לא החזיר משתמש תקין");
    }
    setUser(next);
    return next;
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      setUser(null);
      setAuthError(null);
    }
  }, []);

  const updateUser = useCallback((partial) => {
    setUser((prev) => (prev ? { ...prev, ...partial } : partial));
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      authError,
      authenticated: Boolean(user?.id),
      login,
      register,
      logout,
      refreshUser,
      updateUser,
      setUser,
    }),
    [user, loading, authError, login, register, logout, refreshUser, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
