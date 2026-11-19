import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
const state = vi.hoisted(() => ({ api: false, update: vi.fn(), updateFlow: vi.fn(), push: vi.fn(), prefetch: vi.fn() }));
vi.mock("@/lib/config/environment", () => ({ get isApiMode() { return state.api; } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push, prefetch: state.prefetch }) }));
vi.mock("next/link", () => ({ default: ({ children, href }) => <a href={href}>{children}</a> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/components/candidate/shell", () => ({ CandidateShell: ({ children }) => <main>{children}</main> }));
vi.mock("@/components/candidate/flow-gate", () => ({ useFlowGate: () => null }));
vi.mock("@/lib/data/candidate-flow", () => ({ useCandidateFlow: () => ({ track: "fresher", stage: "not_started", totalQuestions: 4, secondsPerQuestion: 90, durationLabel: "Approximately 10 minutes", update: state.update }) }));
vi.mock("@/lib/demo/store", () => ({ useDemoStore: selector => selector({ updateFlow: state.updateFlow, setups: { fresher: { cameraRequired: true, microphoneRequired: true, instructions: "Fictional preview instructions" } } }) }));
import ConsentPage from "@/app/candidate/interview/consent/page";
import InstructionsPage from "@/app/candidate/interview/instructions/page";

beforeEach(() => { state.api = false; vi.clearAllMocks(); });
afterEach(cleanup);
describe("accurate interview consent", () => {
  it.each([false, true])("describes actual storage and preserves explicit consent in API mode %s", api => {
    state.api = api;
    render(<ConsentPage />);
    const checkbox = screen.getByRole("checkbox");
    const proceed = screen.getByRole("button", { name: "Agree and Continue" });
    expect(checkbox.getAttribute("aria-checked")).toBe("false");
    expect(proceed.disabled).toBe(true);
    expect(screen.getByText(api ? "Application storage" : "Demo browser storage")).toBeTruthy();
    expect(screen.getByText(/retained transcript versions and response times/).textContent).toContain(api ? "InterviewOS backend" : "browser's local storage");
    expect(screen.getByText(/separate unchecked consent and a preview before starting/)).toBeTruthy();
    expect(screen.getByText(/may send microphone audio to the browser provider/)).toBeTruthy();
    expect(screen.getByText(/remote voice service/)).toBeTruthy();
    expect(screen.getByText(/temporary recording for playback in this tab/)).toBeTruthy();
    fireEvent.click(checkbox); fireEvent.click(proceed);
    if (api) { expect(state.update).toHaveBeenCalledWith({ consent: true }); expect(state.updateFlow).not.toHaveBeenCalled(); }
    else { expect(state.updateFlow).toHaveBeenCalledWith({ consent: true, stage: "equipment" }); expect(state.update).not.toHaveBeenCalled(); }
    expect(state.push).toHaveBeenCalledWith("/candidate/interview/equipment");
  });
  it("does not present stale demo camera settings as a camera requirement", () => {
    render(<InstructionsPage />);
    expect(screen.getByText(/camera is an optional live preview only/)).toBeTruthy();
    expect(screen.getByText(/Use a microphone for spoken answers, or type instead/)).toBeTruthy();
    expect(screen.getByText(/Use fictional information only/)).toBeTruthy();
  });
});
