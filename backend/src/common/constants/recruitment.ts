import { RecruitmentStatus } from "@prisma/client";

/** Labels exactly as in the HR document (p. 4–5). Single source for API responses. */
export const RECRUITMENT_STATUS_LABELS: Record<RecruitmentStatus, string> = {
  APPLICATION_RECEIVED: "Application Received",
  AI_INTERVIEW_PENDING: "AI Interview Pending",
  AI_INTERVIEW_IN_PROGRESS: "AI Interview In Progress",
  AI_INTERVIEW_COMPLETED: "AI Interview Completed",
  RECRUITER_REVIEW_PENDING: "Recruiter Review Pending",
  SHORTLISTED: "Shortlisted",
  HR_INTERVIEW_SCHEDULED: "HR Interview Scheduled",
  HR_INTERVIEW_COMPLETED: "HR Interview Completed",
  FINAL_ASSESSMENT_PENDING: "Final Assessment Pending",
  FINAL_ASSESSMENT_COMPLETED: "Final Assessment Completed",
  SELECTED: "Selected",
  OFFER_RELEASED: "Offer Released",
  OFFER_ACCEPTED: "Offer Accepted",
  DOCUMENTATION_ONBOARDING: "Documentation & Onboarding",
  PRODUCTION_ONBOARDING: "Production Onboarding",
  JOINED: "Joined",
  NOT_SELECTED: "Not Selected",
  CANDIDATE_WITHDRAWN: "Candidate Withdrawn",
};

export const RECRUITMENT_STATUS_ORDER = Object.keys(RECRUITMENT_STATUS_LABELS) as RecruitmentStatus[];

/**
 * Statuses HR may set manually, per current status. AI_INTERVIEW_IN_PROGRESS and AI_INTERVIEW_COMPLETED
 * are set only by the interview system (start/submit), never by hand.
 */
const close: RecruitmentStatus[] = ["NOT_SELECTED", "CANDIDATE_WITHDRAWN"];
export const ALLOWED_HR_TRANSITIONS: Record<RecruitmentStatus, RecruitmentStatus[]> = {
  APPLICATION_RECEIVED: ["AI_INTERVIEW_PENDING", ...close],
  AI_INTERVIEW_PENDING: [...close],
  AI_INTERVIEW_IN_PROGRESS: ["CANDIDATE_WITHDRAWN"],
  AI_INTERVIEW_COMPLETED: ["RECRUITER_REVIEW_PENDING", "SHORTLISTED", ...close],
  RECRUITER_REVIEW_PENDING: ["SHORTLISTED", ...close],
  SHORTLISTED: ["HR_INTERVIEW_SCHEDULED", ...close],
  HR_INTERVIEW_SCHEDULED: ["HR_INTERVIEW_COMPLETED", ...close],
  HR_INTERVIEW_COMPLETED: ["FINAL_ASSESSMENT_PENDING", "SELECTED", ...close],
  FINAL_ASSESSMENT_PENDING: ["FINAL_ASSESSMENT_COMPLETED", "CANDIDATE_WITHDRAWN"],
  FINAL_ASSESSMENT_COMPLETED: ["SELECTED", ...close],
  SELECTED: ["OFFER_RELEASED", "CANDIDATE_WITHDRAWN"],
  OFFER_RELEASED: ["OFFER_ACCEPTED", "CANDIDATE_WITHDRAWN"],
  OFFER_ACCEPTED: ["DOCUMENTATION_ONBOARDING", "CANDIDATE_WITHDRAWN"],
  DOCUMENTATION_ONBOARDING: ["PRODUCTION_ONBOARDING", "CANDIDATE_WITHDRAWN"],
  PRODUCTION_ONBOARDING: ["JOINED", "CANDIDATE_WITHDRAWN"],
  JOINED: [],
  // A human-reviewed rejection can be reopened for another review; withdrawal is final.
  NOT_SELECTED: ["RECRUITER_REVIEW_PENDING"],
  CANDIDATE_WITHDRAWN: [],
};

export const isAllowedHrTransition = (from: RecruitmentStatus, to: RecruitmentStatus) => ALLOWED_HR_TRANSITIONS[from].includes(to);
