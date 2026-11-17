"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError, onAuthFailure } from "@/lib/api/client";
import type { Me } from "@/lib/api/types";
import { AuthContext, type AuthContextValue, type AuthStatus } from "./auth-provider";

export function StaffAuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Me | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [notice, setNotice] = useState<AuthContextValue["notice"]>(null);
  const qc = useQueryClient(); const generation = useRef(0);
  const inFlight = useRef<Promise<{ data: Me }> | null>(null);
  const loadSession = useCallback(async (fresh = false): Promise<Me | null> => {
    const seq = ++generation.current;
    // Share a pending mount/manual check, including React Strict Mode's effect replay.
    // Login always starts a new check so a pre-login 401 cannot determine its outcome.
    if (fresh || !inFlight.current) inFlight.current = apiRequest<Me>("/admin-auth/me", { admin: true, notifyAuthFailure: false });
    const pending = inFlight.current;
    try {
      const { data } = await pending;
      if (seq !== generation.current) return null;
      setProfile(data); setStatus("signedIn"); setNotice(null);
      return data;
    } catch (e) {
      if (seq !== generation.current) return null;
      const signedOut = e instanceof ApiError && e.status === 401;
      setProfile(null); setStatus(signedOut ? "signedOut" : "error");
      setNotice(signedOut ? null : { code: "ADMIN_CONNECTION", message: "Could not connect to administrator sign-in. Please retry." });
      return null;
    } finally { if (inFlight.current === pending) inFlight.current = null; }
  }, []);
  const refresh = useCallback(async () => { await loadSession(); }, [loadSession]);
  useEffect(() => {
    const session = generation;
    qc.clear(); void refresh();
    const off = onAuthFailure(() => { generation.current++; inFlight.current = null; setProfile(null); setStatus("signedOut"); setNotice(null); qc.clear(); });
    return () => { session.current++; off(); qc.clear(); };
  }, [refresh, qc]);
  const signInWithEmail: AuthContextValue["signInWithEmail"] = async (email, password) => {
    try {
      generation.current++; setNotice(null);
      await apiRequest("/admin-auth/login", { admin: true, method: "POST", body: { email, password }, notifyAuthFailure: false });
      qc.clear();
      const session = await loadSession(true);
      if (!session) return { ok: false, code: "ADMIN_SESSION_NOT_VERIFIED", message: "Your login was accepted, but the administrator session could not be verified. Check that cookies are allowed and the frontend and API use the same site, then try again." };
      return { ok: true };
    }
    catch (e) { return { ok: false, code: "ADMIN_LOGIN_FAILED", message: e instanceof ApiError ? e.message : "Administrator sign-in failed." }; }
  };
  const disabled = async () => ({ ok: false as const, code: "ADMIN_PASSWORD_ONLY", message: "Use administrator password sign-in." });
  return <AuthContext.Provider value={{ status, profile, user: profile ? { uid: profile.id, email: profile.email, displayName: profile.displayName, photoURL: null, providers: ["admin-password"] } : null, roles: profile?.roles ?? [], isStaff: !!profile?.isStaff, notice, clearNotice: () => setNotice(null), refresh, signInWithEmail, signInWith: disabled, register: disabled, completeProfile: disabled, checkVerification: async () => false, signOut: async () => { await apiRequest("/admin-auth/logout", { admin: true, method: "POST" }); generation.current++; setProfile(null); setStatus("signedOut"); qc.clear(); } }}>{children}</AuthContext.Provider>;
}
