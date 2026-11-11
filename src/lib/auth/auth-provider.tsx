"use client";
/**
 * InterviewOS authentication context (API mode only).
 *
 * Firebase proves WHO the user is; the backend (`GET /auth/me`) decides WHAT they may do.
 * Roles shown here are only for hiding UI — every request is authorised again on the server.
 * In demo mode this provider is inert (status "demo") and the isolated demo login is used instead.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { isApiMode } from "@/lib/config/environment";
import { currentFirebaseAuth, getFirebaseAuth, isFirebaseConfigured, usingAuthEmulator } from "@/lib/firebase/client";

/** Marks that this tab started a redirect sign-in, so a lost result can be reported instead of ignored. */
const REDIRECT_FLAG = "interviewos-auth-redirect";
const flag = {
  set: () => { try { sessionStorage.setItem(REDIRECT_FLAG, "1"); } catch { /* storage unavailable */ } },
  take: () => { try { const v = sessionStorage.getItem(REDIRECT_FLAG); sessionStorage.removeItem(REDIRECT_FLAG); return v === "1"; } catch { return false; } },
};
import { authErrorCode, authErrorMessage, CANCEL_CODES, REDIRECT_FALLBACK_CODES, type SignInOutcome } from "@/lib/firebase/errors";
import { api, ApiError, onAuthFailure, setTokenProvider, type Me, type RoleCode } from "@/lib/api";

export type AuthStatus = "demo" | "unconfigured" | "loading" | "signedOut" | "signedIn" | "error";
/** Google is the only sign-in provider. */
export type SocialProvider = "google.com";

export interface AuthNotice {
  code: string;
  message: string;
}

interface AuthContextValue {
  status: AuthStatus;
  /** Firebase identity (no tokens). */
  user: { uid: string; email: string | null; displayName: string | null; providers: string[] } | null;
  /** Application user from the backend: roles and permissions live here. */
  profile: Me | null;
  roles: RoleCode[];
  isStaff: boolean;
  /** Last sign-in / session problem to show on the login screens. */
  notice: AuthNotice | null;
  clearNotice: () => void;
  signInWith: (provider: SocialProvider) => Promise<SignInOutcome>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function makeGoogleProvider() {
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: "select_account" });
  return p;
}

/**
 * DEVELOPMENT + AUTH EMULATOR ONLY: lets automated browser checks sign in through the real Firebase SDK
 * without an OAuth popup. The emulator accepts unsigned fake IdP tokens; real Firebase rejects them.
 * Never attached in production builds (usingAuthEmulator is always false there).
 */
function exposeEmulatorFixture() {
  (window as unknown as Record<string, unknown>).__interviewosEmulatorSignIn = async (email: string, sub = email) => {
    const auth = await getFirebaseAuth();
    const cred = GoogleAuthProvider.credential(JSON.stringify({ sub, email, email_verified: true }));
    const r = await signInWithCredential(auth, cred);
    return r.user.uid;
  };
}

