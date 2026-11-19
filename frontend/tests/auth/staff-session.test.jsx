import { StrictMode, createContext, useContext } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ request: vi.fn(), listeners: new Set() }));
vi.mock("@/lib/auth/auth-provider", () => ({ AuthContext: createContext(null) }));
vi.mock("@/lib/api/client", () => ({
  apiRequest: state.request,
  ApiError: class extends Error { constructor(code, message, status) { super(message); this.code = code; this.status = status; } },
  onAuthFailure: fn => { state.listeners.add(fn); return () => state.listeners.delete(fn); },
}));
import { AuthContext } from "@/lib/auth/auth-provider";
import { ApiError } from "@/lib/api/client";
import { StaffAuthProvider } from "@/lib/auth/staff-auth-provider";
let current, query;
const unauthorized = () => new ApiError("UNAUTHENTICATED", "Sign in required", 401);
const profile = { id: "fictional-staff", email: "fictional@example.test", displayName: "Fictional staff", roles: ["SUPER_ADMIN"], isStaff: true, mustChangePassword: true };
function Probe() { current = useContext(AuthContext); return <output>{current.status}</output>; }
function mount() { query = new QueryClient(); return render(<StrictMode><QueryClientProvider client={query}><StaffAuthProvider><Probe /></StaffAuthProvider></QueryClientProvider></StrictMode>); }
beforeEach(() => { state.request.mockReset().mockRejectedValue(unauthorized()); state.listeners.clear(); });
afterEach(cleanup);
it("deduplicates Strict Mode mount checks and treats a pre-login 401 as quiet signed-out state", async () => {
  mount(); await screen.findByText("signedOut");
  expect(state.request).toHaveBeenCalledTimes(1); expect(current.notice).toBeNull(); expect(current.profile).toBeNull();
  expect(state.request).toHaveBeenCalledWith("/admin-auth/me", { admin: true, notifyAuthFailure: false });
  await act(async () => { await Promise.resolve(); }); expect(state.request).toHaveBeenCalledTimes(1);
});
it("clears a previous connection notice when an explicit retry finds no session", async () => {
  state.request.mockRejectedValueOnce(new ApiError("NETWORK_ERROR", "offline", 0));
  mount(); await screen.findByText("error"); expect(current.notice).not.toBeNull();
  await act(() => current.refresh()); expect(current.status).toBe("signedOut"); expect(current.notice).toBeNull(); expect(state.request).toHaveBeenCalledTimes(2);
});
it("requires POST login then a successful fresh me before reporting login success", async () => {
  mount(); await screen.findByText("signedOut");
  state.request.mockResolvedValueOnce({ data: { authenticated: true } }).mockResolvedValueOnce({ data: profile });
  let outcome; await act(async () => { outcome = await current.signInWithEmail("fictional@example.test", "fictional-only"); });
  expect(outcome).toEqual({ ok: true }); expect(current.profile.mustChangePassword).toBe(true);
  expect(state.request.mock.calls.map(c => c[0])).toEqual(["/admin-auth/me", "/admin-auth/login", "/admin-auth/me"]);
});
it("reports a nonpersistent cookie after POST success instead of pretending login succeeded or retrying", async () => {
  mount(); await screen.findByText("signedOut");
  state.request.mockResolvedValueOnce({ data: { authenticated: true } }).mockRejectedValueOnce(unauthorized());
  let outcome; await act(async () => { outcome = await current.signInWithEmail("fictional@example.test", "fictional-only"); });
  expect(outcome).toMatchObject({ ok: false, code: "ADMIN_SESSION_NOT_VERIFIED" }); expect(current.status).toBe("signedOut"); expect(current.notice).toBeNull();
  expect(state.request).toHaveBeenCalledTimes(3);
});
it("does not perform another session check for an incorrect password", async () => {
  mount(); await screen.findByText("signedOut");
  let outcome; await act(async () => { outcome = await current.signInWithEmail("fictional@example.test", "wrong"); });
  expect(outcome).toMatchObject({ ok: false, code: "ADMIN_LOGIN_FAILED" }); expect(state.request).toHaveBeenCalledTimes(2);
});
it("ignores a late pre-login 401 after a newer login session was verified", async () => {
  let rejectOld; state.request.mockImplementationOnce(() => new Promise((_, reject) => { rejectOld = reject; }));
  mount();
  state.request.mockResolvedValueOnce({ data: { authenticated: true } }).mockResolvedValueOnce({ data: profile });
  await act(() => current.signInWithEmail("fictional@example.test", "fictional-only"));
  await act(async () => { rejectOld(unauthorized()); });
  expect(current.status).toBe("signedIn"); expect(current.profile).toEqual(profile); expect(state.request).toHaveBeenCalledTimes(3);
});
it("still clears staff access and private query data when a protected request rejects the session", async () => {
  state.request.mockResolvedValueOnce({ data: profile }); mount(); await screen.findByText("signedIn");
  query.setQueryData(["private"], "fictional");
  await act(async () => state.listeners.forEach(fn => fn(unauthorized())));
  expect(current.status).toBe("signedOut"); expect(current.profile).toBeNull(); expect(query.getQueryData(["private"])).toBeUndefined(); expect(state.request).toHaveBeenCalledTimes(1);
});
