import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const s = vi.hoisted(() => ({ api: true, auth: {}, router: { replace: vi.fn() }, params: "", resend: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => s.router, useSearchParams: () => new URLSearchParams(s.params) }));
vi.mock("@/lib/config/environment", () => ({ get isApiMode() { return s.api; } }));
vi.mock("@/lib/auth/auth-provider", () => ({ useAuth: () => s.auth }));
vi.mock("@/lib/firebase/password-auth", () => ({ requestEmailVerification: s.resend }));
vi.mock("@/components/auth/auth-frame", () => ({ AuthFrame: ({ title, children }) => <main><h1>{title}</h1>{children}</main> }));
import { SignupForm } from "@/components/auth/signup-form";
import { VerificationScreen } from "@/components/auth/verification-screen";
import { CompleteProfile } from "@/components/auth/complete-profile";
beforeEach(() => {
  vi.clearAllMocks(); s.api = true; s.params = "";
  s.auth = { status: "signedOut", user: { email: "fictional@example.test" }, notice: null, register: vi.fn().mockResolvedValue({ ok: true, emailSent: true }), checkVerification: vi.fn().mockResolvedValue(false), signOut: vi.fn().mockResolvedValue(), completeProfile: vi.fn().mockResolvedValue({ ok: true }) };
  s.resend.mockResolvedValue({ ok: true }); Object.defineProperty(document, "hidden", { configurable: true, value: false });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe("signup and profile screens", () => {
  async function fill(confirmation = "Fictional1!") {
    const u = userEvent.setup(); await u.type(screen.getByLabelText("Full name"), " Fictional Person "); await u.type(screen.getByLabelText("Email address"), "fictional@example.test"); await u.type(screen.getByLabelText("Password", { exact: true }), "Fictional1!"); await u.type(screen.getByLabelText("Confirm password"), confirmation); return u;
  }
  it("validates confirmation before registration", async () => {
    render(<SignupForm />); const u = await fill("different"); await u.click(screen.getByRole("button", { name: "Create Account" }));
    expect(await screen.findByText("Passwords do not match.")).toBeTruthy(); expect(s.auth.register).not.toHaveBeenCalled();
  });
  it("registers once, clears password fields and opens verification", async () => {
    render(<SignupForm />); const u = await fill(); await u.dblClick(screen.getByRole("button", { name: "Create Account" }));
    await waitFor(() => expect(s.router.replace).toHaveBeenCalledWith("/candidate/verify-email?sent=1")); expect(s.auth.register).toHaveBeenCalledTimes(1);
    expect(s.auth.register).toHaveBeenCalledWith("Fictional Person", "fictional@example.test", "Fictional1!"); expect(screen.getByLabelText("Password", { exact: true }).value).toBe("");
  });
  it("shows registration errors without navigating", async () => {
    s.auth.register.mockResolvedValue({ ok: false, message: "An account already exists." }); render(<SignupForm />); const u = await fill(); await u.click(screen.getByRole("button", { name: "Create Account" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "An account already exists."); expect(s.router.replace).not.toHaveBeenCalled();
  });
  it("asks for a missing Google name without fabricating one", async () => {
    s.auth.status = "profileRequired"; s.auth.user.displayName = null; render(<CompleteProfile area="candidate" />); expect(screen.getByLabelText("Full name").value).toBe("");
    const u = userEvent.setup(); await u.type(screen.getByLabelText("Full name"), "Fictional Google Person"); await u.click(screen.getByRole("button", { name: "Save and Continue" }));
    expect(s.auth.completeProfile).toHaveBeenCalledWith("Fictional Google Person");
  });
  it("does not register real users in Demo Mode", () => { s.api = false; render(<SignupForm />); expect(screen.getByRole("link", { name: /Demo Login/ })).toBeTruthy(); expect(screen.queryByLabelText("Password")).toBeNull(); expect(s.auth.register).not.toHaveBeenCalled(); });
});
describe("verification screen", () => {
  const show = () => { s.auth.status = "verificationRequired"; return render(<VerificationScreen />); };
  it("shows email, supports resend with cooldown, and manual checking", async () => {
    show(); expect(screen.getByText("fictional@example.test")).toBeTruthy(); const u = userEvent.setup(); await u.click(screen.getByRole("button", { name: "Resend Verification Email" }));
    expect(await screen.findByText(/Verification email sent/)).toBeTruthy(); expect(screen.getByRole("button", { name: "Resend in 60s" }).disabled).toBe(true);
    await u.click(screen.getByRole("button", { name: "I've Verified My Email" })); expect(await screen.findByText(/Verification is still pending/)).toBeTruthy(); expect(s.router.replace).not.toHaveBeenCalled();
  });
  it("automatically detects verification, shows success, redirects to login and stops polling", async () => {
    vi.useFakeTimers(); s.auth.checkVerification.mockResolvedValueOnce(false).mockResolvedValueOnce(true); show(); await act(async () => {});
    await act(() => vi.advanceTimersByTimeAsync(15000)); expect(screen.getByText("Email verified successfully")).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(1500)); expect(s.router.replace).toHaveBeenCalledWith("/candidate/login?verified=1");
    await act(() => vi.advanceTimersByTimeAsync(60000)); expect(s.auth.checkVerification).toHaveBeenCalledTimes(2);
  });
  it("pauses when hidden and stops on unmount", async () => {
    vi.useFakeTimers(); const view = show(); await act(async () => {}); Object.defineProperty(document, "hidden", { configurable: true, value: true });
    await act(() => vi.advanceTimersByTimeAsync(45000)); expect(s.auth.checkVerification).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "hidden", { configurable: true, value: false }); await act(async () => { fireEvent(document, new Event("visibilitychange")); }); expect(s.auth.checkVerification).toHaveBeenCalledTimes(2);
    view.unmount(); await act(() => vi.advanceTimersByTimeAsync(45000)); expect(s.auth.checkVerification).toHaveBeenCalledTimes(2);
  });
  it("bounds polling to ten minutes while keeping manual checks available", async () => {
    vi.useFakeTimers(); show(); await act(async () => {}); await act(() => vi.advanceTimersByTimeAsync(600000)); expect(screen.getByText(/Automatic checking has paused/)).toBeTruthy();
    const calls = s.auth.checkVerification.mock.calls.length; await act(() => vi.advanceTimersByTimeAsync(60000)); expect(s.auth.checkVerification).toHaveBeenCalledTimes(calls);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "I've Verified My Email" }))); expect(s.auth.checkVerification).toHaveBeenCalledTimes(calls + 1);
  });
  it("signs out before returning to admin login", async () => {
    s.params = "area=admin"; show(); await act(async () => {}); await userEvent.setup().click(screen.getByRole("button", { name: "Back to Login" }));
    expect(s.auth.signOut).toHaveBeenCalledTimes(1); expect(s.router.replace).toHaveBeenCalledWith("/admin/login");
  });
});
