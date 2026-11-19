import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({ apiRequest: request }));
import { CompletionMediaStatus } from "@/components/candidate/completion-media-status";
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("keeps submission confirmed when a separate recording check fails without automatic retry", async () => {
  request.mockRejectedValue(new Error("fictional storage outage"));
  render(<QueryClientProvider client={new QueryClient()}><CompletionMediaStatus sessionId="fictional" /></QueryClientProvider>);
  expect(await screen.findByText(/Your interview is submitted. Recording status could not be checked/)).toBeTruthy();
  expect(request).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Retry recording status" })).toBeTruthy();
});
