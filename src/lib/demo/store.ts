"use client";
/**
 * Single demo store for the whole prototype (candidate + admin).
 * Persisted to localStorage so a walkthrough survives reloads. Only fictional,
 * non-sensitive demo data is stored — never passwords or real candidate data.
 * This is NOT a database and will be replaced by real APIs later.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  AppNotification,
  CapturedAnswer,
  InterviewAnswer,
  Candidate,
  CandidateFlow,
  DemoSession,
  InterviewSetup,
  InterviewSession,
  PlatformSettings,
  RecruitmentStatus,
  Recruiter,
  TeamRole,
  Track,
} from "@/types";
import { buildAnswers, CURRENT_ADMIN_ID, eventLabel, FEATURED, generateDataset, sessionLength } from "./seed";
import { ASSESSMENT_CRITERIA, PRACTICE_QUESTION, QUESTION_SET_META, QUESTION_SETS, questionById } from "./questions";
import { BRAND, INTERVIEW_CONFIG } from "@/lib/brand";
import { statusLabel } from "./statuses";

const defaultSettings = (): PlatformSettings => ({
  platformName: BRAND.name,
  organizationName: BRAND.organization,
  supportEmail: BRAND.supportEmail,
  timezone: "Asia/Karachi",
  dateFormat: "MMM d, yyyy",
  primaryColor: "#2563EB",
  accentColor: "#38BDF8",
  welcomeText: "Welcome to your AI-assisted interview. Take your time, answer naturally, and show us what you can do.",
  orgLabel: "Talent Acquisition Team",
  notifyOnCompletion: true,
  notifyOnAssessment: true,
  dailyDigest: false,
  candidateReminders: true,
  reduceMotion: false,
  compactTables: false,
  defaultReviewer: CURRENT_ADMIN_ID,
  privacyText: "Your responses are used only to evaluate your application for this role and are reviewed by authorised members of the recruitment team.",
});

const defaultSetup = (track: Track): InterviewSetup => ({
  track,
  title: track === "experienced" ? "Experienced FE Closer — AI Interview" : "Customer Sales Representative — AI Interview",
  instructions: "Answer each question clearly and naturally. You will see one question at a time, with a visible timer for each response.",
  totalDuration: INTERVIEW_CONFIG.durationLabel,
  secondsPerQuestion: INTERVIEW_CONFIG.secondsPerQuestion,
  practiceEnabled: INTERVIEW_CONFIG.practiceEnabled,
  cameraRequired: true,
  microphoneRequired: true,
  resumeAllowed: true,
  expiryHours: INTERVIEW_CONFIG.completionWindowHours,
  reminderHours: INTERVIEW_CONFIG.reminderAfterHours,
  alternativeInfo: "If you are unable to complete a video interview, contact the recruitment team to request an alternative assessment.",
  practiceQuestion: PRACTICE_QUESTION,
  questions: QUESTION_SETS[track].map((q) => ({ ...q })),
  criteria: ASSESSMENT_CRITERIA[track].map((c) => c.label),
});

const emptyFlow = (candidateId: string = FEATURED.fresher): CandidateFlow => ({
  candidateId,
  stage: "not_started",
  consent: false,
  equipmentChecked: false,
  practiceDone: false,
  answeredCount: 0,
});

interface DemoState {
  candidates: Candidate[];
  interviews: InterviewSession[];
  team: Recruiter[];
  notifications: AppNotification[];
  settings: PlatformSettings;
  setups: Record<Track, InterviewSetup>;
  flow: CandidateFlow;
  candidateSession: DemoSession | null;
  adminSession: DemoSession | null;

  startSession: (role: DemoSession["role"], email: string) => void;
  endSession: (role: DemoSession["role"]) => void;

  updateStatus: (candidateId: string, status: RecruitmentStatus, note?: string) => void;
  addRemark: (candidateId: string, text: string) => void;
  setReview: (interviewId: string, review: InterviewSession["reviewStatus"]) => void;
  setFollowUp: (candidateId: string, value: boolean) => void;

  markRead: (id: string) => void;
  markAllRead: () => void;
  pushNotification: (n: Omit<AppNotification, "id" | "at" | "read">) => void;

  selectDemoCandidate: (candidateId: string) => void;
  updateFlow: (patch: Partial<CandidateFlow>) => void;
  /** Saves a confirmed live answer; without an argument, adds a seeded sample answer (demo controls). */
  recordAnswer: (answer?: CapturedAnswer) => void;
  interruptInterview: () => void;
  submitInterview: () => string;
  completeInterviewFor: (candidateId: string) => void;

  updateSettings: (patch: Partial<PlatformSettings>) => void;
  updateSetup: (track: Track, patch: Partial<InterviewSetup>) => void;
  resetSetup: (track: Track) => void;

  setTeamRole: (id: string, role: TeamRole) => void;
  toggleTeamActive: (id: string) => void;
  inviteTeamMember: (name: string, email: string, role: TeamRole) => void;

  resetDemo: () => void;
}

