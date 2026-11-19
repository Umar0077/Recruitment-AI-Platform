import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const state = vi.hoisted(() => ({ auth: {}, replace: vi.fn(), reset: vi.fn(), verify: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: state.replace }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/auth/auth-provider", () => ({ useAuth: () => state.auth, safeNext: (_raw, fallback) => fallback }));
vi.mock("@/lib/firebase/client", () => ({ firebaseMissingKeys: [], usingAuthEmulator: false }));
vi.mock("@/lib/firebase/password-auth", () => ({ requestPasswordReset: state.reset, requestEmailVerification: state.verify, PASSWORD_RESET_MESSAGE: "If an account can receive a password reset, an email will arrive shortly. Check your inbox and spam folder." }));
import { SocialSignIn } from "@/components/auth/social-sign-in";

beforeEach(() => {
  vi.clearAllMocks();
  state.auth = { status: "signedOut", user: null, profile: null, notice: null, signInWith: vi.fn().mockResolvedValue({ ok: true }), signInWithEmail: vi.fn().mockResolvedValue({ ok: true }), clearNotice: vi.fn(), signOut: vi.fn().mockResolvedValue(), refresh: vi.fn().mockResolvedValue() };
  state.reset.mockResolvedValue({ ok: true }); state.verify.mockResolvedValue({ ok: true });
});
afterEach(cleanup);
const show = area => render(<SocialSignIn area={area} defaultNext={area === "admin" ? "/admin" : "/candidate/interview"} />);
describe("shared candidate/admin sign-in interface", () => {
  it.each(["candidate", "admin"])("offers email and Google on the %s screen", async area => {
    const user = userEvent.setup(); show(area);
    await user.type(screen.getByLabelText("Email address"), "fictional@example.test");
    await user.type(screen.getByLabelText("Password", { exact: true }), "fictional-password");
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText("Password", { exact: true }).type).toBe("text");
    await user.click(screen.getByRole("button", { name: "Sign In", exact: true }));
    await waitFor(() => expect(state.auth.signInWithEmail).toHaveBeenCalledWith("fictional@example.test", "fictional-password"));
    expect(screen.getByLabelText("Password", { exact: true }).value).toBe("");
    await user.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(state.auth.signInWith).toHaveBeenCalledWith("google.com");
    expect(screen.queryByText(/Apple/)).toBeNull();
  });
  it("validates malformed email and missing password before contacting Firebase", async () => {
    show("candidate"); const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email address"), "invalid");
    await user.click(screen.getByRole("button", { name: "Sign In", exact: true }));
    expect(await screen.findByText("Enter a valid email address.")).toBeTruthy();
    expect(screen.getByText("Enter your password.")).toBeTruthy(); expect(state.auth.signInWithEmail).not.toHaveBeenCalled();
  });
  it("shows an invalid-credentials error and re-enables the form", async () => {
    state.auth.signInWithEmail.mockResolvedValue({ ok: false, message: "The email or password is incorrect." });
    show("candidate"); const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email address"), "fictional@example.test"); await user.type(screen.getByLabelText("Password", { exact: true }), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign In", exact: true }));
    expect(await screen.findByRole("alert")).toBeTruthy(); expect(screen.getByRole("button", { name: "Sign In", exact: true }).disabled).toBe(false);
  });
  it("resets without a password and gives neutral confirmation", async () => {
    show("candidate"); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    await user.type(screen.getByLabelText("Email address"), "fictional@example.test");
    await user.click(screen.getByRole("button", { name: "Send reset email" }));
    expect(await screen.findByText(/If an account can receive a password reset/)).toBeTruthy();
    expect(state.reset).toHaveBeenCalledWith("fictional@example.test"); expect(state.auth.signInWithEmail).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Back to sign in" })); expect(screen.getByLabelText("Password", { exact: true })).toBeTruthy();
  });
  it("routes unverified users to the dedicated verification screen", async () => {
    state.auth.status = "verificationRequired"; show("candidate");
    await waitFor(() => expect(state.replace).toHaveBeenCalledWith("/candidate/verify-email?area=candidate"));
  });
  it("blocks candidate accounts from the admin workspace", () => {
    state.auth.status = "signedIn"; state.auth.profile = { roles: ["CANDIDATE"], isStaff: false, candidateId: null };
    show("admin"); expect(screen.getByText("No workspace access.")).toBeTruthy(); expect(state.replace).not.toHaveBeenCalled();
  });
  it("routes a new candidate directly to onboarding", async () => {
    state.auth.status = "signedIn"; state.auth.profile = { roles: ["CANDIDATE"], isStaff: false, candidateId: null };
    show("candidate"); await waitFor(() => expect(state.replace).toHaveBeenCalledWith("/candidate/onboarding"));
  });
  it("lets authorized staff continue to their workspace", async () => {
    state.auth.status = "signedIn"; state.auth.profile = { roles: ["HR_MANAGER"], isStaff: true, candidateId: null };
    show("admin"); await waitFor(() => expect(state.replace).toHaveBeenCalledWith("/admin"));
  });
});

