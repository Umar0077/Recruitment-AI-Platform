import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
const s = vi.hoisted(() => ({ api: true, auth: { profile: null, user: null }, demo: {} }));
vi.mock("@/lib/config/environment", () => ({ get isApiMode() { return s.api; } }));
vi.mock("@/lib/auth/auth-provider", () => ({ useAuth: () => s.auth }));
vi.mock("@/lib/demo/store", () => ({ useDemoStore: fn => fn(s.demo) }));
vi.mock("@/lib/demo/seed", () => ({ CURRENT_ADMIN_ID: "fictional-admin" }));
import { accountIdentity, useUserProfile } from "@/lib/auth/user-profile";
beforeEach(() => { s.api = true; s.auth = { profile: { displayName: "Stored User Name", email: "stored@example.test", roles: ["CANDIDATE"] }, user: { displayName: "Google Name", photoURL: "https://lh3.googleusercontent.com/fictional" } }; s.demo = { candidates: [{ id: "candidate", name: "Official Applicant", email: "candidate@example.test" }], flow: { candidateId: "candidate" }, team: [{ id: "fictional-admin", name: "Fictional HR", role: "hr_manager" }] }; });
describe("centralized account profile", () => {
  it("prefers stored name to Google and separates identity from official applicant name", () => {
    const { result } = renderHook(() => useUserProfile("candidate")); expect(result.current).toMatchObject({ fullName: "Stored User Name", firstName: "Stored", email: "stored@example.test", photoURL: "https://lh3.googleusercontent.com/fictional" });
  });
  it("uses Google as the initial name but never fabricates a missing name", () => { expect(accountIdentity(null, { displayName: " Google Person " }).fullName).toBe("Google Person"); expect(accountIdentity(null, null).fullName).toBe(""); });
  it("rejects unsafe and arbitrary profile photo URLs", () => { expect(accountIdentity(null, { photoURL: "javascript:alert(1)" }).photoURL).toBeNull(); expect(accountIdentity(null, { photoURL: "https://untrusted.example/photo" }).photoURL).toBeNull(); });
  it("keeps demo identity isolated from a real session", () => { s.api = false; const { result } = renderHook(() => useUserProfile("admin")); expect(result.current.fullName).toBe("Fictional HR"); });
});
