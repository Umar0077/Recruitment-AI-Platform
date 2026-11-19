/**
 * Deterministic fictional dataset. Every name, number, and record here is invented.
 * All screens read from this one source (via the demo store), so a candidate shown on
 * the dashboard has the same details on their profile, interview, assessment, and pipeline card.
 */
import type {
  AppNotification,
  Candidate,
  ExperiencedProfile,
  FresherProfile,
  InterviewSession,
  RecruitmentEvent,
  RecruitmentStatus,
  Recruiter,
  Track,
} from "@/types";
import { QUESTION_SET_META, QUESTION_SETS, roleForTrack } from "./questions";
import { TRANSCRIPT_BANK } from "./transcripts";
import { STATUS_PATH, statusLabel } from "./statuses";
import { INTERVIEW_CONFIG } from "@/lib/brand";

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable numeric hash for a string — used to pick variants deterministically. */
export function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

const DAY = 86400000;
const HOUR = 3600000;

/** Anchor at the start of the current day so relative dates stay meaningful. */
export function demoAnchor() {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  return d.getTime();
}

export const TEAM: Recruiter[] = [
  { id: "usr-01", name: "Maryam Khan", email: "maryam.khan@example.com", role: "super_admin", active: true, title: "Head of Talent", lastActive: "" },
  { id: "usr-02", name: "Sana Qureshi", email: "sana.qureshi@example.com", role: "hr_manager", active: true, title: "HR Manager", lastActive: "" },
  { id: "usr-03", name: "Daniyal Ahmed", email: "daniyal.ahmed@example.com", role: "recruiter", active: true, title: "Senior Recruiter", lastActive: "" },
  { id: "usr-04", name: "Hira Javed", email: "hira.javed@example.com", role: "recruiter", active: true, title: "Recruiter", lastActive: "" },
  { id: "usr-05", name: "Bilal Raza", email: "bilal.raza@example.com", role: "reviewer", active: true, title: "Sales Floor Reviewer", lastActive: "" },
  { id: "usr-06", name: "Usman Tariq", email: "usman.tariq@example.com", role: "reviewer", active: false, title: "Quality Reviewer", lastActive: "" },
];

/** The signed-in demo admin is always this team member. */
export const CURRENT_ADMIN_ID = "usr-02";

const FIRST = ["Ayesha", "Omar", "Fatima", "Hamza", "Zainab", "Ali", "Mahnoor", "Hassan", "Areeba", "Saad", "Iqra", "Faisal", "Noor", "Taha", "Rida", "Kamran", "Hania", "Asad", "Laiba", "Junaid", "Sara", "Rehan", "Amna", "Zeeshan", "Mariam", "Imran", "Eman", "Shahzaib", "Komal", "Waqas", "Alina", "Talha", "Anum", "Haris", "Sidra", "Arslan", "Maham", "Adeel", "Hafsa", "Raza", "Nimra", "Fahad", "Aiman", "Yasir", "Bushra", "Usama", "Mehwish", "Shoaib"];
const LAST = ["Malik", "Siddiqui", "Sheikh", "Butt", "Chaudhry", "Hussain", "Mirza", "Baig", "Rana", "Abbasi", "Farooq", "Iqbal", "Anwar", "Nawaz", "Akhtar", "Saleem", "Haider", "Rashid", "Zafar", "Qazi", "Latif", "Shah", "Aslam", "Karim"];
// Commuting distance to the I-9/3 Islamabad office (HR doc p. 2–3).
const CITIES = ["Islamabad", "Rawalpindi", "Islamabad", "Rawalpindi", "Islamabad", "Taxila"];
const COMPANIES = ["Northbridge Contact Solutions", "BlueHarbor BPO", "Crestline Outreach", "Meridian Dialer Group", "Summit Call Partners", "Harborview Teleservices"];
const CAMPAIGNS = ["Inbound FE — Warm Transfers", "Outbound FE — Senior Leads", "Mixed FE — Callbacks", "FE Verification Desk", "FE Retention Line"];
const EDUCATION = ["BBA (in progress)", "BS Computer Science", "Intermediate (FA)", "BCom", "BS English Literature", "Intermediate (ICS)", "MBA (Marketing)"];

