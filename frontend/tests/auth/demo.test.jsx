import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
import { DemoLoginForm } from "@/components/candidate/demo-login-form";
import { useDemoStore } from "@/lib/demo/store";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("accepts non-empty demo credentials without networking or storing passwords", async () => {
  const network = vi.fn(); vi.stubGlobal("fetch", network);
  render(<DemoLoginForm role="candidate" redirectTo="/candidate/interview" submitLabel="Continue" />);
  const user = userEvent.setup(); await user.type(screen.getByLabelText("Email address"), "demo");
  await user.type(screen.getByLabelText("Password", { exact: true }), "fictional-do-not-store");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await waitFor(() => expect(useDemoStore.getState().candidateSession.email).toBe("demo"));
  expect(JSON.stringify(useDemoStore.getState())).not.toContain("fictional-do-not-store"); expect(network).not.toHaveBeenCalled();
});
it("preserves demo answers/submission and Start New Demo Interview", () => {
  const network = vi.fn(); vi.stubGlobal("fetch", network);
  useDemoStore.getState().startSession("candidate", "demo");
  for (let i = 0; i < 4; i++) useDemoStore.getState().recordAnswer();
  expect(useDemoStore.getState().flow.answeredCount).toBe(4);
  expect(useDemoStore.getState().submitInterview()).toMatch(/^IOS-/);
  expect(useDemoStore.getState().flow.stage).toBe("submitted");
  useDemoStore.getState().resetDemoInterview();
  expect(useDemoStore.getState().flow.answeredCount).toBe(0); expect(useDemoStore.getState().flow.stage).not.toBe("submitted");
  expect(network).not.toHaveBeenCalled();
});
