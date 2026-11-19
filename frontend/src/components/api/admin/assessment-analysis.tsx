"use client";
import Link from "@/components/navigation/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-provider";
import { apiRequest } from "@/lib/api/client";
import type { AssessmentDetail, InterviewDetailFull } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/primitives";

type RecordingSummary = {
  id: string;
  status: string;
  durationMs: number | null;
  sizeBytes: number | null;
};

export function AssessmentAnalysis({
  report,
  interview,
  refresh,
  onDraftChange,
}: {
  report: AssessmentDetail;
  interview: InterviewDetailFull;
  refresh: () => void;
  onDraftChange?: (dirty: boolean) => void;
}) {
  const { profile } = useAuth();
  const canReview = profile?.permissions.includes("interviews:review");
  const [note, setNote] = useState("");
  const [questionCode, setQuestion] = useState("");
  const [relevance, setRelevance] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [recordings, setRecordings] = useState<RecordingSummary[] | null>(null);

  useEffect(() => {
    onDraftChange?.(note.trim().length > 0);
  }, [note, onDraftChange]);

  useEffect(() => {
    let active = true;
    Promise.resolve(apiRequest<{ recordings: RecordingSummary[] }>("/recordings", { query: { sessionId: interview.interviewId }, admin: true }))
      .then((res) => {
        if (active) setRecordings(res?.data?.recordings ?? []);
      })
      .catch(() => {
        if (active) setRecordings([]);
      });
    return () => {
      active = false;
    };
  }, [interview.interviewId]);

  async function act(action: string, body?: unknown) {
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/ai/reports/${report.id}/${action}`, { method: "POST", body });
      setNote("");
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  const findings = report.findings;
  return (
    <div className="mt-6 space-y-5">
      {/* Section D — AI-Assisted Assessment */}
      <GlassCard className="print-break-avoid p-6">
        <h2 className="font-semibold">Section D — AI-Assisted Assessment (Decision Support Only)</h2>
        <p className="mt-2 text-sm">Phase: {(report.phase ?? "NOT_GENERATED").replaceAll("_", " ")}</p>
        {report.failureReason && <p className="mt-2 text-sm text-fg-muted">{report.failureReason.replaceAll("_", " ")}</p>}
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium">AI Analysis details</summary>
          <p className="mt-2 text-sm text-fg-muted">Model: {report.model ?? "No LLM result generated"} · Factual claims: Not Independently Verified</p>
        </details>
        <p className="mt-2 text-sm">
          {interview.questions.filter((q) => q.answer?.confirmedAt).length} answered questions.{" "}
          {report.nlp?.filter((n) => n.completeness === "limited_information" || n.completeness === "empty").length ?? 0} responses flagged for limited information. Sufficiency requires HR review.
        </p>
        {findings ? (
          <>
            <h3 className="mt-5 font-semibold">Role-Relevant Evidence</h3>
            <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <h3 className="font-medium">Observed job-related strengths</h3>
                <ul className="mt-2 list-inside list-disc">
                  {findings.summary.observedStrengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
                {!findings.summary.observedStrengths.length && <p className="mt-2 text-fg-muted">No supported strengths reported.</p>}
              </div>
              <div>
                <h3 className="font-medium">Areas requiring clarification</h3>
                <ul className="mt-2 list-inside list-disc">
                  {findings.summary.areasForHRReview.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
              <p>{findings.questions.filter((q) => q.relevance !== "insufficient_information").length} responses have enough information for an LLM relevance classification; HR should verify this.</p>
            </div>
            <p className="mt-3 text-sm">
              Relevance:{" "}
              {Object.entries(
                findings.questions.reduce<Record<string, number>>((counts, q) => ({ ...counts, [q.relevance]: (counts[q.relevance] ?? 0) + 1 }), {}),
              )
                .map(([label, count]) => `${label.replaceAll("_", " ")}: ${count}`)
                .join(" · ")}
            </p>
            <ul className="mt-3 list-inside list-disc text-sm">
              {findings.summary.limitations.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-3 text-sm text-fg-muted">
            LLM narrative findings have not been generated for this report version. No scores or conclusions are fabricated; review the confirmed answers and NLP concept coverage below.
          </p>
        )}
        <p className="mt-4 border-t border-subtle pt-3 text-xs text-fg-muted">
          Technical limitation: AI analysis evaluates only the job-related text of candidate-confirmed answers. It never infers honesty, employability, or character from facial appearance, voice accent, emotion, or tab-focus events.
        </p>
      </GlassCard>

      {/* Section C — Question-by-Question Review */}
      <GlassCard className="p-6">
        <h2 className="font-semibold">Section C — Question-by-Question Review</h2>
        <p className="mt-1 text-xs text-fg-muted">Official question text, candidate-confirmed answer, and evidence-backed observations</p>
        <div className="mt-4 space-y-4">
          {interview.questions.map((q) => {
            const nlp = report.nlp?.find((n) => n.questionId === q.code);
            const result = findings?.questions.find((n) => n.questionId === q.code);
            const rubric = report.rubricSnapshot?.find((n) => n.questionId === q.code);
            return (
              <details key={q.code} open className="print-break-avoid rounded-2xl border border-subtle bg-panel p-5 sm:p-6">
                <summary className="cursor-pointer font-semibold">
                  Question {q.position} · {q.category} ({q.code})
                </summary>
                <h3 className="sr-only">Question-by-Question Evaluation</h3>
                <p className="mt-2 text-sm font-medium">{q.text}</p>
                <p className="mt-4 text-xs text-fg-muted">Confirmed answer</p>
                <blockquote id={`answer-${q.code}`} className="mt-1 whitespace-pre-wrap break-words border-l-2 border-glow pl-4 text-sm">
                  {q.answer?.transcript ?? "No confirmed answer"}
                </blockquote>
                {rubric && <p className="mt-4 text-sm">Approved reference concepts (v{rubric.version}): {rubric.content.expectedConcepts.map((c) => c.name).join("; ")}</p>}
                {nlp && (
                  <>
                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm text-fg-muted">Technical similarity measures</summary>
                      <p className="mt-3 text-sm">
                        Lexical cosine: {nlp.lexicalSimilarity.toFixed(3)} · Semantic cosine: {nlp.semanticSimilarity === null ? "Unavailable" : nlp.semanticSimilarity.toFixed(3)}
                      </p>
                    </details>
                    <ul className="mt-2 space-y-1 text-sm text-fg-secondary">
                      {nlp.conceptCoverage.map((c) => (
                        <li key={c.concept}>
                          {c.concept}: {c.status.replaceAll("_", " ")}
                          {c.evidence && <blockquote className="pl-3">“{c.evidence}”</blockquote>}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-xs text-fg-muted">{nlp.limitations.join(" ")}</p>
                  </>
                )}
                {result && (
                  <>
                    <p className="mt-4 font-medium">Suggested relevance: {result.relevance.replaceAll("_", " ")}</p>
                    {[...result.strengths.map((s) => ({ ...s, kind: "Strength" })), ...result.reviewPoints.map((s) => ({ ...s, kind: "HR review" }))].map((s, i) => (
                      <div key={i} className="mt-3 text-sm">
                        <p>
                          {s.kind}: {s.observation}
                        </p>
                        {s.evidence ? (
                          <a href={`#answer-${q.code}`} className="text-fg-secondary underline">
                            “{s.evidence}”
                          </a>
                        ) : (
                          <p className="text-fg-muted">Missing evidence — clarification needed.</p>
                        )}
                      </div>
                    ))}
                    <p className="mt-3 text-xs text-fg-muted">{result.limitations.join(" ")}</p>
                  </>
                )}
              </details>
            );
          })}
        </div>
      </GlassCard>

      {/* Section E — HR Review */}
      <GlassCard className="print-break-avoid p-6">
        <h2 className="font-semibold">Section E — HR Notes and Review</h2>
        <p className="mt-2 text-sm">Interview review status: {(interview.review?.status ?? "PENDING_REVIEW").replaceAll("_", " ")}</p>
        {interview.review?.remarks && <p className="mt-2 text-sm text-fg-secondary">Reviewer decision remarks: {interview.review.remarks}</p>}
        {report.corrections?.map((c) => (
          <p key={c.id} className="mt-3 text-sm">
            {new Date(c.createdAt).toLocaleString()} · {c.questionCode} {c.relevance?.replaceAll("_", " ")} · {c.note} {c.reviewed ? "(Reviewed)" : ""}
          </p>
        ))}
        {!report.corrections?.length && !interview.review?.remarks && <p className="mt-2 text-sm text-fg-muted">Awaiting human review.</p>}
        {canReview && (
          <div className="no-print mt-4 space-y-3" data-report-draft-dirty={note.trim().length > 0 ? "true" : "false"}>
            <textarea
              aria-label="HR note or inaccurate finding"
              className="w-full rounded-lg border border-border bg-surface p-3 text-sm"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={4000}
              placeholder="Note, clarification, or inaccurate finding (save before exporting PDF)"
            />
            <div className="flex flex-wrap gap-3">
              <select aria-label="Question to correct" className="rounded border border-border bg-surface p-2" value={questionCode} onChange={(e) => setQuestion(e.target.value)}>
                <option value="">Whole report</option>
                {interview.questions.map((q) => (
                  <option key={q.code}>{q.code}</option>
                ))}
              </select>
              <select aria-label="Corrected relevance" className="rounded border border-border bg-surface p-2" value={relevance} onChange={(e) => setRelevance(e.target.value)}>
                <option value="">No relevance correction</option>
                {["highly_relevant", "relevant", "partially_relevant", "off_topic", "insufficient_information"].map((v) => (
                  <option key={v} value={v}>
                    {v.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-3">
              {[false, true].map((reviewed) => (
                <Button
                  key={String(reviewed)}
                  disabled={busy || !note.trim() || (!!relevance && !questionCode)}
                  onClick={() => void act("corrections", { note, reviewed, ...(questionCode ? { questionCode } : {}), ...(relevance ? { relevance } : {}) })}
                >
                  {reviewed ? "Mark reviewed" : "Save note / correction"}
                </Button>
              ))}
              <Button variant="secondary" disabled={busy || ["PENDING", "PROCESSING"].includes(report.status)} onClick={() => void act("reassess")}>
                Request new report version
              </Button>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="no-print mt-3 text-sm text-red-400">
            {error}
          </p>
        )}
      </GlassCard>

      {/* Section F — Recording Information */}
      <GlassCard className="print-break-avoid p-6">
        <h2 className="font-semibold">Section F — Recording Information</h2>
        <p className="mt-1 text-xs text-fg-muted">Private storage URLs and raw media are never embedded in exported reports.</p>
        {recordings === null ? (
          <p className="mt-3 text-sm text-fg-muted">Checking authorized recording metadata…</p>
        ) : recordings.length === 0 ? (
          <p className="mt-3 text-sm text-fg-muted">No recording is stored for this session. Confirmed text transcripts in Section C are the authoritative record.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {recordings.map((rec) => (
              <li key={rec.id} className="rounded-lg border border-subtle p-3">
                Status: <span className="font-medium">{rec.status.replaceAll("_", " ")}</span> · Duration:{" "}
                {rec.durationMs == null ? "Unavailable" : `${Math.round(rec.durationMs / 1000)} seconds`} · Size:{" "}
                {rec.sizeBytes == null ? "Incomplete" : `${(rec.sizeBytes / 1048576).toFixed(1)} MB`}
              </li>
            ))}
          </ul>
        )}
        <p className="no-print mt-3 text-xs text-fg-muted">
          Authorized reviewers can open short-lived in-app playback from{" "}
          <Link href={`/admin/interviews/${interview.interviewId}`} className="text-brand-cyan underline">
            Interview Review → Recording
          </Link>
          .
        </p>
      </GlassCard>
    </div>
  );
}
