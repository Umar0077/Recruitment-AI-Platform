import { beforeEach, describe, expect, it, vi } from "vitest";
const s = vi.hoisted(() => ({ api: true, auth: { currentUser: null }, get: vi.fn(), create: vi.fn(), update: vi.fn(), send: vi.fn(), policy: vi.fn() }));
vi.mock("@/lib/config/environment", () => ({ get isApiMode() { return s.api; } }));
vi.mock("@/lib/firebase/client", () => ({ getFirebaseAuth: s.get }));
vi.mock("firebase/auth", () => ({ createUserWithEmailAndPassword: s.create, updateProfile: s.update, sendEmailVerification: s.send, validatePassword: s.policy }));
import { registerCandidate, completeFirebaseName } from "@/lib/firebase/registration";
import { clearFreshLogin, needsFreshLogin } from "@/lib/firebase/onboarding-session";
const user = { uid: "fictional-signup", emailVerified: false, getIdToken: vi.fn() };
beforeEach(() => { vi.resetAllMocks(); clearFreshLogin(); localStorage.clear(); s.api = true; s.auth.currentUser = null; delete s.auth.emulatorConfig; delete s.auth.app; s.get.mockResolvedValue(s.auth); s.policy.mockResolvedValue({ isValid: true }); s.create.mockResolvedValue({ user }); user.emailVerified = false; });
describe("candidate registration", () => {
  it("saves the exact trimmed full name and sends verification after creation", async () => {
    expect(await registerCandidate("  Fictional  Test Person  ", " fictional@example.test ", " P@ssword1! ")).toEqual({ ok: true, emailSent: true, notice: undefined });
    expect(s.create).toHaveBeenCalledWith(s.auth, "fictional@example.test", " P@ssword1! ");
    expect(s.update).toHaveBeenCalledWith(user, { displayName: "Fictional  Test Person" });
    expect(s.send).toHaveBeenCalledWith(user);
    expect(s.create.mock.invocationCallOrder[0]).toBeLessThan(s.update.mock.invocationCallOrder[0]);
    expect(s.update.mock.invocationCallOrder[0]).toBeLessThan(s.send.mock.invocationCallOrder[0]);
    expect(needsFreshLogin(user.uid)).toBe(true);
  });
  it("uses the configured password policy before creating an account", async () => {
    s.policy.mockResolvedValue({ isValid: false, meetsMinPasswordLength: false, containsUppercaseLetter: false, containsNumericCharacter: false, passwordPolicy: { customStrengthOptions: { minPasswordLength: 12 } } });
    const r = await registerCandidate("Fictional Person", "fictional@example.test", "weak");
    expect(r.message).toContain("at least 12 characters"); expect(r.message).toContain("uppercase"); expect(s.create).not.toHaveBeenCalled();
  });
  it("supports the isolated emulator without weakening a real project's password policy", async () => {
    s.auth.emulatorConfig = { host: "127.0.0.1", port: 9199 }; s.auth.app = { options: { projectId: "demo-interviewos-auth-tests" } };
    expect((await registerCandidate("Fictional Person", "fictional@example.test", "short")).ok).toBe(false);
    expect((await registerCandidate("Fictional Person", "fictional@example.test", "Fictional1!")).ok).toBe(true); expect(s.policy).not.toHaveBeenCalled();
    s.auth.app.options.projectId = "real-project"; s.policy.mockRejectedValue({ code: "auth/network-request-failed" });
    expect((await registerCandidate("Fictional Person", "fictional@example.test", "Fictional1!")).ok).toBe(false); expect(s.policy).toHaveBeenCalledTimes(1);
  });
  it.each(["auth/email-already-in-use", "auth/too-many-requests", "auth/network-request-failed", "auth/weak-password"])("sanitizes %s", async code => {
    s.create.mockRejectedValue({ code, message: "private details" }); const r = await registerCandidate("Fictional Person", "fictional@example.test", "Fictional1!");
    expect(r.ok).toBe(false); expect(r.message).not.toContain("private details"); expect(s.send).not.toHaveBeenCalled();
  });
  it("keeps an account usable when sending verification fails", async () => {
    s.send.mockRejectedValue({ code: "auth/network-request-failed", message: "private" });
    expect(await registerCandidate("Fictional Person", "fictional@example.test", "Fictional1!")).toMatchObject({ ok: true, emailSent: false });
    expect(s.create).toHaveBeenCalledTimes(1); expect(needsFreshLogin(user.uid)).toBe(true);
  });
  it("continues verification if saving the initial name fails", async () => {
    s.update.mockRejectedValue({ code: "auth/network-request-failed" });
    const r = await registerCandidate("Fictional Person", "fictional@example.test", "Fictional1!");
    expect(r).toMatchObject({ ok: true, emailSent: true }); expect(r.notice).toContain("complete your name");
  });
  it("requires a name and never replaces a signed-in account", async () => {
    expect((await registerCandidate("  ", "fictional@example.test", "Fictional1!")).ok).toBe(false);
    s.auth.currentUser = user; expect((await registerCandidate("Fictional Person", "fictional@example.test", "Fictional1!")).ok).toBe(false); expect(s.create).not.toHaveBeenCalled();
  });
  it("fills a missing name only for a verified Firebase session and refreshes claims", async () => {
    s.auth.currentUser = user; expect((await completeFirebaseName("Fictional Name")).ok).toBe(false);
    user.emailVerified = true; expect((await completeFirebaseName(" Fictional Name ")).ok).toBe(true);
    expect(s.update).toHaveBeenCalledWith(user, { displayName: "Fictional Name" }); expect(user.getIdToken).toHaveBeenCalledWith(true);
  });
  it("never invokes Firebase in Demo Mode", async () => {
    s.api = false; await registerCandidate("Demo", "demo@example.test", "demo"); await completeFirebaseName("Demo"); expect(s.get).not.toHaveBeenCalled();
  });
});