const toUser = (u: User) => ({ uid: u.uid, email: u.email, displayName: u.displayName, providers: u.providerData.map((p) => p.providerId) });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const initial: AuthStatus = !isApiMode ? "demo" : !isFirebaseConfigured ? "unconfigured" : "loading";
  const [status, setStatus] = useState<AuthStatus>(initial);
  const [user, setUser] = useState<AuthContextValue["user"]>(null);
  const [profile, setProfile] = useState<Me | null>(null);
  const [notice, setNotice] = useState<AuthNotice | null>(null);
  const loadSeq = useRef(0);
  const queryClient = useQueryClient();
  const lastUid = useRef<string | null>(null);

  const loadProfile = useCallback(async (u: User | null) => {
    const seq = ++loadSeq.current;
    // Account switch or sign-out: drop every cached record so nothing leaks between users.
    if ((u?.uid ?? null) !== lastUid.current) {
      queryClient.clear();
      lastUid.current = u?.uid ?? null;
    }
    if (!u) {
      setUser(null);
      setProfile(null);
      setStatus("signedOut");
      return;
    }
    setUser(toUser(u));
    setStatus("loading");
    try {
      const me = await api.auth.me();
      if (seq !== loadSeq.current) return;
      setProfile(me);
      setStatus("signedIn");
    } catch (e) {
      if (seq !== loadSeq.current) return;
      const err = e instanceof ApiError ? e : new ApiError("UNKNOWN", "Something went wrong.", 0);
      if (err.status === 401 || err.code === "ACCOUNT_DISABLED") {
        // onAuthFailure already signed the user out and set the notice.
        return;
      }
      setProfile(null);
      setNotice({ code: err.code, message: err.code === "AUTH_NOT_CONFIGURED" ? "Sign-in is not available on the server yet." : err.message });
      setStatus("error");
    }
  }, [queryClient]);

  // Session restoration + observer cleanup.
  useEffect(() => {
    if (initial !== "loading") return;
    let unsub: (() => void) | undefined;
    let cancelled = false;
    setTokenProvider(async (force) => {
      const u = currentFirebaseAuth()?.currentUser;
      if (!u) return null;
      try {
        return await u.getIdToken(force);
      } catch {
        // Refresh refused (disabled/deleted user, revoked session, offline): send no token; the 401 ends the session.
        return null;
      }
    });
    void getFirebaseAuth()
      .then(async (auth) => {
        // Finish a redirect sign-in started earlier (popup-blocked fallback or mobile).
        const startedRedirect = flag.take();
        try {
          const result = await getRedirectResult(auth);
          if (startedRedirect && !result && !auth.currentUser) {
            // Typically third-party storage blocking when authDomain is not this site's own domain.
            setNotice({ code: "auth/redirect-lost", message: "Sign-in didn't complete in this browser. Allow pop-ups for this site and try again." });
          }
        } catch (e) {
          const code = authErrorCode(e);
          if (!CANCEL_CODES.has(code)) setNotice({ code, message: authErrorMessage(code) });
        }
        if (cancelled) return;
        // The NODE_ENV check lets production builds drop the fixture code entirely.
        if (process.env.NODE_ENV !== "production" && usingAuthEmulator) exposeEmulatorFixture();
        unsub = onAuthStateChanged(auth, (u) => void loadProfile(u));
      })
      .catch(() => {
        setNotice({ code: "auth/init-failed", message: "Sign-in couldn't start. Check your connection and reload." });
        setStatus("error");
      });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [initial, loadProfile]);

  // Backend says the session or account is no longer valid → sign out locally.
  useEffect(() => {
    if (!isApiMode) return;
    return onAuthFailure((err) => {
      setNotice(
        err.code === "ACCOUNT_DISABLED"
          ? { code: err.code, message: "This account has been disabled. Contact the recruitment team." }
          : { code: err.code, message: "Your session has ended. Please sign in again." },
      );
      const auth = currentFirebaseAuth();
      if (auth) void fbSignOut(auth);
    });
  }, []);

  // The provider argument keeps call sites explicit; Google is the only supported provider.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const signInWith = useCallback(async (_provider: SocialProvider): Promise<SignInOutcome> => {
    setNotice(null);
    let auth;
    try {
      auth = await getFirebaseAuth();
    } catch {
      return { ok: false, code: "auth/not-configured", message: "Sign-in isn't configured for this environment yet." };
    }
    const provider = makeGoogleProvider();
    try {
      await signInWithPopup(auth, provider);
      return { ok: true };
    } catch (e) {
      const code = authErrorCode(e);
      if (CANCEL_CODES.has(code)) return { ok: false, cancelled: true, code, message: authErrorMessage(code) };
      if (REDIRECT_FALLBACK_CODES.has(code)) {
        try {
          flag.set();
          await signInWithRedirect(auth, provider);
          return { ok: false, redirecting: true, code, message: authErrorMessage(code) };
        } catch (e2) {
          const c2 = authErrorCode(e2);
          return { ok: false, code: c2, message: authErrorMessage(c2) };
        }
      }
      return { ok: false, code, message: authErrorMessage(code) };
    }
  }, []);

  const signOut = useCallback(async () => {
    setNotice(null);
    const auth = currentFirebaseAuth();
    if (auth) await fbSignOut(auth);
  }, []);

  const refresh = useCallback(async () => {
    const u = currentFirebaseAuth()?.currentUser ?? null;
    if (u) {
      await u.reload().catch(() => undefined);
      await u.getIdToken(true).catch(() => undefined);
    }
    await loadProfile(u);
  }, [loadProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      profile,
      roles: profile?.roles ?? [],
      isStaff: !!profile?.isStaff,
      notice,
      clearNotice: () => setNotice(null),
      signInWith,
      signOut,
      refresh,
    }),
    [status, user, profile, notice, signInWith, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>.");
  return ctx;
}

/** Only same-site relative paths are accepted as post-login destinations. */
export function safeNext(raw: string | null | undefined, fallback: string) {
  return raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\") ? raw : fallback;
}