/** Status mix for generated candidates (sums to the dataset size minus the two featured candidates). */
const STATUS_MIX: [RecruitmentStatus, number][] = [
  ["application_received", 5],
  ["ai_interview_pending", 10],
  ["ai_interview_in_progress", 5],
  ["ai_interview_completed", 4],
  ["recruiter_review_pending", 14],
  ["shortlisted", 10],
  ["hr_interview_scheduled", 7],
  ["hr_interview_completed", 4],
  ["final_assessment_pending", 4],
  ["final_assessment_completed", 3],
  ["selected", 4],
  ["offer_released", 3],
  ["offer_accepted", 2],
  ["documentation_onboarding", 2],
  ["production_onboarding", 2],
  ["joined", 3],
  ["not_selected", 9],
  ["withdrawn", 3],
];

/** Stage the event label to show in a candidate's timeline when they enter a status. */
function eventFor(status: RecruitmentStatus): RecruitmentEvent["type"] {
  if (status === "application_received") return "application";
  if (status === "ai_interview_pending") return "invite";
  if (status === "ai_interview_in_progress") return "interview_started";
  if (status === "ai_interview_completed") return "interview_submitted";
  if (status === "recruiter_review_pending") return "assessment";
  if (status === "not_selected" || status === "withdrawn") return "closed";
  return "stage";
}

const EVENT_LABEL: Partial<Record<RecruitmentStatus, string>> = {
  application_received: "Application received",
  ai_interview_pending: "AI interview invitation sent",
  ai_interview_in_progress: "Interview started",
  ai_interview_completed: "Interview submitted",
  recruiter_review_pending: "AI assessment generated",
  shortlisted: "Shortlisted by HR",
  hr_interview_scheduled: "HR interview scheduled",
  hr_interview_completed: "HR interview completed",
  selected: "Selection decision: Selected",
  not_selected: "Selection decision: Not selected",
  withdrawn: "Candidate withdrew",
};

export const eventLabel = (s: RecruitmentStatus) => EVENT_LABEL[s] ?? `Moved to ${statusLabel(s)}`;

function makeExperiencedProfile(r: () => number): ExperiencedProfile {
  const years = 1 + Math.floor(r() * 6);
  const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)]!;
  const c1 = pick(COMPANIES);
  const c2 = pick(COMPANIES.filter((c) => c !== c1));
  return {
    kind: "experienced",
    feExperience: `${years} year${years > 1 ? "s" : ""} closing Final Expense across ${years > 2 ? "inbound and outbound" : "inbound"} campaigns`,
    yearsExperience: years,
    previousCompanies: years > 2 ? [c1, c2] : [c1],
    previousCampaigns: years > 2 ? [pick(CAMPAIGNS), pick(CAMPAIGNS.slice(1))] : [pick(CAMPAIGNS)],
    avgMonthlyClosing: `${8 + Math.floor(r() * 18)} policies / month (self-reported)`,
    cpaCount: `${10 + Math.floor(r() * 25)} CPA / month (self-reported)`,
    lastDrawnSalary: `PKR ${(70 + Math.floor(r() * 90)) * 1000}`,
    expectedSalary: `PKR ${(100 + Math.floor(r() * 110)) * 1000}`,
    availability: pick(["Immediate", "1 week notice", "2 weeks notice", "30 days notice"]),
    commute: pick(["Yes — can commute to I-9/3 Islamabad (own transport)", "Yes — can commute to I-9/3 Islamabad (public transport)", "Yes — needs pick & drop to I-9/3 Islamabad"]),
    shiftWillingness: pick(["Night shift (US hours)", "Night shift, open to rotation", "Evening and night shifts"]),
  };
}

function makeFresherProfile(r: () => number): FresherProfile {
  const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)]!;
  return {
    kind: "fresher",
    education: pick(EDUCATION),
    previousWork: pick(["None", "Part-time retail associate (8 months)", "Home tutor (1 year)", "Internship — marketing agency (3 months)", "Family business assistant"]),
    salesExperience: pick(["None", "Retail counter sales", "Event ticket sales (volunteer)", "Online reselling (informal)"]),
    customerServiceExperience: pick(["None", "Front desk at a clinic (6 months)", "Retail customer support", "Café service staff"]),
    communicationExperience: pick(["University debating society", "Class representative", "Presentations during coursework", "Social media page admin"]),
    englishProficiency: pick(["8 / 10 (self-rated)", "7 / 10 (self-rated)", "6 / 10 (self-rated)", "9 / 10 (self-rated)"]),
    commute: pick(["Yes — can commute to I-9/3 Islamabad (public transport)", "Yes — needs pick & drop to I-9/3 Islamabad", "Yes — can commute to I-9/3 Islamabad (own transport)"]),
    shiftAvailability: pick(["Night shift (US hours)", "Night shift, flexible", "Evening shift preferred"]),
    motivation: pick([
      "Wants a performance-based career with clear growth.",
      "Enjoys talking to people and wants to build communication skills.",
      "Interested in learning sales from a structured training program.",
    ]),
  };
}

