import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mode = vi.hoisted(() => ({ api: true }));
vi.mock("@/lib/config/environment", () => ({ get isApiMode() { return mode.api; }, API_BASE_URL: "https://api.example.invalid/api/v1" }));
import { apiRequest, onAuthFailure, setTokenProvider } from "@/lib/api/client";
const response = (status, success) => ({ status, json: async () => success ? { success: true, data: { id: "fictional" }, meta: {} } : { success: false, error: { code: "UNAUTHENTICATED", message: "Sign in again." }, meta: {} } });
beforeEach(() => { mode.api = true; setTokenProvider(async () => null); });
afterEach(() => vi.unstubAllGlobals());
it("leaves an expected admin session 401 to its caller without notifying global auth listeners or retrying", async () => {
  const fetch = vi.fn().mockResolvedValue(response(401, false)); vi.stubGlobal("fetch", fetch);
  const listener = vi.fn(), off = onAuthFailure(listener);
  try {
    await expect(apiRequest("/admin-auth/me", { admin: true, notifyAuthFailure: false })).rejects.toHaveProperty("code", "UNAUTHENTICATED");
    expect(fetch).toHaveBeenCalledTimes(1); expect(listener).not.toHaveBeenCalled();
  } finally { off(); }
});
it("uses only cookies and a CSRF header for staff, without retrying rejected logins", async () => {
  const token = vi.fn().mockResolvedValue("fictional-candidate-token"); setTokenProvider(token);
  const fetch = vi.fn().mockResolvedValue(response(401, false)); vi.stubGlobal("fetch", fetch);
  await expect(apiRequest("/admin-auth/login", { admin: true, method: "POST", body: { email: "fictional@example.test", password: "fictional-only" } })).rejects.toHaveProperty("code", "UNAUTHENTICATED");
  expect(fetch).toHaveBeenCalledTimes(1); expect(token).not.toHaveBeenCalled();
  expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: "include", headers: { "X-Admin-Request": "1" } });
  expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
});
it("never contacts production APIs in demo mode", async () => {
  mode.api = false; const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await expect(apiRequest("/auth/me")).rejects.toHaveProperty("code", "API_DISABLED"); expect(fetch).not.toHaveBeenCalled();
});
it("refreshes an expired Firebase token once without sending passwords", async () => {
  const token = vi.fn().mockResolvedValueOnce("fictional-expired").mockResolvedValueOnce("fictional-refreshed"); setTokenProvider(token);
  const fetch = vi.fn().mockResolvedValueOnce(response(401, false)).mockResolvedValueOnce(response(200, true)); vi.stubGlobal("fetch", fetch);
  expect((await apiRequest("/auth/me")).data.id).toBe("fictional");
  expect(token.mock.calls).toEqual([[false], [true]]);
  expect(fetch.mock.calls[1][1].headers.Authorization).toBe("Bearer fictional-refreshed"); expect(fetch.mock.calls[1][1].body).toBeUndefined();
});
it("ends a rejected session after the single refresh retry", async () => {
  setTokenProvider(async () => "fictional-revoked"); const fetch = vi.fn().mockResolvedValue(response(401, false)); vi.stubGlobal("fetch", fetch);
  const listener = vi.fn(), unsubscribe = onAuthFailure(listener);
  try { await expect(apiRequest("/auth/me")).rejects.toHaveProperty("code", "UNAUTHENTICATED"); expect(fetch).toHaveBeenCalledTimes(2); expect(listener).toHaveBeenCalledTimes(1); }
  finally { unsubscribe(); }
});