const freshData = () => {
  const d = generateDataset();
  return {
    ...d,
    settings: defaultSettings(),
    setups: { fresher: defaultSetup("fresher"), experienced: defaultSetup("experienced") },
    flow: emptyFlow(),
  };
};

const nowIso = () => new Date().toISOString();
const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 9)}`;
const adminName = (team: Recruiter[]) => team.find((t) => t.id === CURRENT_ADMIN_ID)?.name ?? "HR";

/** Lays captured answers out on the session timeline (same spacing as seeded interviews). */
function toInterviewAnswers(captured: CapturedAnswer[]): InterviewAnswer[] {
  let t = 18;
  return captured.map((a) => {
    const q = questionById(a.questionId);
    const out = { questionId: a.questionId, questionNumber: a.questionNumber ?? q?.number, questionText: a.questionText ?? q?.text, category: a.category ?? q?.category, startedAtSec: t, durationSec: Math.max(3, Math.round(a.durationSec)), transcript: a.transcript, inputMode: a.inputMode };
    t += out.durationSec + 14;
    return out;
  });
}

function completeInterview(state: DemoState, candidateId: string, captured?: CapturedAnswer[]) {
  const c = state.candidates.find((x) => x.id === candidateId);
  if (!c?.interviewId) return {};
  const at = nowIso();
  const live = !!captured?.length;
  const answers = live ? toInterviewAnswers(captured!) : buildAnswers(c.track, c.id, QUESTION_SETS[c.track].length);
  const durationSec = sessionLength(answers);
  const interviews = state.interviews.map((i) =>
    i.id === c.interviewId
      ? { ...i, status: "completed" as const, reviewStatus: "awaiting_review" as const, startedAt: i.startedAt ?? new Date(Date.now() - durationSec * 1000).toISOString(), completedAt: at, durationSec, answeredCount: answers.length, answers, capturedLive: live, questionSetId: i.questionSetId ?? QUESTION_SET_META[c.track].id }
      : i,
  );
  const candidates = state.candidates.map((x) =>
    x.id === c.id
      ? {
          ...x,
          status: "recruiter_review_pending" as const,
          stageEnteredAt: at,
          lastUpdated: at,
          events: [
            ...x.events,
            ...(x.events.some((e) => e.type === "interview_started") ? [] : [{ id: uid("ev"), type: "interview_started" as const, label: "Interview started", at, actor: "Candidate" }]),
            { id: uid("ev"), type: "interview_submitted" as const, label: "Interview submitted", at, actor: "Candidate" },
            { id: uid("ev"), type: "assessment" as const, label: "AI assessment generated", at, actor: "System", detail: "Illustrative demo assessment" },
          ],
        }
      : x,
  );
  const notifications: AppNotification[] = [
    { id: uid("ntf"), kind: "interview_completed", title: "New interview completed", body: `${c.name} submitted their AI interview.`, at, read: false, href: `/admin/interviews/${c.interviewId}` },
    ...state.notifications,
  ];
  return { interviews, candidates, notifications };
}

export const useDemoStore = create<DemoState>()(
  persist(
    (set, get) => ({
      ...freshData(),
      candidateSession: null,
      adminSession: null,

      startSession: (role, email) => {
        const session: DemoSession = { role, email, startedAt: nowIso() };
        set(role === "admin" ? { adminSession: session } : { candidateSession: session });
      },
      endSession: (role) => set(role === "admin" ? { adminSession: null } : { candidateSession: null }),

      updateStatus: (candidateId, status, note) =>
        set((s) => {
          const at = nowIso();
          const actor = adminName(s.team);
          const interviews = s.interviews.map((i) => {
            if (i.candidateId !== candidateId || i.status !== "completed") return i;
            const leavingReview = status !== "recruiter_review_pending" && status !== "ai_interview_completed";
            return leavingReview && i.reviewStatus === "awaiting_review" ? { ...i, reviewStatus: "reviewed" as const, reviewerId: CURRENT_ADMIN_ID, reviewedAt: at } : i;
          });
          return {
            interviews,
            candidates: s.candidates.map((c) =>
              c.id === candidateId
                ? {
                    ...c,
                    status,
                    stageEnteredAt: at,
                    lastUpdated: at,
                    followUp: false,
                    events: [...c.events, { id: uid("ev"), type: status === "not_selected" || status === "withdrawn" ? "closed" : "stage", label: eventLabel(status), at, actor, detail: note }],
                  }
                : c,
            ),
          };
        }),

      addRemark: (candidateId, text) =>
        set((s) => {
          const at = nowIso();
          return {
            candidates: s.candidates.map((c) =>
              c.id === candidateId
                ? {
                    ...c,
                    lastUpdated: at,
                    remarks: [{ id: uid("rm"), authorId: CURRENT_ADMIN_ID, text, at }, ...c.remarks],
                    events: [...c.events, { id: uid("ev"), type: "remark", label: "HR remark added", at, actor: adminName(s.team) }],
                  }
                : c,
            ),
          };
        }),

      setReview: (interviewId, review) =>
        set((s) => {
          const at = nowIso();
          const iv = s.interviews.find((i) => i.id === interviewId);
          return {
            interviews: s.interviews.map((i) => (i.id === interviewId ? { ...i, reviewStatus: review, reviewerId: CURRENT_ADMIN_ID, reviewedAt: at } : i)),
            candidates: s.candidates.map((c) =>
              c.id === iv?.candidateId
                ? {
                    ...c,
                    followUp: review === "follow_up",
                    lastUpdated: at,
                    events: [...c.events, { id: uid("ev"), type: "review", label: review === "follow_up" ? "Marked for follow-up" : "Interview reviewed", at, actor: adminName(s.team) }],
                  }
                : c,
            ),
          };
        }),

      setFollowUp: (candidateId, value) => set((s) => ({ candidates: s.candidates.map((c) => (c.id === candidateId ? { ...c, followUp: value } : c)) })),

      markRead: (id) => set((s) => ({ notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
      markAllRead: () => set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),
      pushNotification: (n) => set((s) => ({ notifications: [{ ...n, id: uid("ntf"), at: nowIso(), read: false }, ...s.notifications] })),

      selectDemoCandidate: (candidateId) => set({ flow: emptyFlow(candidateId) }),
      updateFlow: (patch) => set((s) => ({ flow: { ...s.flow, ...patch } })),

      recordAnswer: (answer) =>
        set((s) => {
          const c = s.candidates.find((x) => x.id === s.flow.candidateId);
          if (!c) return {};
          const prior = s.flow.answers ?? [];
          // Without an argument (demo controls), add the next seeded sample answer instead.
          const sample = buildAnswers(c.track, c.id, prior.length + 1).at(-1);
          const entry: CapturedAnswer | undefined = answer ?? (sample ? { questionId: sample.questionId, questionNumber: sample.questionNumber, questionText: sample.questionText, category: sample.category, confirmed: true, transcript: sample.transcript, durationSec: sample.durationSec, inputMode: "typed", confirmedAt: nowIso() } : undefined);
          if (!entry) return {};
          const captured = [...prior.filter((x) => x.questionId !== entry.questionId), entry];
          const answeredCount = captured.length;
          const at = nowIso();
          const firstAnswer = s.flow.answeredCount === 0;
          return {
            flow: { ...s.flow, answeredCount, stage: "active", answers: captured },
            interviews: s.interviews.map((i) =>
              i.id === c.interviewId
                ? { ...i, status: "in_progress" as const, startedAt: i.startedAt ?? at, answeredCount, answers: toInterviewAnswers(captured), capturedLive: !!answer || i.capturedLive }
                : i,
            ),
            candidates: s.candidates.map((x) =>
              x.id === c.id && firstAnswer && x.status === "ai_interview_pending"
                ? { ...x, status: "ai_interview_in_progress" as const, stageEnteredAt: at, lastUpdated: at, events: [...x.events, { id: uid("ev"), type: "interview_started" as const, label: "Interview started", at, actor: "Candidate" }] }
                : x,
            ),
          };
        }),

      interruptInterview: () => set((s) => ({ flow: { ...s.flow, stage: "interrupted" } })),

      submitInterview: () => {
        const s = get();
        const reference = `IOS-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 89999)}`;
        const captured = s.flow.answers?.length ? s.flow.answers : undefined;
        set({ ...completeInterview(s, s.flow.candidateId, captured), flow: { ...s.flow, stage: "submitted", answeredCount: captured?.length ?? QUESTION_SETS.fresher.length, reference, submittedAt: nowIso() } });
        return reference;
      },

      completeInterviewFor: (candidateId) => set((s) => completeInterview(s, candidateId)),

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      updateSetup: (track, patch) => set((s) => ({ setups: { ...s.setups, [track]: { ...s.setups[track], ...patch } } })),
      resetSetup: (track) => set((s) => ({ setups: { ...s.setups, [track]: defaultSetup(track) } })),

      setTeamRole: (id, role) => set((s) => ({ team: s.team.map((t) => (t.id === id ? { ...t, role } : t)) })),
      toggleTeamActive: (id) => set((s) => ({ team: s.team.map((t) => (t.id === id ? { ...t, active: !t.active } : t)) })),
      inviteTeamMember: (name, email, role) =>
        set((s) => ({ team: [...s.team, { id: uid("usr"), name, email, role, active: false, title: "Invitation pending", lastActive: nowIso() }] })),

      resetDemo: () => set((s) => ({ ...freshData(), adminSession: s.adminSession, candidateSession: s.candidateSession })),
    }),
    {
      name: "interviewos-demo-v3",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      version: 1,
      // Fill any fields missing from older saved demo data with current defaults.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<DemoState>;
        return {
          ...current,
          ...p,
          settings: { ...current.settings, ...p.settings },
          flow: { ...current.flow, ...p.flow },
          setups: {
            fresher: { ...current.setups.fresher, ...p.setups?.fresher },
            experienced: { ...current.setups.experienced, ...p.setups?.experienced },
          },
        };
      },
    },
  ),
);

export { statusLabel };
