import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { InterviewOSLoader } from "@/components/ui/interviewos-loader";
import { Button } from "@/components/ui/button";
afterEach(cleanup);
it("announces contextual loading and removes the animation when loading ends", () => {
  const view = render(<InterviewOSLoader message="Loading your interview…" />);
  expect(screen.getByRole("status").textContent).toContain("Loading your interview"); expect(view.container.querySelector(".ios-loader-mark svg")).not.toBeNull();
  view.rerender(<p>Ready</p>); expect(view.container.querySelector(".ios-loader-mark")).toBeNull();
});
it("disables repeated button actions while retaining its accessible label", () => {
  render(<Button loading>Signing you in…</Button>); const button = screen.getByRole("button", { name: "Signing you in…" }); expect(button.disabled).toBe(true); expect(button.getAttribute("aria-busy")).toBe("true");
});
