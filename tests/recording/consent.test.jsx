import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RecordingSession } from "@/components/interview/recording-session";
import { apiRequest } from "@/lib/api/client";
vi.mock("@/lib/api/client", () => ({ apiRequest: vi.fn() }));
let devices;
const enabled = { available: true, reason: null, policyReference: "Fictional policy", supportEmail: "support@example.test", retentionDays: 7, screenRequirement: "selected_surface", cameraEnabled: true, monitoringEnabled: true };
beforeEach(() => { devices = { getDisplayMedia: vi.fn(), getUserMedia: vi.fn() }; vi.stubGlobal("navigator", { mediaDevices: devices }); apiRequest.mockImplementation(async path => ({ data: path.endsWith("policy") ? enabled : { recordings: [] } })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("loads policy without device access and requires separate unchecked consent", async () => {
  render(<RecordingSession sessionId="fictional">{() => <p>Interview questions</p>}</RecordingSession>);
  await screen.findByText(/I consent to the sources/); const boxes = screen.getAllByRole("checkbox"); expect(boxes.every(b => !b.checked)).toBe(true);
  expect(screen.getByRole("button", { name: /Start Screen Sharing/ }).disabled).toBe(true); expect(devices.getDisplayMedia).not.toHaveBeenCalled(); expect(devices.getUserMedia).not.toHaveBeenCalled(); expect(screen.queryByText("Interview questions")).toBeNull();
  fireEvent.click(boxes[0]); expect(screen.getByRole("button", { name: /Start Screen Sharing/ }).disabled).toBe(false); expect(boxes[1].checked).toBe(false);
});
it("offers an unrecorded path when privacy/storage are unavailable", async () => {
  apiRequest.mockImplementation(async path => ({ data: path.endsWith("policy") ? { ...enabled, available: false, reason: "Approved privacy and storage settings are required." } : { recordings: [] } }));
  render(<RecordingSession sessionId="fictional">{() => <p>Interview questions</p>}</RecordingSession>); await screen.findByText(/Approved privacy/);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /Continue without recording/ })));
  await screen.findByText("Interview questions"); expect(devices.getDisplayMedia).not.toHaveBeenCalled(); expect(devices.getUserMedia).not.toHaveBeenCalled();
});
it("stops the loader and offers retry/continuation after policy errors", async () => {
  apiRequest.mockRejectedValue(new Error("offline")); render(<RecordingSession sessionId="fictional">{() => <p>Interview questions</p>}</RecordingSession>);
  await screen.findByRole("alert"); await waitFor(() => expect(screen.queryByText("Checking recording readiness…")).toBeNull()); expect(screen.getByRole("button", { name: "Retry readiness" })).toBeTruthy(); expect(screen.getByRole("button", { name: /Continue without recording/ })).toBeTruthy();
});
