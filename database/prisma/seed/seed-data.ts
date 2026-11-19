import type { CandidateTrack } from "@prisma/client";

/**
 * Reference data that every environment needs. The question wording is copied EXACTLY from the
 * HR document ("AI Interview process – FE CLOSER – I9 branch", p. 6) and matches the frontend's
 * src/lib/demo/questions.ts. Published versions are immutable: to change a question, publish a new version.
 */
export const HR_SOURCE = "HR document: AI Interview process – FE CLOSER – I9 branch (p. 6)";
export const RESPONSE_SECONDS = 90;

export const JOB_ROLES: { code: string; title: string; track: CandidateTrack; description: string; questionSet: string }[] = [
  {
    code: "FE-CLOSER",
    title: "Experienced FE Closer",
    track: "EXPERIENCED_FE_CLOSER",
    description: "For candidates with at least 1 year of FE closing experience who can demonstrate previous campaign knowledge and closing performance.",
    questionSet: "HR-FE",
  },
  {
    code: "CSR-FRESHER",
    title: "Customer Sales Representative (Fresher)",
    track: "CSR_FRESHER",
    description: "For candidates with no prior FE experience but strong communication skills, sales potential and willingness to learn.",
    questionSet: "HR-CSR",
  },
];

export const QUESTION_SETS: { code: string; title: string; track: CandidateTrack; questions: { code: string; category: string; text: string }[] }[] = [
  {
    code: "HR-FE",
    title: "Experienced FE Closer",
    track: "EXPERIENCED_FE_CLOSER",
    questions: [
      { code: "FE-001", category: "FE Experience", text: "Tell us about your FE closing experience, including the campaigns you have worked on, your responsibilities and how long you worked in each campaign." },
      { code: "FE-002", category: "Performance & Results", text: "What has been your average monthly closing performance or CPA count in your previous FE campaigns? What factors helped you achieve those results?" },
      { code: "FE-003", category: "Objection Handling", text: "A customer is interested but hesitates to proceed because they do not fully trust the offer. How would you handle this objection and move the conversation towards a close?" },
      { code: "FE-004", category: "Closing Strategy", text: "Walk us through your approach to closing an FE lead, from the initial conversation to final confirmation. How do you maintain customer confidence while ensuring compliance?" },
    ],
  },
  {
    code: "HR-CSR",
    title: "Customer Sales Representative (Fresher)",
    track: "CSR_FRESHER",
    questions: [
      { code: "CSR-001", category: "Self-Introduction", text: "Tell us about yourself, your educational or professional background, and why you are interested in starting a career in sales." },
      { code: "CSR-002", category: "Communication Skills", text: "Imagine you are explaining a product to someone who has never heard of it. How would you make sure they understand its benefits?" },
      { code: "CSR-003", category: "Sales Aptitude", text: "A potential customer tells you, \"I'm not interested.\" How would you respond to keep the conversation going without being pushy?" },
      { code: "CSR-004", category: "Coachability & Resilience", text: "Sales involves targets and frequent rejection. How would you handle rejection, and what would you do if your trainer told you that your performance needed improvement?" },
    ],
  },
];

export const ROLE_NAMES = {
  SUPER_ADMIN: ["Super Admin", "Full access including user and role management"],
  HR_MANAGER: ["HR Manager", "Manages recruitment, question sets and reviews"],
  RECRUITER: ["Recruiter", "Manages candidates, interviews and statuses"],
  REVIEWER: ["Reviewer", "Reviews interviews and adds remarks"],
  CANDIDATE: ["Candidate", "Takes their own interviews"],
} as const;
