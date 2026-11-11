"use client";
/**
 * API-mode data hooks. Every screen reads server state through these (never its own fetch),
 * so caching, deduplication and invalidation behave the same everywhere.
 * The backend stays authoritative: mutations only report success after the server confirms.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, type ApplicationQuery, type InterviewQuery } from "@/lib/api/endpoints";
import type { HrReviewStatus, RecruitmentStatus, SaveAnswerInput } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-provider";

export const qk = {
  portal: ["portal"] as const,
  interview: (id: string) => ["interview", id] as const,
  progress: (id: string) => ["interview", id, "progress"] as const,
  interviews: (q: InterviewQuery) => ["interviews", q] as const,
  applications: (q: ApplicationQuery) => ["applications", q] as const,
  application: (id: string) => ["application", id] as const,
  timeline: (id: string) => ["application", id, "timeline"] as const,
  assessments: (interviewId: string) => ["assessments", interviewId] as const,
  assessment: (id: string) => ["assessment", id] as const,
  pipeline: ["pipeline"] as const,
  overview: (q: object) => ["analytics", "overview", q] as const,
  activity: (weeks: number) => ["analytics", "activity", weeks] as const,
  notifications: ["notifications"] as const,
  users: ["users"] as const,
  questionSets: ["question-sets"] as const,
  jobRoles: ["job-roles"] as const,
};

/** Queries run only once the signed-in profile is known (prevents unauthenticated requests on load). */
function useReady() {
  const { status, profile } = useAuth();
  return status === "signedIn" && !!profile;
}

// ───────────────────────── Candidate ─────────────────────────

export function usePortal() {
  const ready = useReady();
  return useQuery({ queryKey: qk.portal, queryFn: ({ signal }) => api.portal.me({ signal }), enabled: ready });
}

/** The candidate's current interview: the newest one, preferring an open/unsubmitted session. */
export function useMyInterview() {
  const portal = usePortal();
  const apps = portal.data?.applications ?? [];
  const all = apps.flatMap((a) => a.interviews.map((i) => ({ application: a, interview: i })));
  const open = all.find((x) => ["PENDING", "IN_PROGRESS", "INTERRUPTED", "COMPLETED"].includes(x.interview.status));
  return { ...portal, candidate: portal.data?.candidate ?? null, current: open ?? all[0] ?? null, count: all.length };
}

export function useProgress(interviewId?: string) {
  const ready = useReady();
  return useQuery({ queryKey: qk.progress(interviewId ?? ""), queryFn: ({ signal }) => api.interviews.progress(interviewId!, { signal }), enabled: ready && !!interviewId, staleTime: 0 });
}

export function useInterviewDetail(interviewId?: string) {
  const ready = useReady();
  return useQuery({ queryKey: qk.interview(interviewId ?? ""), queryFn: ({ signal }) => api.interviews.get(interviewId!, { signal }), enabled: ready && !!interviewId });
}

function refreshCandidate(qc: QueryClient, interviewId: string) {
  void qc.invalidateQueries({ queryKey: qk.portal });
  void qc.invalidateQueries({ queryKey: qk.interview(interviewId) });
}

export function useStartInterview(interviewId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ consent, resume }: { consent: boolean; resume?: boolean }) => (resume ? api.interviews.resume(interviewId!) : api.interviews.start(interviewId!, consent)),
    onSuccess: (p) => {
      qc.setQueryData(qk.progress(p.interviewId), p);
      refreshCandidate(qc, p.interviewId);
    },
  });
}

export function useSaveAnswer(interviewId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ code, input }: { code: string; input: SaveAnswerInput }) => api.interviews.saveAnswer(interviewId, code, input),
    onSuccess: (r) => {
      qc.setQueryData(qk.progress(interviewId), r.progress);
      refreshCandidate(qc, interviewId);
    },
  });
}

export function useInterruptInterview(interviewId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.interviews.interrupt(interviewId!),
    onSuccess: (p) => {
      qc.setQueryData(qk.progress(p.interviewId), p);
      refreshCandidate(qc, p.interviewId);
    },
  });
}

export function useSubmitInterview(interviewId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.interviews.submit(interviewId!),
    onSuccess: (r) => {
      qc.setQueryData(qk.progress(r.progress.interviewId), r.progress);
      refreshCandidate(qc, r.progress.interviewId);
    },
  });
}

// ───────────────────────── Staff ─────────────────────────

