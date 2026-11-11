import type { InterviewQuestion, JobRole, Track } from "@/types";
import { INTERVIEW_CONFIG } from "@/lib/brand";

/** Track definitions from the HR document (p. 2, "Two Separate Job Openings"). */
export const JOB_ROLES: JobRole[] = [
  {
    id: "role-fe-closer",
    track: "experienced",
    title: "Experienced FE Closer",
    shortTitle: "FE Closer",
    department: "Final Expense Sales",
    description: "For candidates with at least 1 year of FE closing experience who can demonstrate previous campaign knowledge and closing performance.",
  },
  {
    id: "role-csr-fresher",
    track: "fresher",
    title: "Customer Sales Representative (Fresher)",
    shortTitle: "CSR Fresher",
    department: "Customer Sales",
    description: "For candidates with no prior FE experience but strong communication skills, sales potential and willingness to learn.",
  },
];

export const roleForTrack = (track: Track) => JOB_ROLES.find((r) => r.track === track)!;
export const roleById = (id: string) => JOB_ROLES.find((r) => r.id === id) ?? JOB_ROLES[0]!;

export const HR_SOURCE = "HR document: AI Interview process – FE CLOSER – I9 branch (p. 6)";

export interface QuestionSetMeta {
  id: string; // stable version id stored on every interview session
  track: Track;
  title: string;
  version: number;
  source: string;
}

/** Official question-set versions. Bump the id (e.g. HR-FE-V2) when HR changes a set. */
export const QUESTION_SET_META: Record<Track, QuestionSetMeta> = {
  experienced: { id: "HR-FE-V1", track: "experienced", title: "Experienced FE Closer", version: 1, source: HR_SOURCE },
  fresher: { id: "HR-CSR-V1", track: "fresher", title: "Customer Sales Representative (Fresher)", version: 1, source: HR_SOURCE },
};

const s = INTERVIEW_CONFIG.secondsPerQuestion;
const q = (track: Track, id: string, number: number, category: string, text: string): InterviewQuestion => ({
  id, number, category, text, responseSeconds: s, role: track, active: true, setId: QUESTION_SET_META[track].id, source: HR_SOURCE,
});

/**
 * OFFICIAL HR QUESTION SETS — wording, category, and order copied exactly from the HR document.
 * These are the locked standard questions used by every interview, TTS playback, admin review,
 * and assessment. Do not edit text here except to apply a new HR-approved version.
 */
export const QUESTION_SETS: Record<Track, InterviewQuestion[]> = {
  experienced: [
    q("experienced", "FE-001", 1, "FE Experience", "Tell us about your FE closing experience, including the campaigns you have worked on, your responsibilities and how long you worked in each campaign."),
    q("experienced", "FE-002", 2, "Performance & Results", "What has been your average monthly closing performance or CPA count in your previous FE campaigns? What factors helped you achieve those results?"),
    q("experienced", "FE-003", 3, "Objection Handling", "A customer is interested but hesitates to proceed because they do not fully trust the offer. How would you handle this objection and move the conversation towards a close?"),
    q("experienced", "FE-004", 4, "Closing Strategy", "Walk us through your approach to closing an FE lead, from the initial conversation to final confirmation. How do you maintain customer confidence while ensuring compliance?"),
  ],
  fresher: [
    q("fresher", "CSR-001", 1, "Self-Introduction", "Tell us about yourself, your educational or professional background, and why you are interested in starting a career in sales."),
    q("fresher", "CSR-002", 2, "Communication Skills", "Imagine you are explaining a product to someone who has never heard of it. How would you make sure they understand its benefits?"),
    q("fresher", "CSR-003", 3, "Sales Aptitude", "A potential customer tells you, \"I'm not interested.\" How would you respond to keep the conversation going without being pushy?"),
    q("fresher", "CSR-004", 4, "Coachability & Resilience", "Sales involves targets and frequent rejection. How would you handle rejection, and what would you do if your trainer told you that your performance needed improvement?"),
  ],
};

/** Active questions in configured order. */
export const activeQuestions = (qs: InterviewQuestion[]) => qs.filter((x) => x.active !== false).sort((a, b) => a.number - b.number);

/** Official set for a track (what interviews use). */
export const officialQuestions = (track: Track) => activeQuestions(QUESTION_SETS[track]);

export const questionById = (id: string) => [...QUESTION_SETS.experienced, ...QUESTION_SETS.fresher].find((x) => x.id === id);

/**
 * Practice question — a DEMO DESIGN CHOICE, not an official HR question.
 * The HR document requires one unscored practice question but does not specify its wording.
 * It is never scored, saved, or shown in the assessment.
 */
export const PRACTICE_QUESTION = "Please introduce yourself briefly and tell us one thing you enjoy learning.";

/** HR doc p. 7: what the AI should evaluate (decision support — HR makes the final decision). */
export const HR_EVALUATION_FOCUS = ["Communication", "Relevance", "Practical knowledge", "Sales aptitude"];

/** Assessment review sections are the official question categories (HR doc p. 6), in order. */
export const ASSESSMENT_CRITERIA: Record<Track, { id: string; label: string }[]> = {
  experienced: QUESTION_SETS.experienced.map((x) => ({ id: x.id, label: x.category })),
  fresher: QUESTION_SETS.fresher.map((x) => ({ id: x.id, label: x.category })),
};
