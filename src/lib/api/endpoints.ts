/** One typed function per backend endpoint used by the frontend (paths and payloads match interviewos-backend). */
import { apiRequest } from "./client";
import type {
  Activity,
  AnalyticsOverview,
  ApplicationDetail,
  ApplicationSummary,
  AssessmentDetail,
  AssessmentSummary,
  CandidateTrack,
  HrReview,
  HrReviewStatus,
  InterviewDetailFull,
  InterviewListRow,
  InterviewProgressFull,
  InterviewStatus,
  JobRoleSummary,
  Me,
  NotificationItem,
  Page,
  PipelineStage,
  Portal,
  QuestionSet,
  RecruitmentStatus,
  Remark,
  RoleCode,
  SaveAnswerInput,
  StaffUser,
  Timeline,
} from "./types";

const data = async <T>(p: Promise<{ data: T }>) => (await p).data;
const page = async <T>(p: Promise<{ data: T[]; meta: Page<T>["meta"] }>): Promise<Page<T>> => {
  const r = await p;
  return { items: r.data, meta: r.meta };
};
const id = (v: string) => encodeURIComponent(v);
type Opt = { signal?: AbortSignal };

export interface ApplicationQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: RecruitmentStatus;
  category?: CandidateTrack;
  jobRoleId?: string;
  interviewStatus?: InterviewStatus;
  from?: string;
  to?: string;
  sortBy?: "submittedAt" | "statusChangedAt" | "createdAt";
  sortDir?: "asc" | "desc";
}
export interface InterviewQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: InterviewStatus;
  reviewStatus?: HrReviewStatus;
  reviewOpen?: boolean;
  jobRoleId?: string;
  applicationId?: string;
  from?: string;
  to?: string;
  sortBy?: "createdAt" | "invitedAt" | "completedAt" | "submittedAt" | "expiresAt";
  sortDir?: "asc" | "desc";
}

export const api = {
  auth: {
    me: () => data(apiRequest<Me>("/auth/me")),
  },

  /** Candidate portal (own records only). */
  portal: {
    me: (o: Opt = {}) => data(apiRequest<Portal>("/candidates/me", o)),
  },

  interviews: {
    get: (interviewId: string, o: Opt = {}) => data(apiRequest<InterviewDetailFull>(`/interviews/${id(interviewId)}`, o)),
    progress: (interviewId: string, o: Opt = {}) => data(apiRequest<InterviewProgressFull>(`/interviews/${id(interviewId)}/progress`, o)),
    start: (interviewId: string, consent: boolean) => data(apiRequest<InterviewProgressFull>(`/interviews/${id(interviewId)}/start`, { method: "POST", body: { consent } })),
    resume: (interviewId: string) => data(apiRequest<InterviewProgressFull>(`/interviews/${id(interviewId)}/resume`, { method: "POST" })),
    interrupt: (interviewId: string) => data(apiRequest<InterviewProgressFull>(`/interviews/${id(interviewId)}/interrupt`, { method: "POST" })),
    saveAnswer: (interviewId: string, questionCode: string, input: SaveAnswerInput) =>
      data(apiRequest<{ saved: boolean; idempotentReplay: boolean; progress: InterviewProgressFull }>(`/interviews/${id(interviewId)}/answers/${id(questionCode)}`, { method: "PUT", body: input })),
    submit: (interviewId: string) =>
      data(apiRequest<{ submitted: boolean; alreadySubmitted: boolean; progress: InterviewProgressFull }>(`/interviews/${id(interviewId)}/submit`, { method: "POST" })),
    list: (q: InterviewQuery = {}, o: Opt = {}) => page(apiRequest<InterviewListRow[]>("/interviews", { query: { ...q }, ...o })),
    invite: (applicationId: string) => data(apiRequest<InterviewDetailFull>("/interviews", { method: "POST", body: { applicationId } })),
  },

  applications: {
    list: (q: ApplicationQuery = {}, o: Opt = {}) => page(apiRequest<ApplicationSummary[]>("/applications", { query: { ...q }, ...o })),
    get: (applicationId: string, o: Opt = {}) => data(apiRequest<ApplicationDetail>(`/applications/${id(applicationId)}`, o)),
    timeline: (applicationId: string, o: Opt = {}) => data(apiRequest<Timeline>(`/applications/${id(applicationId)}/timeline`, o)),
    updateStatus: (applicationId: string, status: RecruitmentStatus, extra: { note?: string; remark?: string } = {}) =>
      data(apiRequest<{ id: string; status: RecruitmentStatus; statusLabel: string; allowedTransitions: RecruitmentStatus[] }>(`/applications/${id(applicationId)}/status`, { method: "PATCH", body: { status, ...extra } })),
    addRemark: (applicationId: string, body: string) => data(apiRequest<Remark>(`/applications/${id(applicationId)}/remarks`, { method: "POST", body: { body } })),
  },

  reviews: {
    update: (reviewId: string, status: HrReviewStatus, remarks?: string) => data(apiRequest<HrReview>(`/hr-reviews/${id(reviewId)}`, { method: "PATCH", body: { status, ...(remarks ? { remarks } : {}) } })),
  },

  assessments: {
    forInterview: (interviewId: string, o: Opt = {}) => data(apiRequest<{ notice: string; reports: AssessmentSummary[] }>("/assessments", { query: { interviewId }, ...o })),
    get: (reportId: string, o: Opt = {}) => data(apiRequest<AssessmentDetail>(`/assessments/${id(reportId)}`, o)),
  },

  recruitment: {
    pipeline: (o: Opt = {}) => data(apiRequest<{ total: number; stages: PipelineStage[] }>("/recruitment/pipeline", o)),
  },

  analytics: {
    overview: (q: { from?: string; to?: string } = {}, o: Opt = {}) => data(apiRequest<AnalyticsOverview>("/analytics/overview", { query: q, ...o })),
    activity: (weeks = 12, o: Opt = {}) => data(apiRequest<Activity>("/analytics/activity", { query: { weeks }, ...o })),
  },

  notifications: {
    list: (q: { page?: number; limit?: number; unreadOnly?: boolean } = {}, o: Opt = {}) => page(apiRequest<NotificationItem[]>("/notifications", { query: q, ...o })),
    markRead: (notificationId: string) => data(apiRequest(`/notifications/${id(notificationId)}/read`, { method: "PATCH" })),
    markAllRead: () => data(apiRequest<{ updated: number }>("/notifications/read-all", { method: "POST" })),
  },

  users: {
    list: (q: { page?: number; limit?: number; search?: string } = {}, o: Opt = {}) => page(apiRequest<StaffUser[]>("/users", { query: q, ...o })),
    setRoles: (userId: string, roles: RoleCode[]) => data(apiRequest<StaffUser>(`/users/${id(userId)}/roles`, { method: "PATCH", body: { roles } })),
    setStatus: (userId: string, status: StaffUser["status"]) => data(apiRequest<StaffUser>(`/users/${id(userId)}/status`, { method: "PATCH", body: { status } })),
  },

  questionSets: {
    list: (o: Opt = {}) => data(apiRequest<QuestionSet[]>("/question-sets", o)),
  },

  jobRoles: {
    list: (o: Opt = {}) => data(apiRequest<JobRoleSummary[]>("/job-roles", o)),
  },
};
