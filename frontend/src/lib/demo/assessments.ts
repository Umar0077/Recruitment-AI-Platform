/**
 * Builds illustrative AI assessment reports from interview transcripts.
 * Scores are demo data on a provisional 1–5 scale. They summarise job-related
 * response content only — nothing is inferred from video, faces, or voice.
 */
import type { AssessmentReport, Candidate, InterviewSession } from "@/types";
import { ASSESSMENT_CRITERIA, QUESTION_SETS } from "./questions";
import { CRITERION_EXPLANATIONS, OBSERVATIONS } from "./transcripts";
import { hash, responseLevel } from "./seed";

const levelToScore = (level: number, jitter: number) => Math.max(1.5, Math.min(5, [4.4, 3.5, 2.5][level]! + jitter));

function excerpt(text: string) {
  const sentence = text.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
  return sentence.length > 220 ? `${sentence.slice(0, 217)}…` : sentence;
}

export function buildAssessment(candidate: Candidate, interview: InterviewSession): AssessmentReport | null {
  if (interview.status !== "completed") return null;
  const qs = QUESTION_SETS[candidate.track];
  const levels: number[] = qs.map((q) => responseLevel(candidate.id, q.id));
  const avgLevel = levels.reduce((a, b) => a + b, 0) / levels.length;

  const questions = qs.map((q, i) => {
    const level = levels[i]!;
    const answer = interview.answers.find((a) => a.questionId === q.id);
    return {
      questionId: q.id,
      number: q.number,
      category: answer?.category ?? q.category,
      question: answer?.questionText ?? q.text,
      excerpt: answer ? excerpt(answer.transcript) : "",
      observation: interview.capturedLive ? "Sample observation shown for layout only — this answer was not analysed. Review the transcript directly." : OBSERVATIONS[q.id]![level]!,
      score: Math.round(levelToScore(level, ((hash(candidate.id + q.id + "s") % 5) - 2) / 10) * 10) / 10,
    };
  });

  const criteria = ASSESSMENT_CRITERIA[candidate.track].map((c, i) => {
    const h = hash(candidate.id + c.id);
    // One review section per official question category, based on that question's response.
    const lvl = levels[i] ?? Math.round(avgLevel);
    return {
      id: c.id,
      label: c.label,
      score: Math.round(levelToScore(lvl, ((h % 7) - 3) / 10) * 10) / 10,
      explanation: interview.capturedLive ? "Placeholder — not generated from this answer. Read the confirmed transcript." : CRITERION_EXPLANATIONS[c.id]![lvl]!,
    };
  });

  const overall = Math.round((criteria.reduce((a, b) => a + b.score, 0) / criteria.length) * 10) / 10;
  const sorted = [...criteria].sort((a, b) => b.score - a.score);
  const first = candidate.name.split(" ")[0];

  const summary =
    overall >= 4
      ? `${first}'s responses were consistently relevant and well structured, with specific examples in most answers. The illustrative assessment suggests a strong basis for recruiter review, particularly in ${sorted[0]!.label.toLowerCase()}.`
      : overall >= 3.2
        ? `${first} answered all questions with generally relevant content. Some responses would benefit from more specific examples; recruiter review should focus on ${sorted[sorted.length - 1]!.label.toLowerCase()}.`
        : `${first} completed the interview, though several responses were brief or only partly addressed the question. A recruiter should review the full transcript before making any decision.`;

  const finalSummary = interview.capturedLive
    ? `${first} completed a live voice interview in the demo. The transcript above is real; the scores and observations on this page are illustrative placeholders and were not generated from these answers.`
    : summary;

  const strengths = sorted.slice(0, 3).map((c) => `${c.label}: ${c.explanation}`);
  const reviewAreas = sorted
    .slice(-2)
    .reverse()
    .map((c) => `${c.label}: ${c.explanation}`);
  if (candidate.track === "experienced") reviewAreas.push("Self-reported campaign history and performance figures have not been verified.");

  return {
    id: `ASM-${interview.id.slice(4)}`,
    interviewId: interview.id,
    candidateId: candidate.id,
    generatedAt: interview.completedAt!,
    overall,
    summary: finalSummary,
    criteria,
    questions,
    strengths,
    reviewAreas,
  };
}
