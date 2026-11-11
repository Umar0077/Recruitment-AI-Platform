"use client";
/**
 * One view of the candidate's interview flow for every candidate page.
 *  - Demo mode: the existing demo store (unchanged behaviour).
 *  - API mode: the backend is the source of truth for the interview (status, answers, deadline,
 *    reference). Only the pre-interview checklist (consent / equipment / practice ticks) lives in
 *    this browser tab until the interview starts — consent is then recorded server-side on start.
 */
import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { CandidateFlowStage, Track } from "@/types";
import { isApiMode } from "@/lib/config/environment";
import { INTERVIEW_CONFIG } from "@/lib/brand";
import { useDemoStore } from "@/lib/demo/store";
import { useCandidate, useInterview, roleTitle as demoRoleTitle } from "@/lib/demo/selectors";
import { PRACTICE_QUESTION } from "@/lib/demo/questions";
import type { InterviewStatus } from "@/lib/api/types";
import type { ApiError } from "@/lib/api/client";
import { trackOf } from "@/lib/api/labels";
import { useMyInterview } from "./queries";

export interface PreChecks {
  consent: boolean;
  equipmentChecked: boolean;
  practiceDone: boolean;
}

export interface CandidateFlowView {
  mode: "demo" | "api";
  loading: boolean;
  error: ApiError | null;
  /** API mode: signed in but no interview is linked to this account. */
  noInterview: boolean;
  candidateName: string;
  firstName: string;
  track: Track;
  roleTitle: string;
  interviewId?: string;
  applicationId?: string;
  /** Backend interview status (API mode only). */
  interviewStatus?: InterviewStatus;
  stage: CandidateFlowStage;
  consent: boolean;
  equipmentChecked: boolean;
  practiceDone: boolean;
  answeredCount: number;
  totalQuestions: number;
  reference?: string;
  submittedAt?: string;
  expiresAt?: string;
  questionSetVersion?: string;
  secondsPerQuestion: number;
  practiceQuestion: string;
  durationLabel: string;
  update: (patch: Partial<PreChecks>) => void;
}

// ───────── per-tab pre-check storage (sessionStorage), observable for React ─────────
const listeners = new Set<() => void>();
const keyFor = (id: string) => `interviewos-prechecks:${id}`;
function readChecks(id?: string): PreChecks {
  const empty = { consent: false, equipmentChecked: false, practiceDone: false };
  if (!id || typeof window === "undefined") return empty;
  try {
    return { ...empty, ...(JSON.parse(sessionStorage.getItem(keyFor(id)) ?? "{}") as Partial<PreChecks>) };
  } catch {
    return empty;
  }
}
const EMPTY: PreChecks = { consent: false, equipmentChecked: false, practiceDone: false };
const cache = new Map<string, { raw: string | null; value: PreChecks }>();
function snapshot(id?: string): PreChecks {
  // Must return the same object while nothing changed (React useSyncExternalStore contract).
  if (!id) return EMPTY;
  let raw: string | null = null;
  try { raw = sessionStorage.getItem(keyFor(id)); } catch { /* unavailable */ }
  const hit = cache.get(id);
  if (hit && hit.raw === raw) return hit.value;
  const value = readChecks(id);
  cache.set(id, { raw, value });
  return value;
}

function stageFor(status: InterviewStatus | undefined, c: PreChecks): CandidateFlowStage {
  switch (status) {
    case "IN_PROGRESS": return "active";
    case "INTERRUPTED": return "interrupted";
    case "COMPLETED": return "complete";
    case "SUBMITTED": return "submitted";
    case "PENDING":
      return c.practiceDone ? "active" : c.equipmentChecked ? "practice" : c.consent ? "equipment" : "not_started";
    default: return "not_started";
  }
}

