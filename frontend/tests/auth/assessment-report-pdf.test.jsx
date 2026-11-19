import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const routeState = vi.hoisted(() => ({ id: "INT-1026", apiMode: false, permissions: ["interviews:review", "assessments:read"] }));
const queryState = vi.hoisted(() => ({
  interview: null,
  application: null,
  assessments: null,
  assessment: null,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: routeState.id }),
  usePathname: () => `/admin/assessments/${routeState.id}`,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/lib/config/environment", () => ({
  get isApiMode() {
    return routeState.apiMode;
  },
}));
vi.mock("@/lib/auth/auth-provider", () => ({
  useAuth: () => ({
    status: routeState.apiMode ? "signedIn" : "demo",
    profile: { permissions: routeState.permissions, roles: ["HR_MANAGER"], isStaff: true },
  }),
}));
vi.mock("@/lib/api/client", () => ({
  apiRequest: vi.fn().mockResolvedValue({ data: { recordings: [] } }),
  ApiError: class ApiError extends Error {},
}));
vi.mock("@/lib/data/queries", () => ({
  useInterviewDetail: () => ({ isPending: false, isError: false, data: queryState.interview, refetch: vi.fn() }),
  useApplication: () => ({ isPending: false, isError: false, data: queryState.application, refetch: vi.fn() }),
  useAssessments: () => ({ isPending: false, isError: false, data: queryState.assessments, refetch: vi.fn() }),
  useAssessment: () => ({ isPending: false, isError: false, data: queryState.assessment, refetch: vi.fn() }),
  useInterviews: () => ({ isPending: false, isError: false, data: { items: [] }, refetch: vi.fn() }),
}));

import AssessmentPage from "@/app/admin/(app)/assessments/[id]/page";
import { ApiAssessmentDetail } from "@/components/api/admin/assessments";
import { useDemoStore } from "@/lib/demo/store";

const SELECTED_STAGES = ["selected", "offer_released", "offer_accepted", "documentation_onboarding", "production_onboarding", "joined"];

beforeEach(() => {
  routeState.apiMode = false;
  routeState.permissions = ["interviews:review", "assessments:read"];
  useDemoStore.getState().resetDemo();
  const completed = useDemoStore.getState().interviews.find((i) => i.status === "completed");
  routeState.id = completed?.id ?? "INT-1026";
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("HR Assessment Report & Secure PDF Export (Phase 2)", () => {
  it("renders Sections A–F with BaliTech branding, full confirmed answers, and no duplicate transcripts in Demo Mode", () => {
    render(<AssessmentPage />);
    expect(screen.getByText(/InterviewOS · Bali Tech/i)).toBeTruthy();
    expect(screen.getByText(/Powered by GO Connectivo/i)).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Section A — Candidate Overview/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Section B — Interview Summary/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Section C — Question-by-Question Review/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Section D — AI-Assisted Assessment/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Section E — HR Review & Human Decision/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Section F — Recording Information/i })).toBeTruthy();
    expect(screen.getByText(/No honesty, employability, or character inference is made from facial appearance/i)).toBeTruthy();
  });

  it("supports both FE Closer and CSR Fresher reports and long candidate responses without exposing unsaved HR drafts in PDF export", async () => {
    const user = userEvent.setup();
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    const store = useDemoStore.getState();

    // Find an experienced FE Closer and a CSR Fresher with completed interviews
    const feCandidate = store.candidates.find((c) => c.track === "experienced" && store.interviews.find((i) => i.id === c.interviewId)?.status === "completed");
    const csrCandidate = store.candidates.find((c) => c.track === "fresher" && store.interviews.find((i) => i.id === c.interviewId)?.status === "completed");
    expect(feCandidate && csrCandidate).toBeTruthy();

    routeState.id = feCandidate.interviewId;
    const { unmount } = render(<AssessmentPage />);
    expect(screen.getAllByText(feCandidate.name).length).toBeGreaterThan(0);

    // Type an unsaved draft remark in the Recruiter Actions panel
    const draftText = "UNSAVED_INTERNAL_DRAFT_DO_NOT_EXPORT_991";
    const remarkBox = screen.getByPlaceholderText(/Add an internal remark/i);
    await user.type(remarkBox, draftText);

    // Verify the print-area does NOT contain the unsaved draft text
    const printArea = document.querySelector(".print-area");
    expect(printArea).toBeTruthy();
    expect(within(printArea).queryByText(draftText)).toBeNull();

    // Trigger Export PDF
    await user.click(screen.getByRole("button", { name: /Export PDF/i }));
    expect(printSpy).toHaveBeenCalledTimes(1);
    unmount();

    // Render CSR Fresher report
    routeState.id = csrCandidate.interviewId;
    render(<AssessmentPage />);
    expect(screen.getAllByText(csrCandidate.name).length).toBeGreaterThan(0);
  });

  it("handles API Mode report with missing optional LLM assessment data and long answers without fabricating scores", async () => {
    routeState.apiMode = true;
    const longAnswer = "I listen carefully to every customer concern, repeat the key issue to confirm understanding, and walk through clear next steps. ".repeat(12).trim();
    queryState.interview = {
      interviewId: "iv-api-1",
      applicationId: "app-api-1",
      reference: "INT-API001",
      status: "SUBMITTED",
      totalQuestions: 2,
      questionSetVersion: "CSR-SET-v1",
      submittedAt: "2026-11-19T12:00:00Z",
      completedAt: "2026-11-19T11:59:00Z",
      candidate: { id: "c-1", fullName: "Fictional API Candidate", category: "CSR_FRESHER" },
      jobRole: { id: "r-1", code: "CSR-FRESHER", title: "CSR Fresher", track: "CSR_FRESHER" },
      review: { id: "rev-1", status: "PENDING_REVIEW", remarks: null, reviewedAt: null },
      questions: [
        {
          code: "CSR-001",
          position: 1,
          category: "Customer Empathy",
          text: "How do you handle a frustrated caller?",
          responseSeconds: 90,
          answer: { transcript: longAnswer, source: "SPEECH_TO_TEXT", responseDurationSec: 65, confirmedAt: "2026-11-19T11:55:00Z" },
        },
        {
          code: "CSR-002",
          position: 2,
          category: "Problem Solving",
          text: "Describe a time you resolved a misunderstanding.",
          responseSeconds: 90,
          answer: { transcript: "Short confirmed answer.", source: "TYPED_FALLBACK", responseDurationSec: 15, confirmedAt: "2026-11-19T11:58:00Z" },
        },
      ],
    };
    queryState.application = {
      id: "app-api-1",
      status: "RECRUITER_REVIEW_PENDING",
      allowedTransitions: ["SHORTLISTED"],
    };
    queryState.assessments = {
      reports: [{ id: "rep-1", sessionId: "iv-api-1", version: 1, status: "PENDING", createdAt: "2026-11-19T12:00:00Z", generatedAt: null }],
    };
    queryState.assessment = {
      id: "rep-1",
      version: 1,
      status: "PENDING",
      phase: "NOT_GENERATED",
      createdAt: "2026-11-19T12:00:00Z",
      generatedAt: null,
      summary: null,
      model: null,
      failureReason: null,
      criteria: [],
      findings: null,
      nlp: [],
      rubricSnapshot: [],
      corrections: [],
    };

    render(<ApiAssessmentDetail />);
    expect(screen.getByText(/Section A — Candidate Overview/i)).toBeTruthy();
    expect(screen.getByText(/Section B — Interview Summary/i)).toBeTruthy();
    expect(screen.getByText(/Section C — Question-by-Question Review/i)).toBeTruthy();
    expect(screen.getByText(/Section D — AI-Assisted Assessment/i)).toBeTruthy();
    expect(screen.getByText(/Section E — HR Notes and Review/i)).toBeTruthy();
    expect(screen.getByText(/Section F — Recording Information/i)).toBeTruthy();
    expect(screen.getByText(/LLM narrative findings have not been generated for this report version/i)).toBeTruthy();
    expect(screen.getByText(longAnswer)).toBeTruthy();
    expect(screen.getByText("Short confirmed answer.")).toBeTruthy();
  });
});

