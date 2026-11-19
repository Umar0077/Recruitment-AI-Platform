import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const fixture = vi.hoisted(() => ({ permissions: ["interviews:review"], mutate: vi.fn(), recording: vi.fn() }));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "fictional-interview" }) }));
vi.mock("@/lib/auth/auth-provider", () => ({ useAuth: () => ({ profile: { permissions: fixture.permissions } }) }));
vi.mock("@/lib/data/queries", () => ({
  useInterviewDetail: () => ({ data: { applicationId: "fictional-application", status: "SUBMITTED", candidate: { fullName: "Fictional Candidate" }, jobRole: { title: "CSR", track: "FRESHER" }, reference: "TEST-1", totalQuestions: 1, questionSetVersion: "v1", questions: [{ code: "TEST-Q", position: 1, text: "Describe listening.", category: "Communication", answer: { transcript: "I listen before responding.", source: "TYPED", responseDurationSec: 12 } }], review: { id: "review-1", status: "AWAITING_REVIEW", remarks: null } } }),
  useApplication: () => ({ data: { id: "fictional-application", status: "RECRUITER_REVIEW_PENDING", allowedTransitions: ["SHORTLISTED"] } }),
  useAssessments: () => ({ data: { reports: [] } }),
  useUpdateReview: () => ({ mutate: fixture.mutate }),
}));
vi.mock("@/components/api/admin/common", () => ({ ApiInterviewBadge: () => "Submitted", ApiRecruitmentBadge: () => "Awaiting review", ApiReviewBadge: () => "Awaiting HR Review", ApiRemarkDialog: () => null, ApiStatusDialog: () => null }));
vi.mock("@/components/api/admin/recording-review", () => ({ RecordingReview: () => { fixture.recording(); return <p>Fictional recording panel</p>; } }));
import { ApiInterviewReview } from "@/components/api/admin/interview-review";
afterEach(() => { cleanup(); fixture.permissions = ["interviews:review"]; vi.clearAllMocks(); });
it("supports keyboard review tabs, one confirmed answer, lazy recordings and preserved unsaved notes", async () => {
  const user = userEvent.setup(); render(<ApiInterviewReview />);
  expect(screen.getAllByRole("tab")).toHaveLength(5); expect(fixture.recording).not.toHaveBeenCalled();
  await user.click(screen.getByRole("tab", { name: "Interview Summary" })); await user.keyboard("{ArrowRight}");
  await waitFor(() => expect(screen.getByRole("tab", { name: "Questions & Answers" }).getAttribute("aria-selected")).toBe("true"));
  expect(screen.getAllByText("I listen before responding.")).toHaveLength(1);
  await user.click(screen.getByRole("tab", { name: "HR Decision" }));
  await user.type(screen.getByLabelText("Review notes (internal)"), "Fictional review draft");
  expect(screen.queryByRole("button", { name: "Update Recruitment Stage" })).toBeNull();
  await user.click(screen.getByRole("tab", { name: "Interview Summary" }));
  await user.click(screen.getByRole("tab", { name: "HR Decision" }));
  expect(screen.getByLabelText("Review notes (internal)").value).toBe("Fictional review draft");
  expect(fixture.mutate).not.toHaveBeenCalled();
  await user.click(screen.getByRole("tab", { name: "Recording" })); expect(fixture.recording).toHaveBeenCalled();
});
it("does not offer review mutations to a read-only account", async () => {
  fixture.permissions = ["interviews:read"];
  const user = userEvent.setup(); render(<ApiInterviewReview />);
  await user.click(screen.getByRole("tab", { name: "HR Decision" }));
  expect(screen.queryByRole("button", { name: "Save Review" })).toBeNull();
  expect(screen.getByText(/Editing the HR decision requires review permission/)).toBeTruthy();
});
