export type Track = "experienced" | "fresher";

export type RecruitmentStatus =
  | "application_received"
  | "ai_interview_pending"
  | "ai_interview_in_progress"
  | "ai_interview_completed"
  | "recruiter_review_pending"
  | "shortlisted"
  | "hr_interview_scheduled"
  | "hr_interview_completed"
  | "final_assessment_pending"
  | "final_assessment_completed"
  | "selected"
  | "offer_released"
  | "offer_accepted"
  | "documentation_onboarding"
  | "production_onboarding"
  | "joined"
  | "not_selected"
  | "withdrawn";

export type InterviewStatus = "not_invited" | "not_started" | "in_progress" | "completed" | "expired";
export type ReviewStatus = "not_applicable" | "awaiting_review" | "reviewed" | "follow_up";

export interface JobRole {
  id: string;
  track: Track;
  title: string;
  shortTitle: string;
  department: string;
  description: string;
}

export interface InterviewQuestion {
  id: string;
  /** Order within the set (1-based). */
  number: number;
  category: string;
  /** HR-approved wording — shown and spoken exactly as written. */
  text: string;
  /** Suggested response time in seconds. */
  responseSeconds: number;
  role?: Track;
  /** Inactive questions stay in configuration but are skipped in interviews. */
  active?: boolean;
  /** Question-set version id, e.g. HR-FE-V1. */
  setId?: string;
  /** Where the wording comes from (official HR document). */
  source?: string;
}

export interface InterviewAnswer {
  questionId: string;
  startedAtSec: number;
  durationSec: number;
  transcript: string;
  /** Set for answers captured live in the candidate demo. */
  inputMode?: "voice" | "typed";
  /** Snapshot of the question as asked, so reviews never show mismatched text after a set changes. */
  questionNumber?: number;
  questionText?: string;
  category?: string;
}

/** An answer the candidate confirmed in the live voice interview (transcript only — no audio is stored). */
export interface CapturedAnswer {
  sessionId?: string;
  questionId: string;
  questionNumber?: number;
  questionText?: string;
  category?: string;
  /** Only confirmed answers are ever stored; interim recognition is never saved. */
  confirmed?: true;
  transcript: string;
  durationSec: number;
  inputMode: "voice" | "typed";
  confirmedAt: string;
}

export interface InterviewSession {
  id: string;
  candidateId: string;
  track: Track;
  status: InterviewStatus;
  reviewStatus: ReviewStatus;
  invitedAt?: string;
  startedAt?: string;
  completedAt?: string;
  durationSec?: number;
  answeredCount: number;
  answers: InterviewAnswer[];
  reviewerId?: string;
  reviewedAt?: string;
  expiresAt?: string;
  /** True when the transcript came from the live candidate demo rather than seeded sample data. */
  capturedLive?: boolean;
  /** Question-set version this session used (e.g. HR-FE-V1). */
  questionSetId?: string;
}

export interface ExperiencedProfile {
  kind: "experienced";
  feExperience: string;
  yearsExperience: number;
  previousCompanies: string[];
  previousCampaigns: string[];
  avgMonthlyClosing: string;
  cpaCount: string;
  lastDrawnSalary: string;
  expectedSalary: string;
  availability: string;
  commute: string;
  shiftWillingness: string;
}

export interface FresherProfile {
  kind: "fresher";
  education: string;
  previousWork: string;
  salesExperience: string;
  customerServiceExperience: string;
  communicationExperience: string;
  englishProficiency: string;
  commute: string;
  shiftAvailability: string;
  motivation: string;
}

export interface HRRemark {
  id: string;
  authorId: string;
  text: string;
  at: string;
}

export type RecruitmentEventType =
  | "application"
  | "invite"
  | "interview_started"
  | "interview_submitted"
  | "assessment"
  | "review"
  | "stage"
  | "remark"
  | "closed";

export interface RecruitmentEvent {
  id: string;
  type: RecruitmentEventType;
  label: string;
  at: string;
  actor: string;
  detail?: string;
}

export interface Candidate {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  track: Track;
  roleId: string;
  appliedAt: string;
  status: RecruitmentStatus;
  stageEnteredAt: string;
  lastUpdated: string;
  recruiterId: string;
  interviewId?: string;
  profile: ExperiencedProfile | FresherProfile;
  remarks: HRRemark[];
  events: RecruitmentEvent[];
  followUp?: boolean;
}

export interface AssessmentCriterion {
  id: string;
  label: string;
  score: number; // 1–5 illustrative scale
  explanation: string;
}

export interface QuestionObservation {
  questionId: string;
  number: number;
  category: string;
  question: string;
  excerpt: string;
  observation: string;
  score: number;
}

export interface AssessmentReport {
  id: string;
  interviewId: string;
  candidateId: string;
  generatedAt: string;
  overall: number; // 1–5
  summary: string;
  criteria: AssessmentCriterion[];
  questions: QuestionObservation[];
  strengths: string[];
  reviewAreas: string[];
}

export type TeamRole = "super_admin" | "hr_manager" | "recruiter" | "reviewer";

export interface Recruiter {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  active: boolean;
  lastActive: string;
  title: string;
}

export type NotificationKind = "interview_completed" | "assessment_ready" | "shortlisted" | "awaiting_review" | "remark" | "system";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  at: string;
  read: boolean;
  href: string;
}

/** Candidate-side demo interview flow state. */
export type CandidateFlowStage =
  | "not_started"
  | "instructions"
  | "consent"
  | "equipment"
  | "practice"
  | "active"
  | "interrupted"
  | "complete"
  | "submitted";

export interface CandidateFlow {
  candidateId: string;
  stage: CandidateFlowStage;
  consent: boolean;
  equipmentChecked: boolean;
  practiceDone: boolean;
  answeredCount: number;
  answers?: CapturedAnswer[];
  reference?: string;
  submittedAt?: string;
}

/** Demo session — holds a role and display email only. Never a password. */
export interface DemoSession {
  role: "candidate" | "admin";
  email: string;
  startedAt: string;
}

export interface PlatformSettings {
  platformName: string;
  organizationName: string;
  supportEmail: string;
  timezone: string;
  dateFormat: string;
  primaryColor: string;
  accentColor: string;
  welcomeText: string;
  orgLabel: string;
  notifyOnCompletion: boolean;
  notifyOnAssessment: boolean;
  dailyDigest: boolean;
  candidateReminders: boolean;
  reduceMotion: boolean;
  compactTables: boolean;
  defaultReviewer: string;
  privacyText: string;
}

export interface InterviewSetup {
  track: Track;
  title: string;
  instructions: string;
  totalDuration: string;
  secondsPerQuestion: number;
  practiceEnabled: boolean;
  cameraRequired: boolean;
  microphoneRequired: boolean;
  resumeAllowed: boolean;
  /** Completion window in hours (HR doc: such as 48 hours). */
  expiryHours: number;
  reminderHours: number;
  alternativeInfo: string;
  practiceQuestion: string;
  questions: InterviewQuestion[];
  criteria: string[];
}
