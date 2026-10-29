import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  fetchCurrentUser,
  loginRequest,
  logoutRequest,
  registerRequest,
  verifyEmailRequest,
} from "../lib/authApi.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [emailDeliveryReady, setEmailDeliveryReady] = useState(true);
  const [emailVerificationRequired, setEmailVerificationRequired] = useState(true);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  const refreshUser = useCallback(async () => {
    try {
      const next = await fetchCurrentUser();
      setUser(next.user);
      setEmailDeliveryReady(next.emailDeliveryReady);
      setEmailVerificationRequired(next.emailVerificationRequired);
      setAuthError(null);
      return next.user;
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
        setUser(next.user);
        setEmailDeliveryReady(next.emailDeliveryReady);
        setEmailVerificationRequired(next.emailVerificationRequired);
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

  /** Sign-up creates a pending account (the emailed code signs her in) — or, with verification off, signs in now. */
  const register = useCallback(async (payload) => {
    setAuthError(null);
    const result = await registerRequest(payload);
    if (result.signedIn) {
      setUser(result.user);
      setEmailVerificationRequired(false);
    }
    return result;
  }, []);

  const verifyEmail = useCallback(async (payload) => {
    setAuthError(null);
    const next = await verifyEmailRequest(payload);
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
      emailDeliveryReady,
      emailVerificationRequired,
      login,
      register,
      verifyEmail,
      logout,
      refreshUser,
      updateUser,
      setUser,
    }),
    [user, loading, authError, emailDeliveryReady, emailVerificationRequired, login, register, verifyEmail, logout, refreshUser, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
