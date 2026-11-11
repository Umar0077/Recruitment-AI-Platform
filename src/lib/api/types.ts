/** Wire types for the InterviewOS REST API v1 (mirrors interviewos-backend responses). */
import type { Track } from "@/types";

export interface ApiMeta {
  requestId?: string;
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  [extra: string]: unknown;
}
export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta: ApiMeta;
}
export interface ApiFailure {
  success: false;
  error: { code: string; message: string; details?: unknown };
  meta?: ApiMeta;
}
export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;
export interface Page<T> {
  items: T[];
  meta: ApiMeta;
}

export type RoleCode = "SUPER_ADMIN" | "HR_MANAGER" | "RECRUITER" | "REVIEWER" | "CANDIDATE";
export type CandidateTrack = "EXPERIENCED_FE_CLOSER" | "CSR_FRESHER";
export type InterviewStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "SUBMITTED" | "INTERRUPTED" | "EXPIRED" | "CANCELLED";
export type AnswerSource = "SPEECH_TO_TEXT" | "TYPED_FALLBACK";
export type RecruitmentStatus =
  | "APPLICATION_RECEIVED" | "AI_INTERVIEW_PENDING" | "AI_INTERVIEW_IN_PROGRESS" | "AI_INTERVIEW_COMPLETED"
  | "RECRUITER_REVIEW_PENDING" | "SHORTLISTED" | "HR_INTERVIEW_SCHEDULED" | "HR_INTERVIEW_COMPLETED"
  | "FINAL_ASSESSMENT_PENDING" | "FINAL_ASSESSMENT_COMPLETED" | "SELECTED" | "OFFER_RELEASED" | "OFFER_ACCEPTED"
  | "DOCUMENTATION_ONBOARDING" | "PRODUCTION_ONBOARDING" | "JOINED" | "NOT_SELECTED" | "CANDIDATE_WITHDRAWN";

/** Frontend track ↔ backend enum. */
export const TRACK_TO_API: Record<Track, CandidateTrack> = { experienced: "EXPERIENCED_FE_CLOSER", fresher: "CSR_FRESHER" };
export const TRACK_FROM_API: Record<CandidateTrack, Track> = { EXPERIENCED_FE_CLOSER: "experienced", CSR_FRESHER: "fresher" };

export interface Me {
  id: string;
  email: string | null;
  displayName: string | null;
  roles: RoleCode[];
  permissions: string[];
  candidateId: string | null;
  /** True for any staff role (admin workspace access is still decided per permission by the backend). */
  isStaff: boolean;
  /** Sign-in providers linked to this user, e.g. ["google.com"]. */
  providers: string[];
}

export interface SessionQuestion {
  code: string;
  position: number;
  category: string;
  text: string;
  responseSeconds: number;
}

export interface InterviewProgress {
  interviewId: string;
  status: InterviewStatus;
  candidateTrack: CandidateTrack;
  jobRole: { id: string; code: string; title: string; track: CandidateTrack };
  questionSetVersion: string;
  totalQuestions: number;
  completedQuestions: number;
  nextQuestion: SessionQuestion | null;
  startedAt: string | null;
  submittedAt: string | null;
  expiresAt: string;
  remainingSeconds: number;
  lastActivityAt: string | null;
  confirmedAnswers: { questionCode: string; position: number; source: AnswerSource; confirmedAt: string }[];
}

export interface InterviewDetail extends InterviewProgress {
  candidate: { id: string; fullName: string; category: CandidateTrack };
  invitedAt: string;
  completedAt: string | null;
  isSample: boolean;
  questions: (SessionQuestion & {
    answer: { transcript: string; source: AnswerSource; responseDurationSec: number; confirmedAt: string; questionTextSnapshot: string } | null;
  })[];
  /** Present for staff only. */
  review?: { id: string; status: string; remarks: string | null; reviewedAt: string | null } | null;
}

export interface SaveAnswerInput {
  transcript: string;
  source: AnswerSource;
  responseDurationSec: number;
  provisionalTranscript?: string;
  engine?: string;
  language?: string;
}

export interface ApplicationSummary {
  id: string;
  status: RecruitmentStatus;
  statusLabel: string;
  submittedAt: string;
  statusChangedAt: string;
  candidate: { id: string; fullName: string; email: string | null; category: CandidateTrack; location: string | null; isSample: boolean };
  jobRole: { id: string; title: string; track: CandidateTrack };
  assignedRecruiter: { id: string; displayName: string | null } | null;
  interviews: { id: string; status: InterviewStatus; submittedAt: string | null }[];
}

