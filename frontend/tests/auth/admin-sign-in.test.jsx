import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const state = vi.hoisted(() => ({ auth: {}, replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: state.replace }) }));
vi.mock("@/lib/auth/auth-provider", () => ({ useAuth: () => state.auth }));
import { AdminSignIn } from "@/components/auth/admin-sign-in";
beforeEach(() => { vi.clearAllMocks(); state.auth = { status: "signedOut", profile: null, signInWithEmail: vi.fn().mockResolvedValue({ ok: false, message: "Invalid credentials." }), refresh: vi.fn() }; });
afterEach(cleanup);
it("provides separate password login without Google, signup or public reset", async () => {
  render(<AdminSignIn />); const user = userEvent.setup();
  expect(screen.queryByText(/Google|Sign Up|Forgot password/i)).toBeNull();
  await user.type(screen.getByLabelText("Email Address"), "fictional-admin@example.test");
  await user.type(screen.getByLabelText("Password", { exact: true }), "Fictional-only-password1!");
  await user.click(screen.getByLabelText("Show password")); expect(screen.getByLabelText("Password", { exact: true }).type).toBe("text");
  await user.click(screen.getByRole("button", { name: "Sign In" }));
  await waitFor(() => expect(state.auth.signInWithEmail).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("alert").textContent).toBe("Invalid credentials."); expect(screen.getByLabelText("Password", { exact: true }).value).toBe("");
});
it.each([[true, "/admin/settings/security"], [false, "/admin"]])("routes mustChangePassword=%s correctly", async (mustChangePassword, path) => {
  state.auth.status = "signedIn"; state.auth.profile = { isStaff: true, mustChangePassword };
  render(<AdminSignIn />); await waitFor(() => expect(state.replace).toHaveBeenCalledWith(path));
});
