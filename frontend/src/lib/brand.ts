/**
 * Central brand configuration.
 * "InterviewOS" is a development placeholder — change it here and it updates everywhere.
 */
export const BRAND = {
  name: "InterviewOS",
  descriptor: "AI Interview Platform",
  tagline: "Intelligent Interviews. Better Hiring Decisions.",
  /** Employer running the interviews (HR document: "Thank you for applying to Bali Tech!"). */
  organization: "Bali Tech",
  supportEmail: "support@example.com",
  privacyNoticeUrl: "/privacy",
  copyrightHolder: "Bali Tech",
  /** Optional raster logo in /public (e.g. "/brand/logo.png"). When null, the SVG mark is used. */
  logoSrc: null as string | null,
} as const;

/**
 * Interview timing — the single source for every screen (welcome, timer, FAQ, setup, admin).
 * Initial values come from the HR document "AI Interview process – FE CLOSER – I9 branch".
 *
 * NOTE: the HR document gives two overall durations — 10–12 minutes (journey & invitation,
 * pp. 1 and 3) and 15–20 minutes (service standards, p. 6). Neither is chosen silently here;
 * the existing display value is kept until HR confirms which one applies.
 */
export const INTERVIEW_CONFIG = {
  durationLabel: "Approximately 10–15 minutes",
  durationShort: "10–15 min",
  /** Four standardized scored questions per track (HR doc p. 4). */
  questionsPerInterview: 4,
  /** HR doc p. 7: allow approximately 60–90 seconds per response. */
  secondsPerQuestion: 90,
  minSecondsPerQuestion: 60,
  /** One unscored practice question (HR doc p. 4). */
  practiceEnabled: true,
  /** HR doc p. 5: completion window "such as 48 hours"; reminder after 24 hours. */
  completionWindowHours: 48,
  reminderAfterHours: 24,
} as const;