function useApiFlow(): CandidateFlowView {
  const my = useMyInterview();
  const iv = my.current?.interview;
  const app = my.current?.application;
  const checks = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => snapshot(iv?.id),
    () => EMPTY,
  );
  const update = useCallback((patch: Partial<PreChecks>) => {
    if (!iv?.id) return;
    try { sessionStorage.setItem(keyFor(iv.id), JSON.stringify({ ...readChecks(iv.id), ...patch })); } catch { /* unavailable */ }
    listeners.forEach((l) => l());
  }, [iv?.id]);

  return useMemo(() => {
    const name = my.candidate?.fullName ?? "";
    const started = !!iv && iv.status !== "PENDING";
    return {
      mode: "api",
      loading: my.isPending,
      error: (my.error as ApiError | null) ?? null,
      noInterview: !my.isPending && !my.error && !iv,
      candidateName: name,
      firstName: name.split(" ")[0] ?? "",
      track: my.candidate ? trackOf(my.candidate.category) : "fresher",
      roleTitle: app?.jobRole.title ?? "",
      interviewId: iv?.id,
      applicationId: app?.id,
      interviewStatus: iv?.status,
      stage: stageFor(iv?.status, checks),
      // Once the backend has started the session, consent was recorded there.
      consent: started || checks.consent,
      equipmentChecked: checks.equipmentChecked,
      practiceDone: started || checks.practiceDone,
      answeredCount: iv?.completedQuestions ?? 0,
      totalQuestions: iv?.totalQuestions ?? 0,
      reference: iv?.reference,
      submittedAt: iv?.submittedAt ?? undefined,
      expiresAt: iv?.expiresAt,
      questionSetVersion: iv?.questionSetVersion,
      secondsPerQuestion: INTERVIEW_CONFIG.secondsPerQuestion,
      practiceQuestion: PRACTICE_QUESTION,
      durationLabel: INTERVIEW_CONFIG.durationLabel,
      update,
    };
  }, [my.candidate, my.isPending, my.error, iv, app, checks, update]);
}

function useDemoFlow(): CandidateFlowView {
  const flow = useDemoStore((s) => s.flow);
  const updateFlow = useDemoStore((s) => s.updateFlow);
  const candidate = useCandidate(flow.candidateId);
  const interview = useInterview(candidate?.interviewId);
  const setup = useDemoStore((s) => (candidate ? s.setups[candidate.track] : undefined));
  const update = useCallback((patch: Partial<PreChecks>) => updateFlow(patch), [updateFlow]);
  return useMemo(() => ({
    mode: "demo",
    loading: !candidate,
    error: null,
    noInterview: false,
    candidateName: candidate?.name ?? "",
    firstName: candidate?.name.split(" ")[0] ?? "",
    track: candidate?.track ?? "fresher",
    roleTitle: candidate ? demoRoleTitle(candidate) : "",
    interviewId: candidate?.interviewId,
    stage: flow.stage,
    consent: flow.consent,
    equipmentChecked: flow.equipmentChecked,
    practiceDone: flow.practiceDone,
    answeredCount: flow.answers?.length ?? flow.answeredCount,
    totalQuestions: setup?.questions.filter((q) => q.active !== false).length ?? INTERVIEW_CONFIG.questionsPerInterview,
    reference: flow.reference,
    submittedAt: flow.submittedAt,
    expiresAt: interview?.expiresAt,
    questionSetVersion: interview?.questionSetId,
    secondsPerQuestion: setup?.secondsPerQuestion ?? INTERVIEW_CONFIG.secondsPerQuestion,
    practiceQuestion: setup?.practiceQuestion ?? PRACTICE_QUESTION,
    durationLabel: setup?.totalDuration ?? INTERVIEW_CONFIG.durationLabel,
    update,
  }), [flow, candidate, interview, setup, update]);
}

/** Mode is fixed at build time, so the hook order never changes between renders. */
export const useCandidateFlow: () => CandidateFlowView = isApiMode ? useApiFlow : useDemoFlow;

/** Clears this tab's pre-check ticks for an interview (e.g. after submission). */
export function clearPreChecks(interviewId?: string) {
  if (!interviewId) return;
  try { sessionStorage.removeItem(keyFor(interviewId)); } catch { /* unavailable */ }
  listeners.forEach((l) => l());
}