function buildInterview(
  candidateId: string,
  track: Track,
  status: RecruitmentStatus,
  invitedAt: number,
  r: () => number,
  anchor: number,
): InterviewSession | undefined {
  if (status === "application_received") return undefined;
  const id = `INT-${candidateId.slice(4)}`;
  const qs = QUESTION_SETS[track];
  const idx = STATUS_PATH.indexOf(status);
  const base: InterviewSession = {
    id,
    candidateId,
    track,
    status: "not_started",
    reviewStatus: "not_applicable",
    invitedAt: new Date(invitedAt).toISOString(),
    expiresAt: new Date(invitedAt + INTERVIEW_CONFIG.completionWindowHours * HOUR).toISOString(),
    questionSetId: QUESTION_SET_META[track].id,
    answeredCount: 0,
    answers: [],
  };
  if (status === "ai_interview_pending") return base;
  if (status === "ai_interview_in_progress") {
    const answered = 1 + Math.floor(r() * 3);
    const startedAt = invitedAt + (2 + r() * 20) * HOUR;
    return {
      ...base,
      status: "in_progress",
      startedAt: new Date(Math.min(startedAt, anchor - HOUR)).toISOString(),
      answeredCount: answered,
      answers: buildAnswers(track, candidateId, answered),
    };
  }
  const startedAt = invitedAt + (3 + r() * 30) * HOUR;
  const answers = buildAnswers(track, candidateId, qs.length);
  const durationSec = sessionLength(answers);
  const reviewed = idx > STATUS_PATH.indexOf("recruiter_review_pending") || status === "not_selected";
  return {
    ...base,
    status: "completed",
    reviewStatus: reviewed ? "reviewed" : "awaiting_review",
    startedAt: new Date(startedAt).toISOString(),
    completedAt: new Date(startedAt + durationSec * 1000).toISOString(),
    durationSec,
    answeredCount: qs.length,
    answers,
  };
}

/** Response variant (0 strong, 1 solid, 2 partial) for a candidate/question pair. */
export function responseLevel(candidateId: string, questionId: string) {
  const h = hash(candidateId + questionId) % 10;
  return h < 4 ? 0 : h < 8 ? 1 : 2;
}

export function buildAnswers(track: Track, candidateId: string, count: number) {
  const qs = QUESTION_SETS[track];
  let t = 18;
  return qs.slice(0, count).map((q) => {
    const level = responseLevel(candidateId, q.id);
    const transcript = TRANSCRIPT_BANK[q.id]![level]!;
    const durationSec = Math.round(transcript.split(" ").length / 2.3) + 6;
    const a = { questionId: q.id, questionNumber: q.number, questionText: q.text, category: q.category, startedAtSec: t, durationSec, transcript };
    t += durationSec + 14;
    return a;
  });
}

function buildEvents(c: { id: string; status: RecruitmentStatus; recruiterId: string }, path: RecruitmentStatus[], times: number[]) {
  const recruiter = TEAM.find((t) => t.id === c.recruiterId)!.name;
  return path.map<RecruitmentEvent>((s, i) => ({
    id: `${c.id}-ev-${i}`,
    type: eventFor(s),
    label: eventLabel(s),
    at: new Date(times[i]!).toISOString(),
    actor:
      s === "application_received" ? "Careers website" :
      s === "ai_interview_in_progress" || s === "ai_interview_completed" || s === "withdrawn" ? "Candidate" :
      s === "recruiter_review_pending" || s === "ai_interview_pending" ? "System" : recruiter,
  }));
}

/** Featured candidates the candidate-side demo signs in as. */
export const FEATURED = {
  fresher: "CND-1001",
  experienced: "CND-1002",
} as const;

