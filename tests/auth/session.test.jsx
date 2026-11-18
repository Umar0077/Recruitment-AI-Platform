import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const state = vi.hoisted(() => ({ apiMode: true, auth: { currentUser: null }, getAuth: vi.fn(), me: vi.fn(), popup: vi.fn(), redirect: vi.fn(), logout: vi.fn(), login: vi.fn(), observer: null, tokenProvider: null, failure: null }));
vi.mock("@/lib/config/environment", () => ({ get isApiMode() { return state.apiMode; } }));
vi.mock("@/lib/firebase/client", () => ({ currentFirebaseAuth: () => state.auth, getFirebaseAuth: state.getAuth, isFirebaseConfigured: true, usingAuthEmulator: false }));
vi.mock("@/lib/firebase/password-auth", () => ({ signInWithPassword: state.login }));
vi.mock("@/lib/firebase/registration", () => ({ registerCandidate: vi.fn(), completeFirebaseName: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: class { setCustomParameters() {} }, getRedirectResult: vi.fn().mockResolvedValue(null), signInWithCredential: vi.fn(), signInWithPopup: state.popup, signInWithRedirect: state.redirect, signOut: state.logout,
  onAuthStateChanged: (_auth, listener) => { state.observer = listener; listener(state.auth.currentUser); return () => { state.observer = null; }; },
}));
vi.mock("@/lib/api", () => ({
  api: { auth: { me: state.me } }, ApiError: class extends Error { constructor(code, message, status) { super(message); this.code = code; this.status = status; } },
  onAuthFailure: fn => { state.failure = fn; return () => { state.failure = null; }; }, setTokenProvider: fn => { state.tokenProvider = fn; },
}));
import { AuthProvider, useAuth } from "@/lib/auth/auth-provider";
import { clearFreshLogin } from "@/lib/firebase/onboarding-session";
let current, query;
function Probe() { current = useAuth(); return <output>{current.status}</output>; }
function mount() { query = new QueryClient(); return render(<QueryClientProvider client={query}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>); }
const user = () => ({ uid: "fictional-user", email: "fictional@example.test", emailVerified: true, displayName: null, providerData: [{ providerId: "password" }], getIdToken: vi.fn().mockResolvedValue("fictional-token"), reload: vi.fn().mockResolvedValue() });
beforeEach(() => {
  vi.clearAllMocks(); clearFreshLogin(); localStorage.clear(); state.apiMode = true; state.auth.currentUser = null; state.observer = null; state.failure = null;
  state.getAuth.mockResolvedValue(state.auth); state.me.mockResolvedValue({ id: "app-user", displayName: "Fictional Person", roles: ["CANDIDATE"], permissions: [], isStaff: false, candidateId: null });
  state.popup.mockResolvedValue({}); state.login.mockResolvedValue({ ok: true });
  state.logout.mockImplementation(async () => { state.auth.currentUser = null; state.observer?.(null); });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe("Firebase session lifecycle", () => {
  it("recovers from stalled initialization and ignores its late completion", async () => {
    vi.useFakeTimers();
    let resolveAuth;
    state.getAuth.mockImplementationOnce(() => new Promise(resolve => { resolveAuth = resolve; }));
    mount(); expect(current.status).toBe("loading");
    await act(async () => vi.advanceTimersByTimeAsync(20000));
    expect(current.status).toBe("error"); expect(current.notice.message).toMatch(/reload/i);
    await act(async () => resolveAuth(state.auth));
    expect(current.status).toBe("error"); expect(state.observer).toBeNull(); expect(state.me).not.toHaveBeenCalled();
  });
  it("keeps a verified registration behind the fresh-login gate after page refresh", async () => {
    const u = user(); u.emailVerified = false; state.auth.currentUser = u; const view = mount();
    await screen.findByText("verificationRequired"); view.unmount(); u.emailVerified = true;
    mount(); await screen.findByText("verificationRequired"); expect(state.me).not.toHaveBeenCalled(); expect(await state.tokenProvider()).toBeNull();
    await act(() => current.checkVerification()); await screen.findByText("signedOut"); expect(state.me).not.toHaveBeenCalled();
  });
  it("requires profile completion when a verified Google account has no stored name", async () => {
    state.auth.currentUser = { ...user(), providerData: [{ providerId: "google.com" }] };
    state.me.mockResolvedValue({ id: "app-user", displayName: null, roles: ["CANDIDATE"], isStaff: false }); mount();
    await screen.findByText("profileRequired"); expect(current.user.displayName).toBeNull();
  });
  it("does not sign out an account switched while verification was in flight", async () => {
    const u = user(); u.emailVerified = false; state.auth.currentUser = u; mount(); await screen.findByText("verificationRequired");
    u.reload.mockImplementation(async () => { u.emailVerified = true; state.auth.currentUser = { ...user(), uid: "different-user" }; });
    await act(() => current.checkVerification()); expect(state.logout).not.toHaveBeenCalled();
  });
  it("restores a persisted Firebase identity and reloads backend authorization after refresh", async () => {
    state.auth.currentUser = user(); const view = mount();
    await screen.findByText("signedIn"); expect(state.me).toHaveBeenCalledTimes(1);
    view.unmount(); mount(); await screen.findByText("signedIn"); expect(state.me).toHaveBeenCalledTimes(2);
    expect(current.profile.roles).toEqual(["CANDIDATE"]);
  });
  it("refreshes assignment linkage without unmounting the signed-in candidate form", async () => {
    state.auth.currentUser = user(); mount(); await screen.findByText("signedIn");
    let resolveProfile;
    state.me.mockImplementationOnce(() => new Promise(resolve => { resolveProfile = resolve; }));
    let pending;
    await act(async () => { pending = current.refresh(true); });
    expect(current.status).toBe("signedIn"); expect(current.profile.candidateId).toBeNull();
    await act(async () => { resolveProfile({ ...current.profile, candidateId: "new-candidate" }); await pending; });
    expect(current.status).toBe("signedIn"); expect(current.profile.candidateId).toBe("new-candidate");
  });
  it("obtains cached/fresh tokens through the SDK for API requests", async () => {
    const u = user(); state.auth.currentUser = u; mount(); await screen.findByText("signedIn");
    expect(await state.tokenProvider(false)).toBe("fictional-token"); await state.tokenProvider(true);
    expect(u.getIdToken).toHaveBeenCalledWith(true);
  });
  it("blocks unverified sessions and API tokens until verification is refreshed", async () => {
    const u = user(); u.emailVerified = false; state.auth.currentUser = u; mount();
    await screen.findByText("verificationRequired"); expect(state.me).not.toHaveBeenCalled(); expect(await state.tokenProvider()).toBeNull();
    u.reload.mockImplementation(async () => { u.emailVerified = true; });
    await act(() => current.refresh()); await screen.findByText("verificationRequired"); expect(state.me).not.toHaveBeenCalled();
    await act(() => current.checkVerification()); await screen.findByText("signedOut"); expect(u.getIdToken).toHaveBeenCalledWith(true); expect(state.me).not.toHaveBeenCalled();
    state.auth.currentUser = u; await act(async () => { await current.signInWithEmail(u.email, "fictional-password"); state.observer(u); }); await screen.findByText("signedIn");
  });
  it("signs out and drops cached records and roles", async () => {
    state.auth.currentUser = user(); mount(); await screen.findByText("signedIn"); query.setQueryData(["private"], { secret: "fictional" });
    await act(() => current.signOut()); await screen.findByText("signedOut");
    expect(current.profile).toBeNull(); expect(query.getQueryData(["private"])).toBeUndefined(); expect(await state.tokenProvider()).toBeNull();
  });
  it("invalidates a revoked or disabled session reported by the backend", async () => {
    state.auth.currentUser = user(); mount(); await screen.findByText("signedIn");
    await act(async () => state.failure({ code: "ACCOUNT_DISABLED" })); await screen.findByText("signedOut");
    expect(current.notice.message).toContain("disabled");
  });
  it("keeps Google popup sign-in and redirect fallback", async () => {
    mount(); await screen.findByText("signedOut");
    await act(() => current.signInWith("google.com")); expect(state.popup).toHaveBeenCalledTimes(1);
    state.popup.mockRejectedValueOnce({ code: "auth/popup-blocked" });
    await act(() => current.signInWith("google.com")); expect(state.redirect).toHaveBeenCalledTimes(1);
  });
  it("does not initialize Firebase or backend sessions in demo mode", async () => {
    state.apiMode = false; mount(); await screen.findByText("demo");
    await act(() => current.signInWith("google.com"));
    expect(state.getAuth).not.toHaveBeenCalled(); expect(state.me).not.toHaveBeenCalled();
  });
  it("drops an old account's records before loading the next account", async () => {
    state.auth.currentUser = user(); mount(); await screen.findByText("signedIn"); query.setQueryData(["private"], "old-user-data");
    const next = { ...user(), uid: "second-fictional-user" }; state.auth.currentUser = next;
    await act(async () => state.observer(next));
    await waitFor(() => expect(current.user.uid).toBe(next.uid)); expect(query.getQueryData(["private"])).toBeUndefined();
  });
  it("recovers a failed backend profile load when signing in again as the same UID", async () => {
    state.auth.currentUser = user(); state.me.mockRejectedValueOnce(new Error("fictional network failure"));
    mount(); await screen.findByText("error");
    await act(() => current.signInWithEmail("fictional@example.test", "fictional-password"));
    await screen.findByText("signedIn"); expect(state.me).toHaveBeenCalledTimes(2);
  });
});