export interface PipelineStage {
  status: RecruitmentStatus;
  label: string;
  position: number;
  count: number;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

// ───────────────────────── Phase 4B: shapes returned by the backend ─────────────────────────

export type HrReviewStatus = "PENDING_REVIEW" | "IN_REVIEW" | "REVIEWED" | "FURTHER_REVIEW_REQUIRED";
export type AssessmentStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "REVIEW_REQUIRED";

/** GET /candidates/me — candidate-safe (no remarks, reviews or internal outcomes). */
export interface PortalInterview {
  id: string;
  reference: string;
  status: InterviewStatus;
  questionSetVersion: string;
  totalQuestions: number;
  completedQuestions: number;
  invitedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  submittedAt: string | null;
  expiresAt: string;
}
export interface PortalApplication {
  id: string;
  reference: string;
  jobRole: { title: string; track: CandidateTrack };
  submittedAt: string;
  stage: { key: string; label: string };
  stageChangedAt: string;
  interviews: PortalInterview[];
}
export interface Portal {
  candidate: { id: string; fullName: string; category: CandidateTrack } | null;
  applications: PortalApplication[];
}

export interface InterviewProgressFull extends InterviewProgress {
  reference: string;
  applicationId: string;
}

export interface InterviewListRow {
  id: string;
  status: InterviewStatus;
  invitedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  submittedAt: string | null;
  expiresAt: string;
  isSample: boolean;
  candidate: { id: string; fullName: string; email: string | null; isSample: boolean };
  application: { id: string; status: RecruitmentStatus };
  jobRole: { id: string; title: string; track: CandidateTrack };
  questionSetVersion: { versionCode: string };
  review: { id: string; status: HrReviewStatus; reviewedAt: string | null } | null;
  assessments: { id: string; status: AssessmentStatus }[];
  _count: { answers: number; questions: number };
}

export interface HrReview {
  id: string;
  applicationId: string;
  interviewSessionId: string | null;
  reviewerId: string | null;
  status: HrReviewStatus;
  remarks: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InterviewDetailFull extends InterviewDetail {
  reference: string;
  applicationId: string;
  review?: HrReview | null;
}

export interface ApplicationDetail {
  id: string;
  status: RecruitmentStatus;
  statusLabel: string;
  statusChangedAt: string;
  submittedAt: string;
  source: string;
  details: Record<string, unknown>;
  availability: Record<string, unknown>;
  allowedTransitions: RecruitmentStatus[];
  candidate: { id: string; fullName: string; email: string | null; phone: string | null; category: CandidateTrack; location: string | null; isSample: boolean; createdAt: string };
  jobRole: { id: string; code: string; title: string; track: CandidateTrack; description: string | null };
  assignedRecruiter: { id: string; displayName: string | null; email: string | null } | null;
  interviews: { id: string; status: InterviewStatus; invitedAt: string; startedAt: string | null; submittedAt: string | null; expiresAt: string }[];
  reviews: { id: string; status: HrReviewStatus; reviewedAt: string | null; interviewSessionId: string | null }[];
}

export interface TimelineEvent {
  id: string;
  type: "APPLICATION_RECEIVED" | "STATUS_CHANGED" | "INTERVIEW_INVITED" | "INTERVIEW_STARTED" | "INTERVIEW_SUBMITTED" | "HR_REMARK_ADDED" | "HR_REVIEW_UPDATED";
  fromStatus: RecruitmentStatus | null;
  toStatus: RecruitmentStatus | null;
  note: string | null;
  createdAt: string;
  actor: { id: string; displayName: string | null; email: string | null } | null;
}
export interface Remark {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; displayName: string | null; email: string | null };
}
export interface Timeline {
  events: TimelineEvent[];
  remarks: Remark[];
}

export interface AssessmentSummary {
  id: string;
  sessionId: string;
  version: number;
  status: AssessmentStatus;
  isSample: boolean;
  generatedAt: string | null;
  createdAt: string;
}
export interface AssessmentDetail extends AssessmentSummary {
  summary: string | null;
  notice: string | null;
  criteria: { id: string; code: string; label: string; position: number; score: string | null; explanation: string | null }[];
  observations: { id: string; kind: string; text: string; questionCode: string | null }[];
}

export interface AnalyticsOverview {
  includeSample: boolean;
  range: { from: string | null; to: string | null };
  candidates: { total: number; byTrack: Partial<Record<CandidateTrack, number>> };
  applications: { total: number; byStatus: { status: RecruitmentStatus; label: string; count: number }[] };
  interviews: { issued: number; byStatus: Record<InterviewStatus, number>; completionRate: number | null; averageDurationSeconds: number | null; medianDurationSeconds: number | null };
  reviews: { pending: number };
}
export interface Activity {
  includeSample: boolean;
  weeks: { weekStart: string; applications: number; interviews: number; reviews: number }[];
}

export interface StaffUser {
  id: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  status: "ACTIVE" | "INVITED" | "DISABLED";
  lastLoginAt: string | null;
  createdAt: string;
  roles: RoleCode[];
  identities: string[];
  candidate: { id: string; fullName: string } | null;
}

export interface QuestionSetVersionSummary {
  versionCode: string;
  version: number;
  status: "DRAFT" | "PUBLISHED" | "RETIRED";
  publishedAt: string | null;
}
export interface ApiQuestion {
  id: string;
  code: string;
  position: number;
  category: string;
  text: string;
  responseSeconds: number;
  isActive: boolean;
}
export interface QuestionSet {
  id: string;
  code: string;
  title: string;
  track: CandidateTrack;
  activeVersion: (QuestionSetVersionSummary & { id: string; source: string | null; questions: ApiQuestion[] }) | null;
  versions: QuestionSetVersionSummary[];
}

export interface JobRoleSummary {
  id: string;
  code: string;
  title: string;
  track: CandidateTrack;
  description: string | null;
}
