import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useFocusedInterview } from "@/hooks/use-focused-interview";
afterEach(() => vi.restoreAllMocks());
it("requests fullscreen only on an explicit action and reflects browser exit", async () => {
  Object.defineProperty(document, "fullscreenEnabled", { value: true, configurable: true });
  Object.defineProperty(document, "fullscreenElement", { value: null, configurable: true });
  document.documentElement.requestFullscreen = vi.fn().mockResolvedValue();
  document.exitFullscreen = vi.fn().mockResolvedValue();
  const { result } = renderHook(useFocusedInterview);
  expect(document.documentElement.requestFullscreen).not.toHaveBeenCalled();
  await act(() => result.current.toggle()); expect(document.documentElement.requestFullscreen).toHaveBeenCalledTimes(1);
  act(() => { Object.defineProperty(document, "fullscreenElement", { value: document.documentElement, configurable: true }); document.dispatchEvent(new Event("fullscreenchange")); });
  expect(result.current.active).toBe(true);
  await act(() => result.current.toggle()); expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
  act(() => { Object.defineProperty(document, "fullscreenElement", { value: null, configurable: true }); document.dispatchEvent(new Event("fullscreenchange")); });
  expect(result.current.active).toBe(false);
});
it("offers continuation when fullscreen is unavailable or rejected", async () => {
  Object.defineProperty(document, "fullscreenEnabled", { value: false, configurable: true });
  const unavailable = renderHook(useFocusedInterview); await act(() => unavailable.result.current.toggle()); expect(unavailable.result.current.error).toMatch(/continue normally/); unavailable.unmount();
  Object.defineProperty(document, "fullscreenEnabled", { value: true, configurable: true });
  document.documentElement.requestFullscreen = vi.fn().mockRejectedValue(new Error("denied"));
  const denied = renderHook(useFocusedInterview); await act(() => denied.result.current.toggle()); expect(denied.result.current.error).toMatch(/continue normally/);
});