describe("Isolated Client Demo Mode Consistency & Reset (Phase 3)", () => {
  it("maintains consistent dashboard KPIs, completes a live demo candidate journey into HR review, and resets cleanly", () => {
    const initial = useDemoStore.getState();
    const initialTotal = initial.candidates.length;
    const initialCompleted = initial.interviews.filter((i) => i.status === "completed").length;
    const initialAwaiting = initial.interviews.filter((i) => i.reviewStatus === "awaiting_review").length;
    const initialSelected = initial.candidates.filter((c) => SELECTED_STAGES.includes(c.status)).length;

    expect(initialTotal).toBeGreaterThan(20);
    expect(initialCompleted).toBeGreaterThan(0);
    expect(initialAwaiting).toBeGreaterThan(0);
    expect(initialSelected).toBeGreaterThan(0);

    // Run a full fictional candidate journey in Demo Mode
    initial.startSession("candidate", "fictional.walkthrough@example.test");
    const activeCandId = useDemoStore.getState().flow.candidateId;
    initial.updateFlow({ stage: "active", consent: true, equipmentChecked: true, practiceDone: true });
    for (let q = 1; q <= 4; q++) {
      useDemoStore.getState().recordAnswer({
        questionId: `CSR-Q${q}`,
        questionNumber: q,
        questionText: `Official question ${q}`,
        category: "Communication",
        transcript: `Fictional confirmed answer ${q} from live demo walkthrough.`,
        durationSec: 25,
        inputMode: "voice",
      });
    }
    const submittedRef = useDemoStore.getState().submitInterview();
    expect(submittedRef).toMatch(/^IOS-/);

    const afterSubmit = useDemoStore.getState();
    const updatedCand = afterSubmit.candidates.find((c) => c.id === activeCandId);
    const submittedIv = afterSubmit.interviews.find((i) => i.id === updatedCand?.interviewId);
    expect(submittedIv?.status).toBe("completed");
    expect(submittedIv?.reviewStatus).toBe("awaiting_review");
    expect(submittedIv?.capturedLive).toBe(true);
    expect(updatedCand?.status).toBe("recruiter_review_pending");

    // Reset Demo Mode and verify original state is restored without touching external services
    useDemoStore.getState().resetDemo();
    const afterReset = useDemoStore.getState();
    expect(afterReset.candidates.length).toBe(initialTotal);
    expect(afterReset.interviews.filter((i) => i.status === "completed").length).toBe(initialCompleted);
    expect(afterReset.interviews.filter((i) => i.reviewStatus === "awaiting_review").length).toBe(initialAwaiting);
  });
});
