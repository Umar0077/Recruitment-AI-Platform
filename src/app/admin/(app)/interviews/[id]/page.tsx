"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { UserRound, VideoOff } from "lucide-react";
import { isApiMode } from "@/lib/config/environment";
import { ApiInterviewReview } from "@/components/api/admin/interview-review";
import { Button } from "@/components/ui/button";
import { Badge, Field, GlassCard, CardHeader, Pill, SearchInput } from "@/components/ui/primitives";
import { Select, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { EmptyState, InterviewStatusBadge } from "@/components/ui/states";
import { ReviewPanel } from "@/components/admin/review-panel";
import { TranscriptVersions } from "@/components/interview/transcript-versions";
import { useCandidate, useInterview, roleTitle } from "@/lib/demo/selectors";
import { QUESTION_SET_META, QUESTION_SETS } from "@/lib/demo/questions";
import { formatDateTime, formatMinutes } from "@/lib/utils";

function DemoInterviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const interview = useInterview(id);
  const candidate = useCandidate(interview?.candidateId);
  const [tab, setTab] = useState("summary");
  const [q, setQ] = useState("");
  const [qFilter, setQFilter] = useState("all");
  if (!interview || !candidate) return <EmptyState icon={<VideoOff />} title="Interview not found" description="This interview is not in the fictional demo dataset." action={<Button asChild><Link href="/admin/interviews">Back to Interviews</Link></Button>} />;
  if (interview.status === "not_started") return <EmptyState icon={<VideoOff />} title="Interview not started" description="No confirmed answers are available yet." action={<Button asChild><Link href={`/admin/candidates/${candidate.id}`}>Candidate Profile</Link></Button>} />;
  const term = q.trim().toLowerCase();
  const visible = QUESTION_SETS[interview.track].filter(question => {
    const answer = interview.answers.find(a => a.questionId === question.id);
    return (qFilter === "all" || String(question.number) === qFilter) && (!term || (answer?.questionText ?? question.text).toLowerCase().includes(term) || answer?.transcript.toLowerCase().includes(term));
  });
  return <div>
    <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div><p className="text-xs text-fg-muted">Interview review · fictional demo</p><h1 className="mt-1 break-words text-3xl font-bold">{candidate.name}</h1><div className="mt-3 flex flex-wrap gap-2"><Pill>{roleTitle(candidate)}</Pill><InterviewStatusBadge status={interview.status} review={interview.reviewStatus} /></div></div>
      <div className="flex flex-wrap gap-2"><Button variant="secondary" asChild><Link href={`/admin/candidates/${candidate.id}`}><UserRound />Candidate Profile</Link></Button><Button onClick={()=>setTab("decision")}>HR Decision</Button></div>
    </div>
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList aria-label="Interview review sections"><TabsTrigger value="summary">Interview Summary</TabsTrigger><TabsTrigger value="questions">Questions & Answers</TabsTrigger><TabsTrigger value="assessment">AI Assessment</TabsTrigger><TabsTrigger value="recording">Recording</TabsTrigger><TabsTrigger value="decision">HR Decision</TabsTrigger></TabsList>
      <TabsContent value="summary" className="mt-5"><GlassCard className="p-5 sm:p-6"><h2 className="text-lg font-semibold">Interview Summary</h2><dl className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"><Field label="Candidate" value={candidate.name} /><Field label="Applied role" value={roleTitle(candidate)} /><Field label="Answers confirmed" value={interview.answeredCount + " of " + QUESTION_SETS[interview.track].length} /><Field label="Started" value={formatDateTime(interview.startedAt)} /><Field label="Submitted" value={formatDateTime(interview.completedAt)} /><Field label="Submission" value={interview.capturedLive ? "Live demo · stored in this browser" : "Fictional sample record"} /></dl><Button className="mt-5" onClick={()=>setTab("questions")}>Review answers</Button></GlassCard></TabsContent>
      <TabsContent value="questions" className="mt-5"><div className="mb-4 flex flex-col gap-3 sm:flex-row"><SearchInput aria-label="Search questions and answers" placeholder="Search questions and answers…" value={q} onChange={e=>setQ(e.target.value)} /><Select label="Filter by question" value={qFilter} onValueChange={setQFilter} options={[{value:"all",label:"All questions"},...QUESTION_SETS[interview.track].map(x=>({value:String(x.number),label:"Question " + x.number}))]} /></div>{!visible.length && <p role="status" className="mb-4 text-sm text-fg-muted">No questions or answers match your search.</p>}
          {/* Question-by-question responses */}
          <GlassCard className="p-5 sm:p-6">
            <CardHeader title="Question-by-Question Responses" description={`${QUESTION_SETS[interview.track].length} official questions · question set ${interview.questionSetId ?? QUESTION_SET_META[interview.track].id}`} action={<Pill>{QUESTION_SET_META[interview.track].title}</Pill>} />
            <ol className="mt-5 space-y-3">
              {visible.map((base) => {
                const a = interview.answers.find((x) => x.questionId === base.id);
                return (
                  <li key={base.id} className="rounded-xl border border-subtle bg-overlay/[0.02] p-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-display font-semibold text-brand-cyan">Question {base.number} — {a?.category ?? base.category}</span>
                      <span className="font-mono text-fg-disabled">{base.id}</span>
                      <span className="ml-auto flex flex-wrap items-center gap-2">
                        {a?.inputMode && <Badge tone={a.inputMode === "voice" ? "blue" : "neutral"} dot={false}>{a.inputMode === "voice" ? "Speech-to-Text" : "Typed fallback"}</Badge>}
                        {a && <span className="tabular-nums text-fg-muted">{formatMinutes(a.durationSec)}</span>}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-medium leading-relaxed text-fg">{a?.questionText ?? base.text}</p>
                    {a ? (
                      <TranscriptVersions answer={a} />
                    ) : (
                      <p className="mt-3 text-sm italic text-fg-muted">Not answered yet.</p>
                    )}
                  </li>
                );
              })}
            </ol>
          </GlassCard>


      </TabsContent>
      <TabsContent value="assessment" className="mt-5"><GlassCard className="p-6"><h2 className="text-lg font-semibold">AI Assessment</h2><p className="mt-3 text-sm text-fg-muted">Demo assessments are illustrative. Hiring decisions remain with HR.</p>{interview.status === "completed" ? <Button className="mt-4" asChild><Link href={`/admin/assessments/${interview.id}`}>Open assessment report</Link></Button> : <p className="mt-3 text-sm">Available after the interview is submitted.</p>}</GlassCard></TabsContent>
      <TabsContent value="recording" className="mt-5"><GlassCard className="p-6"><h2 className="text-lg font-semibold">Recording</h2><p className="mt-3 text-sm text-fg-muted">No recording is available in this fictional demo. Review the candidate-confirmed text in Questions & Answers. Real recordings appear only when a stored recording is available to your authorized account.</p></GlassCard></TabsContent>
      <TabsContent value="decision" forceMount className="mt-5 data-[state=inactive]:hidden"><GlassCard className="max-w-3xl p-5 sm:p-6"><CardHeader title="HR Decision" description="Fictional demo changes are stored only in this browser." /><div className="mt-5"><ReviewPanel candidate={candidate} interview={interview} /></div></GlassCard></TabsContent>
    </Tabs>
  </div>;
}
export default function InterviewDetailPage() { return isApiMode ? <ApiInterviewReview /> : <DemoInterviewDetailPage />; }
