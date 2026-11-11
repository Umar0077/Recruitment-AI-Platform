"use client";
import { useMemo } from "react";
import type { Candidate, InterviewSession, RecruitmentStatus } from "@/types";
import { useDemoStore } from "./store";
import { buildAssessment } from "./assessments";
import { PIPELINE_COLUMNS, PRE_INTERVIEW, STATUS_PATH } from "./statuses";
import { roleById } from "./questions";

export function useCandidate(id?: string) {
  return useDemoStore((s) => s.candidates.find((c) => c.id === id));
}
export function useInterview(id?: string) {
  return useDemoStore((s) => s.interviews.find((i) => i.id === id));
}
export function useAssessment(interviewId?: string) {
  const interview = useInterview(interviewId);
  const candidate = useCandidate(interview?.candidateId);
  return useMemo(() => (interview && candidate ? buildAssessment(candidate, interview) : null), [interview, candidate]);
}
export function useRecruiter(id?: string) {
  return useDemoStore((s) => s.team.find((t) => t.id === id));
}

export const roleTitle = (c: Candidate) => roleById(c.roleId).title;
export const roleShort = (c: Candidate) => roleById(c.roleId).shortTitle;

/** Shared metrics derived from the same records shown in tables and pipeline. */
export function computeMetrics(candidates: Candidate[], interviews: InterviewSession[]) {
  const ivById = new Map(interviews.map((i) => [i.id, i]));
  const ivOf = (c: Candidate) => (c.interviewId ? ivById.get(c.interviewId) : undefined);
  const completed = candidates.filter((c) => ivOf(c)?.status === "completed");
  const shortlistedOrLater = candidates.filter((c) => STATUS_PATH.indexOf(c.status) >= STATUS_PATH.indexOf("shortlisted") || c.events.some((e) => e.label === "Shortlisted by HR"));
  const selectedOrLater = candidates.filter((c) => STATUS_PATH.indexOf(c.status) >= STATUS_PATH.indexOf("selected"));
  return {
    total: candidates.length,
    invited: candidates.filter((c) => c.interviewId).length,
    interviewsCompleted: completed.length,
    interviewsPending: candidates.filter((c) => ivOf(c)?.status === "not_started").length,
    interviewsInProgress: candidates.filter((c) => ivOf(c)?.status === "in_progress").length,
    expired: candidates.filter((c) => ivOf(c)?.status === "expired").length,
    awaitingReview: candidates.filter((c) => ivOf(c)?.reviewStatus === "awaiting_review").length,
    followUp: candidates.filter((c) => c.followUp).length,
    shortlisted: shortlistedOrLater.length,
    currentlyShortlisted: candidates.filter((c) => c.status === "shortlisted").length,
    selected: selectedOrLater.length,
    hrToSchedule: candidates.filter((c) => c.status === "shortlisted").length,
    offersAwaiting: candidates.filter((c) => c.status === "offer_released").length,
    notSelected: candidates.filter((c) => c.status === "not_selected").length,
    withdrawn: candidates.filter((c) => c.status === "withdrawn").length,
    fresher: candidates.filter((c) => c.track === "fresher").length,
    experienced: candidates.filter((c) => c.track === "experienced").length,
    reviewed: candidates.filter((c) => ivOf(c)?.reviewStatus === "reviewed").length,
  };
}

export function useMetrics() {
  const candidates = useDemoStore((s) => s.candidates);
  const interviews = useDemoStore((s) => s.interviews);
  return useMemo(() => computeMetrics(candidates, interviews), [candidates, interviews]);
}

export function funnel(candidates: Candidate[], interviews: InterviewSession[]) {
  const m = computeMetrics(candidates, interviews);
  return [
    { stage: "Application Received", value: m.total },
    { stage: "AI Interview", value: m.interviewsCompleted },
    { stage: "HR Review", value: m.reviewed },
    { stage: "Shortlisted", value: m.shortlisted },
    { stage: "Selected", value: m.selected },
  ];
}

export function pipelineCounts(candidates: Candidate[]) {
  return PIPELINE_COLUMNS.map((col) => ({ ...col, count: candidates.filter((c) => col.statuses.includes(c.status)).length }));
}

/** Weekly buckets for the last N weeks, ending at the current week. */
export function weeklyActivity(candidates: Candidate[], interviews: InterviewSession[], weeks = 12) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = end.getTime() - weeks * 7 * 86400000;
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const d = new Date(start + (i + 1) * 7 * 86400000);
    return { week: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), applications: 0, interviews: 0, reviews: 0, from: start + i * 7 * 86400000 };
  });
  const idx = (iso?: string) => (iso ? Math.floor((new Date(iso).getTime() - start) / (7 * 86400000)) : -1);
  for (const c of candidates) {
    const i = idx(c.appliedAt);
    if (i >= 0 && i < weeks) buckets[i]!.applications++;
  }
  for (const iv of interviews) {
    const i = idx(iv.completedAt);
    if (i >= 0 && i < weeks) buckets[i]!.interviews++;
    const r = idx(iv.reviewedAt);
    if (r >= 0 && r < weeks) buckets[r]!.reviews++;
  }
  return buckets;
}

export const isPreInterview = (s: RecruitmentStatus) => PRE_INTERVIEW.includes(s);
