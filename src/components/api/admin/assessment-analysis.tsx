"use client";
import { useState } from "react";
import { useAuth } from "@/lib/auth/auth-provider";
import { apiRequest } from "@/lib/api/client";
import type { AssessmentDetail, InterviewDetailFull } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/primitives";

export function AssessmentAnalysis({ report, interview, refresh }: { report: AssessmentDetail; interview: InterviewDetailFull; refresh: () => void }) {
  const { profile } = useAuth();
  const canReview = profile?.permissions.includes("interviews:review");
  const [note, setNote] = useState("");
  const [questionCode, setQuestion] = useState("");
  const [relevance, setRelevance] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function act(action: string, body?: unknown) {
    setBusy(true); setError("");
    try { await apiRequest(`/ai/reports/${report.id}/${action}`, { method: "POST", body }); setNote(""); refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Request failed"); }
    finally { setBusy(false); }
  }
  const findings = report.findings;
  return <div className="mt-6 space-y-5">
    <GlassCard className="p-6">
      <h2 className="font-semibold">Overall Summary</h2>
      <p className="mt-2 text-sm">{(report.phase ?? "NOT_GENERATED").replaceAll("_", " ")}</p>
      {report.failureReason && <p className="mt-2 text-sm text-fg-muted">{report.failureReason.replaceAll("_", " ")}</p>}
      <details className="mt-3"><summary className="cursor-pointer text-sm font-medium">AI Analysis details</summary><p className="mt-2 text-sm text-fg-muted">Model: {report.model ?? "No LLM result generated"} · Factual claims: Not Independently Verified</p></details>
      <p className="mt-2 text-sm">{interview.questions.filter(q => q.answer?.confirmedAt).length} answered questions. {report.nlp?.filter(n => n.completeness === "limited_information" || n.completeness === "empty").length ?? 0} responses flagged for limited information. Sufficiency requires HR review.</p>
      {findings && <h3 className="mt-5 font-semibold">Role-Relevant Evidence</h3>}
      {findings && <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2"><div><h3 className="font-medium">Observed job-related strengths</h3><ul className="mt-2 list-inside list-disc">{findings.summary.observedStrengths.map((s, i) => <li key={i}>{s}</li>)}</ul>{!findings.summary.observedStrengths.length && <p className="mt-2 text-fg-muted">No supported strengths reported.</p>}</div><div><h3 className="font-medium">Areas requiring clarification</h3><ul className="mt-2 list-inside list-disc">{findings.summary.areasForHRReview.map((s, i) => <li key={i}>{s}</li>)}</ul></div><p>{findings.questions.filter(q => q.relevance !== "insufficient_information").length} responses have enough information for an LLM relevance classification; HR should verify this.</p></div>}
      {findings && <><p className="mt-3 text-sm">Relevance: {Object.entries(findings.questions.reduce<Record<string, number>>((counts, q) => ({ ...counts, [q.relevance]: (counts[q.relevance] ?? 0) + 1 }), {})).map(([label, count]) => `${label.replaceAll("_", " ")}: ${count}`).join(" · ")}</p><ul className="mt-3 list-inside list-disc text-sm">{findings.summary.limitations.map((s, i) => <li key={i}>{s}</li>)}</ul></>}
    </GlassCard>
    {interview.questions.map(q => {
      const nlp = report.nlp?.find(n => n.questionId === q.code);
      const result = findings?.questions.find(n => n.questionId === q.code);
      const rubric = report.rubricSnapshot?.find(n => n.questionId === q.code);
      return <details key={q.code} className="rounded-2xl border border-subtle bg-panel p-5 sm:p-6"><summary className="cursor-pointer font-semibold">Question {q.position} · {q.category}</summary>
        <h3 className="sr-only">Question-by-Question Evaluation</h3><p className="mt-2 text-sm">{q.text}</p>
        <p className="mt-4 text-xs text-fg-muted">Confirmed answer</p><blockquote id={`answer-${q.code}`} className="mt-1 whitespace-pre-wrap border-l-2 border-glow pl-4 text-sm">{q.answer?.transcript ?? "No confirmed answer"}</blockquote>
        {rubric && <p className="mt-4 text-sm">Approved reference concepts (v{rubric.version}): {rubric.content.expectedConcepts.map(c => c.name).join("; ")}</p>}
        {nlp && <><details className="mt-3"><summary className="cursor-pointer text-sm text-fg-muted">Technical similarity measures</summary><p className="mt-4 text-sm">Lexical cosine: {nlp.lexicalSimilarity.toFixed(3)} · Semantic cosine: {nlp.semanticSimilarity === null ? "Unavailable" : nlp.semanticSimilarity.toFixed(3)}</p></details><ul className="mt-2 space-y-1 text-sm text-fg-secondary">{nlp.conceptCoverage.map(c => <li key={c.concept}>{c.concept}: {c.status.replaceAll("_", " ")}{c.evidence && <blockquote className="pl-3">“{c.evidence}”</blockquote>}</li>)}</ul><p className="mt-3 text-xs text-fg-muted">{nlp.limitations.join(" ")}</p></>}
        {result && <><p className="mt-4 font-medium">Suggested relevance: {result.relevance.replaceAll("_", " ")}</p>{[...result.strengths.map(s => ({ ...s, kind: "Strength" })), ...result.reviewPoints.map(s => ({ ...s, kind: "HR review" }))].map((s, i) => <div key={i} className="mt-3 text-sm"><p>{s.kind}: {s.observation}</p>{s.evidence ? <a href={`#answer-${q.code}`} className="text-fg-secondary underline">“{s.evidence}”</a> : <p className="text-fg-muted">Missing evidence — clarification needed.</p>}</div>)}<p className="mt-3 text-xs text-fg-muted">{result.limitations.join(" ")}</p></>}
      </details>;
    })}
    <GlassCard className="p-6"><h2 className="font-semibold">HR Notes and Review</h2><p className="mt-2 text-sm">Interview review: {(interview.review?.status ?? "PENDING_REVIEW").replaceAll("_", " ")}</p>
      {report.corrections?.map(c => <p key={c.id} className="mt-3 text-sm">{new Date(c.createdAt).toLocaleString()} · {c.questionCode} {c.relevance?.replaceAll("_", " ")} · {c.note} {c.reviewed ? "(Reviewed)" : ""}</p>)}
      {!report.corrections?.length && <p className="mt-2 text-sm text-fg-muted">Awaiting human review.</p>}
      {canReview && <div className="mt-4 space-y-3"><textarea aria-label="HR note or inaccurate finding" className="w-full rounded-lg border border-border bg-surface p-3 text-sm" value={note} onChange={e => setNote(e.target.value)} maxLength={4000} placeholder="Note, clarification, or inaccurate finding" /><div className="flex flex-wrap gap-3"><select aria-label="Question to correct" className="rounded border border-border bg-surface p-2" value={questionCode} onChange={e => setQuestion(e.target.value)}><option value="">Whole report</option>{interview.questions.map(q => <option key={q.code}>{q.code}</option>)}</select><select aria-label="Corrected relevance" className="rounded border border-border bg-surface p-2" value={relevance} onChange={e => setRelevance(e.target.value)}><option value="">No relevance correction</option>{["highly_relevant", "relevant", "partially_relevant", "off_topic", "insufficient_information"].map(v => <option key={v} value={v}>{v.replaceAll("_", " ")}</option>)}</select></div><div className="flex flex-wrap gap-3">{[false, true].map(reviewed => <Button key={String(reviewed)} disabled={busy || !note.trim() || (!!relevance && !questionCode)} onClick={() => void act("corrections", { note, reviewed, ...(questionCode ? { questionCode } : {}), ...(relevance ? { relevance } : {}) })}>{reviewed ? "Mark reviewed" : "Save note / correction"}</Button>)}<Button variant="secondary" disabled={busy || ["PENDING", "PROCESSING"].includes(report.status)} onClick={() => void act("reassess")}>Request new report version</Button></div></div>}
      {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
    </GlassCard>
  </div>;
}