export function generateDataset() {
  const anchor = demoAnchor();
  const r = mulberry32(20261109);
  const candidates: Candidate[] = [];
  const interviews: InterviewSession[] = [];
  const recruiters = TEAM.filter((t) => t.role === "recruiter" || t.role === "hr_manager");

  const statuses: RecruitmentStatus[] = ["ai_interview_pending", "ai_interview_pending"];
  for (const [s, n] of STATUS_MIX) for (let i = 0; i < n; i++) statuses.push(s);

  const usedNames = new Set<string>();
  statuses.forEach((status, i) => {
    const num = 1001 + i;
    const id = `CND-${num}`;
    let name: string;
    let track: Track;
    if (i === 0) { name = "Ayesha Malik"; track = "fresher"; }
    else if (i === 1) { name = "Omar Siddiqui"; track = "experienced"; }
    else {
      do { name = `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`; } while (usedNames.has(name));
      track = r() < 0.44 ? "experienced" : "fresher";
    }
    usedNames.add(name);
    const recruiterId = recruiters[i % recruiters.length]!.id;

    // Later stages applied earlier. Build a forward path with timestamps ending before "now".
    let path: RecruitmentStatus[];
    if (status === "not_selected") {
      const stopAt = r() < 0.7 ? "recruiter_review_pending" : "hr_interview_completed";
      path = [...STATUS_PATH.slice(0, STATUS_PATH.indexOf(stopAt) + 1), "not_selected"];
    } else if (status === "withdrawn") {
      const stopAt = r() < 0.5 ? "ai_interview_in_progress" : "shortlisted";
      path = [...STATUS_PATH.slice(0, STATUS_PATH.indexOf(stopAt) + 1), "withdrawn"];
    } else {
      path = STATUS_PATH.slice(0, STATUS_PATH.indexOf(status) + 1);
    }
    const stepGapH = path.map((s, k) => (k === 0 ? 0 : s === "ai_interview_pending" ? 6 + r() * 30 : s === "ai_interview_completed" ? 0.3 : s === "recruiter_review_pending" ? 0.05 : 20 + r() * 80));
    // Spread applications across ~12 weeks. Open interviews must sit inside their invitation window.
    const openInterview = status === "ai_interview_pending" || status === "ai_interview_in_progress" || status === "application_received";
    const daysAgo = i < 2 ? 0.4 : openInterview ? 0.4 + r() * 13 : Math.min(82, path.length * 2.2 + r() * (80 - path.length * 2.2));
    const appliedAt = anchor - daysAgo * DAY;
    if (openInterview && path.length > 1) {
      // Applied any time in the last two weeks; invited within the last 3.5 days so the window is still open.
      // Invited within the 48-hour completion window so pending interviews are still open.
      const inviteAgoH = Math.min(daysAgo * 24 - 1, 2 + r() * 38);
      stepGapH[1] = daysAgo * 24 - inviteAgoH;
      for (let k = 2; k < stepGapH.length; k++) stepGapH[k] = Math.min(stepGapH[k]!, inviteAgoH / 2);
    }
    const windowH = Math.max(1, daysAgo * 24 - 2 - r() * Math.min(daysAgo * 6, 200));
    const rawTotal = stepGapH.reduce((a, b) => a + b, 0);
    const scale = openInterview ? 1 : rawTotal > windowH ? windowH / rawTotal : Math.min(2.5, windowH / Math.max(rawTotal, 1));
    for (let k = 0; k < stepGapH.length; k++) stepGapH[k] = stepGapH[k]! * scale;
    const lastAt = anchor - HOUR;
    const times: number[] = [];
    let t = appliedAt;
    stepGapH.forEach((g) => { t += g * HOUR; times.push(Math.min(t, lastAt)); });

    const invitedIdx = path.indexOf("ai_interview_pending");
    const source: RecruitmentStatus = status === "withdrawn" ? (path.includes("shortlisted") ? "shortlisted" : "ai_interview_in_progress") : status;
    const interview = invitedIdx >= 0 ? buildInterview(id, track, source, times[invitedIdx]!, r, anchor) : undefined;
    // Candidates who withdrew mid-interview leave an expired, incomplete session.
    if (interview && status === "withdrawn" && source === "ai_interview_in_progress") interview.status = "expired";
    if (interview?.reviewStatus === "reviewed") {
      interview.reviewerId = recruiterId;
      interview.reviewedAt = new Date(Math.min(new Date(interview.completedAt ?? interview.invitedAt!).getTime() + (4 + r() * 44) * HOUR, anchor - HOUR)).toISOString();
    }
    if (interview) interviews.push(interview);

    const firstName = name.split(" ")[0]!.toLowerCase();
    const lastName = name.split(" ")[1]!.toLowerCase();
    const c: Candidate = {
      id,
      name,
      email: `${firstName}.${lastName}${num % 7}@example.com`,
      phone: `+92 3${Math.floor(r() * 5)}${Math.floor(r() * 10)} ${String(1000000 + Math.floor(r() * 8999999)).slice(0, 3)} ${String(1000 + Math.floor(r() * 8999))}`,
      location: CITIES[Math.floor(r() * CITIES.length)]!,
      track,
      roleId: roleForTrack(track).id,
      appliedAt: new Date(appliedAt).toISOString(),
      status,
      stageEnteredAt: new Date(times[times.length - 1]!).toISOString(),
      lastUpdated: new Date(times[times.length - 1]!).toISOString(),
      recruiterId,
      interviewId: interview?.id,
      profile: track === "experienced" ? makeExperiencedProfile(r) : makeFresherProfile(r),
      remarks: [],
      events: [],
    };
    c.events = buildEvents(c, path, times);
    if (status === "shortlisted" && r() < 0.5) {
      c.remarks.push({ id: `${id}-rm-0`, authorId: recruiterId, at: c.stageEnteredAt, text: "Clear, structured answers. Recommend HR interview to confirm shift availability." });
    }
    if (status === "recruiter_review_pending" && i % 5 === 0) c.followUp = true;
    candidates.push(c);
  });

  // Featured demo candidates get friendly, predictable details.
  const ay = candidates[0]!;
  ay.email = "ayesha.malik@example.com";
  ay.location = "Islamabad";
  ay.profile = {
    kind: "fresher",
    education: "BBA (final year)",
    previousWork: "Part-time retail associate (8 months)",
    salesExperience: "Retail counter sales",
    customerServiceExperience: "Retail customer support",
    communicationExperience: "University debating society",
    englishProficiency: "8 / 10 (self-rated)",
    commute: "Yes — can commute to I-9/3 Islamabad (public transport)",
    shiftAvailability: "Night shift (US hours)",
    motivation: "Wants a performance-based career with clear growth.",
  };
  const om = candidates[1]!;
  om.email = "omar.siddiqui@example.com";

  const team = TEAM.map((m, i) => ({ ...m, lastActive: new Date(anchor - (i * 3 + 1) * HOUR * (m.active ? 1 : 90)).toISOString() }));

  const byStatus = (s: RecruitmentStatus) => candidates.find((c) => c.status === s)!;
  const nr = byStatus("recruiter_review_pending");
  const ns = byStatus("shortlisted");
  const nc = byStatus("ai_interview_completed");
  const notifications: AppNotification[] = [
    { id: "ntf-1", kind: "interview_completed", title: "New interview completed", body: `${nc.name} submitted their AI interview.`, at: new Date(anchor - 0.6 * HOUR).toISOString(), read: false, href: `/admin/interviews/${nc.interviewId}` },
    { id: "ntf-2", kind: "assessment_ready", title: "Assessment ready for review", body: `The AI assessment for ${nr.name} is ready.`, at: new Date(anchor - 2 * HOUR).toISOString(), read: false, href: `/admin/assessments/${nr.interviewId}` },
    { id: "ntf-3", kind: "awaiting_review", title: "Interviews awaiting review", body: `${candidates.filter((c) => c.status === "recruiter_review_pending").length} interviews are waiting for a recruiter.`, at: new Date(anchor - 5 * HOUR).toISOString(), read: false, href: "/admin/interviews?tab=review" },
    { id: "ntf-4", kind: "shortlisted", title: "Candidate shortlisted", body: `${ns.name} was shortlisted by ${team[2]!.name}.`, at: new Date(anchor - 26 * HOUR).toISOString(), read: true, href: `/admin/candidates/${ns.id}` },
    { id: "ntf-5", kind: "remark", title: "New HR remark added", body: `A remark was added to ${ns.name}'s profile.`, at: new Date(anchor - 30 * HOUR).toISOString(), read: true, href: `/admin/candidates/${ns.id}?tab=notes` },
  ];

  return { candidates, interviews, team, notifications };
}

/** Session length in seconds: end of the last answer plus a short closing segment. */
export function sessionLength(answers: { startedAtSec: number; durationSec: number }[]) {
  const last = answers[answers.length - 1];
  return last ? last.startedAtSec + last.durationSec + 6 : 0;
}
