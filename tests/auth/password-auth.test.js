import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ api: true, auth: { currentUser: null }, getAuth: vi.fn(), login: vi.fn(), reset: vi.fn(), verify: vi.fn() }));
vi.mock("@/lib/config/environment", () => ({ get isApiMode() { return state.api; } }));
vi.mock("@/lib/firebase/client", () => ({ getFirebaseAuth: state.getAuth }));
vi.mock("firebase/auth", () => ({ signInWithEmailAndPassword: state.login, sendPasswordResetEmail: state.reset, sendEmailVerification: state.verify }));
import { requestEmailVerification, requestPasswordReset, signInWithPassword } from "@/lib/firebase/password-auth";
import { authErrorMessage } from "@/lib/firebase/errors";

beforeEach(() => {
  vi.resetAllMocks(); state.api = true; state.auth.currentUser = null;
  state.getAuth.mockResolvedValue(state.auth); state.login.mockResolvedValue({}); state.reset.mockResolvedValue(); state.verify.mockResolvedValue();
});
describe("Firebase password operations", () => {
  it("sends credentials only to Firebase and preserves password whitespace", async () => {
    expect(await signInWithPassword("  fictional@example.test  ", " fictional password ")).toEqual({ ok: true });
    expect(state.login).toHaveBeenCalledWith(state.auth, "fictional@example.test", " fictional password ");
  });
  it.each(["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"])("uses the same non-enumerating sign-in error for %s", async code => {
    state.login.mockRejectedValue({ code, message: "private internal details" });
    expect(await signInWithPassword("fictional@example.test", "wrong")).toMatchObject({ ok: false, message: authErrorMessage("auth/invalid-credential") });
  });
  it.each(["auth/user-disabled", "auth/too-many-requests", "auth/network-request-failed", "auth/operation-not-allowed", "auth/service-unavailable"])("handles %s without exposing raw errors", async code => {
    state.login.mockRejectedValue({ code, message: "private internal details" });
    expect(await signInWithPassword("fictional@example.test", "fictional")).toEqual({ ok: false, code, message: authErrorMessage(code) });
  });
  it.each([null, "auth/user-not-found", "auth/user-disabled", "auth/invalid-credential"])("returns identical reset confirmation for %s", async code => {
    if (code) state.reset.mockRejectedValue({ code });
    expect(await requestPasswordReset("fictional@example.test")).toEqual({ ok: true });
  });
  it("reports reset network failures without claiming a message was sent", async () => {
    state.reset.mockRejectedValue({ code: "auth/network-request-failed" });
    expect(await requestPasswordReset("fictional@example.test")).toMatchObject({ ok: false });
  });
  it("sends verification only for the current unverified Firebase user", async () => {
    state.auth.currentUser = { uid: "fictional", emailVerified: false };
    expect(await requestEmailVerification()).toEqual({ ok: true });
    expect(state.verify).toHaveBeenCalledWith(state.auth.currentUser);
  });
  it("requires a current session before sending verification", async () => {
    expect(await requestEmailVerification()).toMatchObject({ ok: false }); expect(state.verify).not.toHaveBeenCalled();
  });
  it("does not claim an email was sent for an already verified session", async () => {
    state.auth.currentUser = { uid: "fictional", emailVerified: true };
    expect(await requestEmailVerification()).toMatchObject({ ok: false, code: "auth/already-verified" }); expect(state.verify).not.toHaveBeenCalled();
  });
  it("makes no Firebase calls in demo mode", async () => {
    state.api = false;
    expect((await signInWithPassword("demo", "demo")).ok).toBe(false);
    expect((await requestPasswordReset("demo")).ok).toBe(false);
    expect((await requestEmailVerification()).ok).toBe(false);
    expect(state.getAuth).not.toHaveBeenCalled();
  });
});