export function useApplications(q: ApplicationQuery) {
  const ready = useReady();
  return useQuery({ queryKey: qk.applications(q), queryFn: ({ signal }) => api.applications.list(q, { signal }), enabled: ready, placeholderData: keepPreviousData });
}
export function useApplication(id?: string) {
  const ready = useReady();
  return useQuery({ queryKey: qk.application(id ?? ""), queryFn: ({ signal }) => api.applications.get(id!, { signal }), enabled: ready && !!id });
}
export function useTimeline(id?: string) {
  const ready = useReady();
  return useQuery({ queryKey: qk.timeline(id ?? ""), queryFn: ({ signal }) => api.applications.timeline(id!, { signal }), enabled: ready && !!id });
}
export function useInterviews(q: InterviewQuery, enabled = true) {
  const ready = useReady();
  return useQuery({ queryKey: qk.interviews(q), queryFn: ({ signal }) => api.interviews.list(q, { signal }), enabled: ready && enabled, placeholderData: keepPreviousData });
}
export function useAssessments(interviewId?: string) {
  const ready = useReady();
  return useQuery({ queryKey: qk.assessments(interviewId ?? ""), queryFn: ({ signal }) => api.assessments.forInterview(interviewId!, { signal }), enabled: ready && !!interviewId });
}
export function useAssessment(reportId?: string) {
  const ready = useReady();
  return useQuery({ queryKey: qk.assessment(reportId ?? ""), queryFn: ({ signal }) => api.assessments.get(reportId!, { signal }), enabled: ready && !!reportId });
}
export function usePipelineCounts() {
  const ready = useReady();
  return useQuery({ queryKey: qk.pipeline, queryFn: ({ signal }) => api.recruitment.pipeline({ signal }), enabled: ready });
}
export function useOverview(q: { from?: string; to?: string } = {}) {
  const ready = useReady();
  return useQuery({ queryKey: qk.overview(q), queryFn: ({ signal }) => api.analytics.overview(q, { signal }), enabled: ready, placeholderData: keepPreviousData });
}
export function useActivity(weeks: number) {
  const ready = useReady();
  return useQuery({ queryKey: qk.activity(weeks), queryFn: ({ signal }) => api.analytics.activity(weeks, { signal }), enabled: ready, placeholderData: keepPreviousData });
}
export function useNotifications() {
  const ready = useReady();
  const staff = useAuth().isStaff;
  // No push channel exists yet: refresh when the window regains focus and every 2 minutes while open.
  return useQuery({ queryKey: qk.notifications, queryFn: ({ signal }) => api.notifications.list({ limit: 20 }, { signal }), enabled: ready && staff, refetchInterval: 120_000 });
}
export function useUsers(enabled: boolean) {
  const ready = useReady();
  return useQuery({ queryKey: qk.users, queryFn: ({ signal }) => api.users.list({ limit: 100 }, { signal }), enabled: ready && enabled });
}
export function useQuestionSets() {
  const ready = useReady();
  return useQuery({ queryKey: qk.questionSets, queryFn: ({ signal }) => api.questionSets.list({ signal }), enabled: ready });
}
export function useJobRoles() {
  const ready = useReady();
  return useQuery({ queryKey: qk.jobRoles, queryFn: ({ signal }) => api.jobRoles.list({ signal }), enabled: ready, staleTime: 5 * 60_000 });
}

/** After any HR mutation: refresh every view that shows recruitment state, so screens stay consistent. */
function refreshRecruitment(qc: QueryClient, applicationId?: string) {
  for (const key of [["applications"], ["interviews"], ["interview"], ["pipeline"], ["analytics"], ["notifications"]]) void qc.invalidateQueries({ queryKey: key });
  if (applicationId) void qc.invalidateQueries({ queryKey: qk.application(applicationId) });
}

export function useUpdateStatus(applicationId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ status, note, remark }: { status: RecruitmentStatus; note?: string; remark?: string }) => api.applications.updateStatus(applicationId!, status, { note, remark }),
    onSuccess: () => refreshRecruitment(qc, applicationId),
  });
}
export function useAddRemark(applicationId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api.applications.addRemark(applicationId!, body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.application(applicationId ?? "") }),
  });
}
export function useUpdateReview(applicationId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reviewId, status, remarks }: { reviewId: string; status: HrReviewStatus; remarks?: string }) => api.reviews.update(reviewId, status, remarks),
    onSuccess: () => refreshRecruitment(qc, applicationId),
  });
}
export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | "all") => (id === "all" ? api.notifications.markAllRead() : api.notifications.markRead(id)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.notifications }),
  });
}

/** Server-side search used by the command palette (only runs for 2+ characters). */
export function useApplicationSearch(term: string) {
  const ready = useReady();
  const q: ApplicationQuery = { search: term, limit: 6, sortBy: "statusChangedAt" };
  return useQuery({ queryKey: qk.applications(q), queryFn: ({ signal }) => api.applications.list(q, { signal }), enabled: ready && term.length >= 2, staleTime: 15_000 });
}

/** Status change where the application is chosen per call (pipeline drag & drop). */
export function useMoveApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ applicationId, status, note }: { applicationId: string; status: RecruitmentStatus; note?: string }) => api.applications.updateStatus(applicationId, status, { note }),
    onSuccess: (_r, v) => refreshRecruitment(qc, v.applicationId),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { userId: string; roles?: import("@/lib/api/types").RoleCode[]; status?: import("@/lib/api/types").StaffUser["status"] }) =>
      v.roles ? api.users.setRoles(v.userId, v.roles) : api.users.setStatus(v.userId, v.status!),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.users }),
  });
}

export function useInviteInterview(applicationId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.interviews.invite(applicationId!),
    onSuccess: () => refreshRecruitment(qc, applicationId),
  });
}

/** Sidebar badge: open HR reviews (same definition as the dashboard), staff only. */
export function useOpenReviewCount() {
  const { status, profile } = useAuth();
  const enabled = status === "signedIn" && !!profile?.isStaff;
  const q: InterviewQuery = { reviewOpen: true, limit: 1 };
  const r = useQuery({ queryKey: qk.interviews(q), queryFn: ({ signal }) => api.interviews.list(q, { signal }), enabled });
  return r.data?.meta.total ?? 0;
}
