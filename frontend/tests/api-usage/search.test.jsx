import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useCommandSearch } from "@/hooks/use-command-search";
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe("command palette request scheduling", () => {
  it("does not request each keystroke and only exposes the current settled term", () => {
    const view = renderHook(({ open, query }) => useCommandSearch(open, query, true), { initialProps: { open: true, query: "al" } });
    expect(view.result.current).toBe(""); act(() => vi.advanceTimersByTime(200)); view.rerender({ open: true, query: "alice" });
    act(() => vi.advanceTimersByTime(249)); expect(view.result.current).toBe(""); act(() => vi.advanceTimersByTime(1)); expect(view.result.current).toBe("alice");
    view.rerender({ open: true, query: "ali" }); expect(view.result.current).toBe("");
  });
  it("immediately disables requests when closed or too short", () => {
    const view = renderHook(({ open, query }) => useCommandSearch(open, query, true), { initialProps: { open: true, query: "fictional" } });
    act(() => vi.advanceTimersByTime(250)); expect(view.result.current).toBe("fictional"); view.rerender({ open: false, query: "fictional" }); expect(view.result.current).toBe("");
    act(() => vi.advanceTimersByTime(1000)); expect(view.result.current).toBe(""); view.rerender({ open: true, query: "a" }); act(() => vi.advanceTimersByTime(250)); expect(view.result.current).toBe("");
  });
  it("never schedules remote demo searches", () => { const { result } = renderHook(() => useCommandSearch(true, "fictional", false)); act(() => vi.advanceTimersByTime(1000)); expect(result.current).toBe(""); });
});
