import type { InterviewStatus, RecruitmentStatus, ReviewStatus, TeamRole } from "@/types";

export type Tone = "neutral" | "blue" | "cyan" | "indigo" | "success" | "warning" | "danger";

export const RECRUITMENT_STATUSES: { id: RecruitmentStatus; label: string; tone: Tone; candidateLabel: string }[] = [
  { id: "application_received", label: "Application Received", tone: "neutral", candidateLabel: "Application Received" },
  { id: "ai_interview_pending", label: "AI Interview Pending", tone: "warning", candidateLabel: "AI Interview Pending" },
  { id: "ai_interview_in_progress", label: "AI Interview In Progress", tone: "cyan", candidateLabel: "AI Interview In Progress" },
  { id: "ai_interview_completed", label: "AI Interview Completed", tone: "blue", candidateLabel: "AI Interview Completed" },
  { id: "recruiter_review_pending", label: "Recruiter Review Pending", tone: "indigo", candidateLabel: "Under Recruiter Review" },
  { id: "shortlisted", label: "Shortlisted", tone: "blue", candidateLabel: "Under Recruiter Review" },
  { id: "hr_interview_scheduled", label: "HR Interview Scheduled", tone: "cyan", candidateLabel: "Under Recruiter Review" },
  { id: "hr_interview_completed", label: "HR Interview Completed", tone: "blue", candidateLabel: "Under Recruiter Review" },
  { id: "final_assessment_pending", label: "Final Assessment Pending", tone: "warning", candidateLabel: "Under Recruiter Review" },
  { id: "final_assessment_completed", label: "Final Assessment Completed", tone: "blue", candidateLabel: "Under Recruiter Review" },
  { id: "selected", label: "Selected", tone: "success", candidateLabel: "Under Recruiter Review" },
  { id: "offer_released", label: "Offer Released", tone: "success", candidateLabel: "Under Recruiter Review" },
  { id: "offer_accepted", label: "Offer Accepted", tone: "success", candidateLabel: "Under Recruiter Review" },
  { id: "documentation_onboarding", label: "Documentation & Onboarding", tone: "indigo", candidateLabel: "Under Recruiter Review" },
  { id: "production_onboarding", label: "Production Onboarding", tone: "indigo", candidateLabel: "Under Recruiter Review" },
  { id: "joined", label: "Joined", tone: "success", candidateLabel: "Under Recruiter Review" },
  { id: "not_selected", label: "Not Selected", tone: "danger", candidateLabel: "Under Recruiter Review" },
  { id: "withdrawn", label: "Candidate Withdrawn", tone: "neutral", candidateLabel: "Withdrawn" },
];

const byId = Object.fromEntries(RECRUITMENT_STATUSES.map((s) => [s.id, s])) as Record<RecruitmentStatus, (typeof RECRUITMENT_STATUSES)[number]>;

export const statusLabel = (s: RecruitmentStatus) => byId[s].label;
export const statusTone = (s: RecruitmentStatus) => byId[s].tone;
export const statusOrder = (s: RecruitmentStatus) => RECRUITMENT_STATUSES.findIndex((x) => x.id === s);

/** Canonical forward path through the workflow. */
export const STATUS_PATH: RecruitmentStatus[] = RECRUITMENT_STATUSES.map((s) => s.id).filter(
  (s) => s !== "not_selected" && s !== "withdrawn",
);

export const CLOSED_STATUSES: RecruitmentStatus[] = ["not_selected", "withdrawn"];
export const PRE_INTERVIEW: RecruitmentStatus[] = ["application_received", "ai_interview_pending", "ai_interview_in_progress"];

export interface PipelineColumn {
  id: string;
  label: string;
  statuses: RecruitmentStatus[];
  hint: string;
}

export const PIPELINE_COLUMNS: PipelineColumn[] = [
  { id: "ai_review", label: "AI Review", statuses: ["ai_interview_completed", "recruiter_review_pending"], hint: "Interview complete, awaiting recruiter review" },
  { id: "shortlisted", label: "Shortlisted", statuses: ["shortlisted"], hint: "Approved for an HR interview" },
  { id: "hr_interview", label: "HR Interview", statuses: ["hr_interview_scheduled", "hr_interview_completed"], hint: "Scheduled or completed HR conversations" },
  { id: "final_assessment", label: "Final Assessment", statuses: ["final_assessment_pending", "final_assessment_completed"], hint: "Final evaluation stage" },
  { id: "selected", label: "Selected", statuses: ["selected"], hint: "Selection decision made by HR" },
  { id: "offer", label: "Offer", statuses: ["offer_released", "offer_accepted"], hint: "Offer released or accepted" },
  { id: "onboarding", label: "Onboarding", statuses: ["documentation_onboarding", "production_onboarding"], hint: "Documentation and production onboarding" },
  { id: "joined", label: "Joined", statuses: ["joined"], hint: "Candidate has joined" },
];

export const PRE_COLUMN: PipelineColumn = { id: "pre", label: "Awaiting Interview", statuses: PRE_INTERVIEW, hint: "Application received or interview not yet complete" };
export const CLOSED_COLUMNS: PipelineColumn[] = [
  { id: "not_selected", label: "Not Selected", statuses: ["not_selected"], hint: "Closed by HR decision" },
  { id: "withdrawn", label: "Candidate Withdrawn", statuses: ["withdrawn"], hint: "Candidate withdrew from the process" },
];

export const ALL_COLUMNS = [PRE_COLUMN, ...PIPELINE_COLUMNS, ...CLOSED_COLUMNS];
export const columnFor = (s: RecruitmentStatus) => ALL_COLUMNS.find((c) => c.statuses.includes(s))!;
export const columnIndex = (s: RecruitmentStatus) => PIPELINE_COLUMNS.findIndex((c) => c.statuses.includes(s));

export const INTERVIEW_STATUS_META: Record<InterviewStatus, { label: string; tone: Tone }> = {
  not_invited: { label: "Not Invited", tone: "neutral" },
  not_started: { label: "Pending", tone: "warning" },
  in_progress: { label: "In Progress", tone: "cyan" },
  completed: { label: "Completed", tone: "success" },
  expired: { label: "Expired", tone: "danger" },
};

export const REVIEW_STATUS_META: Record<ReviewStatus, { label: string; tone: Tone }> = {
  not_applicable: { label: "—", tone: "neutral" },
  awaiting_review: { label: "Awaiting Review", tone: "indigo" },
  reviewed: { label: "Reviewed", tone: "success" },
  follow_up: { label: "Follow-up", tone: "warning" },
};

export const TEAM_ROLE_LABEL: Record<TeamRole, string> = {
  super_admin: "Super Admin",
  hr_manager: "HR Manager",
  recruiter: "Recruiter",
  reviewer: "Reviewer",
};
