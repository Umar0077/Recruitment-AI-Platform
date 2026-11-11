/**
 * Display labels/tones for backend enum values. Values come from the backend unchanged;
 * these maps only decide how they look. Recruitment labels reuse the HR document labels.
 */
import type { Tone } from "@/lib/demo/statuses";
import { statusTone } from "@/lib/demo/statuses";
import type { RecruitmentStatus as UiRecruitmentStatus, Track } from "@/types";
import type { AssessmentStatus, CandidateTrack, HrReviewStatus, InterviewStatus, RecruitmentStatus } from "./types";

/** Backend recruitment status ↔ the frontend's lower-case ids (same 18 statuses). */
export const toUiStatus = (s: RecruitmentStatus): UiRecruitmentStatus => (s === "CANDIDATE_WITHDRAWN" ? "withdrawn" : (s.toLowerCase() as UiRecruitmentStatus));
export const fromUiStatus = (s: UiRecruitmentStatus): RecruitmentStatus => (s === "withdrawn" ? "CANDIDATE_WITHDRAWN" : (s.toUpperCase() as RecruitmentStatus));
export const recruitmentTone = (s: RecruitmentStatus): Tone => statusTone(toUiStatus(s));

export const trackOf = (t: CandidateTrack): Track => (t === "EXPERIENCED_FE_CLOSER" ? "experienced" : "fresher");
export const TRACK_LABEL: Record<CandidateTrack, string> = { EXPERIENCED_FE_CLOSER: "Experienced FE Closer", CSR_FRESHER: "CSR Fresher" };

export const INTERVIEW_STATUS: Record<InterviewStatus, { label: string; tone: Tone }> = {
  PENDING: { label: "Pending", tone: "warning" },
  IN_PROGRESS: { label: "In Progress", tone: "cyan" },
  INTERRUPTED: { label: "Interrupted", tone: "warning" },
  COMPLETED: { label: "Awaiting Submission", tone: "blue" },
  SUBMITTED: { label: "Submitted", tone: "success" },
  EXPIRED: { label: "Expired", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export const REVIEW_STATUS: Record<HrReviewStatus, { label: string; tone: Tone }> = {
  PENDING_REVIEW: { label: "Pending Review", tone: "indigo" },
  IN_REVIEW: { label: "In Review", tone: "cyan" },
  REVIEWED: { label: "Reviewed", tone: "success" },
  FURTHER_REVIEW_REQUIRED: { label: "Further Review Required", tone: "warning" },
};

export const ASSESSMENT_STATUS: Record<AssessmentStatus | "NOT_AVAILABLE", { label: string; tone: Tone; body: string }> = {
  NOT_AVAILABLE: { label: "Not Available", tone: "neutral", body: "No assessment exists for this interview." },
  PENDING: { label: "Assessment Not Yet Generated", tone: "neutral", body: "Automated assessment is not enabled yet. No scores are produced from transcripts — review the confirmed answers directly." },
  PROCESSING: { label: "Processing", tone: "cyan", body: "The assessment is being prepared." },
  COMPLETED: { label: "Completed", tone: "success", body: "" },
  FAILED: { label: "Failed", tone: "danger", body: "The assessment could not be generated. Review the confirmed answers directly." },
  REVIEW_REQUIRED: { label: "Review Required", tone: "warning", body: "The assessment needs a human check before use." },
};

export const ANSWER_SOURCE: Record<string, string> = { SPEECH_TO_TEXT: "Speech-to-text", TYPED_FALLBACK: "Typed" };
