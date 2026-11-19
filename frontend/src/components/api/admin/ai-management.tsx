"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-provider";
import { apiRequest } from "@/lib/api/client";
import { isApiMode } from "@/lib/config/environment";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/primitives";
import { ApiErrorPanel } from "@/components/api/query-state";
type RubricContent = { exampleAnswer: string; expectedConcepts: { name: string; alternatives: string[] }[]; acceptableAlternatives: string[]; requiredKnowledge: string[]; factualInaccuracies: string[]; compliance: string[]; criteria: string[] };
type RubricRow = { id: string; version: number; status: string; content: RubricContent; approvedAt: string | null };
type QuestionRow = { id: string; code: string; text: string; version: { versionCode: string }; rubrics: RubricRow[] };
function Editor({ question, refresh }: { question: QuestionRow; refresh: () => void }) {
  const [selected, setSelected] = useState(question.rubrics[0]?.id ?? "");
  const rubric = question.rubrics.find(r => r.id === selected) ?? question.rubrics[0];
  const [content, setContent] = useState<RubricContent | undefined>(rubric?.content);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function action(path: string, body?: unknown, method: "POST" | "PUT" = "POST") {
    setBusy(true); setError("");
    try { await apiRequest(path, { method, body, timeoutMs: 125000 }); refresh(); }
    catch(e) { setError(e instanceof Error ? e.message : "Request failed"); }
    finally { setBusy(false); }
  }
  return <GlassCard className="p-6"><h2 className="font-semibold">{question.code} · {question.version.versionCode}</h2><p className="mt-2 text-sm">{question.text}</p><p className="mt-1 text-xs text-fg-muted">Official question — locked</p>
    <select aria-label={`${question.code} version history`} className="mt-4 rounded border border-border bg-surface p-2" value={rubric?.id ?? ""} onChange={e => { setSelected(e.target.value); setContent(question.rubrics.find(r => r.id === e.target.value)?.content); }}>{question.rubrics.map(r => <option value={r.id} key={r.id}>v{r.version} · {r.status}{r.approvedAt ? ` · ${new Date(r.approvedAt).toLocaleDateString()}` : ""}</option>)}</select>
    {content && <div className="mt-4 space-y-4"><label className="block text-sm">Example reference answer<textarea className="mt-1 min-h-28 w-full rounded border border-border bg-surface p-3" value={content.exampleAnswer} onChange={e => setContent({ ...content, exampleAnswer: e.target.value })} /></label><label className="block text-sm">Expected concepts — one per line, followed by alternatives separated by |<textarea className="mt-1 min-h-28 w-full rounded border border-border bg-surface p-3" value={content.expectedConcepts.map(c => [c.name, ...c.alternatives].join(" | ")).join("\n")} onChange={e => setContent({ ...content, expectedConcepts: e.target.value.split("\n").map(line => { const [name, ...alternatives] = line.split("|").map(s => s.trim()); return { name, alternatives }; }) })} /></label>{(["acceptableAlternatives", "requiredKnowledge", "factualInaccuracies", "compliance", "criteria"] as const).map(key => <label key={key} className="block text-sm">{({ acceptableAlternatives: "Acceptable alternatives", requiredKnowledge: "Role knowledge", factualInaccuracies: "Factual concerns", compliance: "Compliance considerations", criteria: "Evaluation criteria" })[key]}<textarea className="mt-1 w-full rounded border border-border bg-surface p-3" value={content[key].join("\n")} onChange={e => setContent({ ...content, [key]: e.target.value ? e.target.value.split("\n") : [] })} /></label>)}<div className="flex flex-wrap gap-3"><Button disabled={busy} onClick={() => void action(`/ai/rubrics/${question.id}/drafts`, { content })}>Save as new draft version</Button>{rubric?.status === "DRAFT" && <><Button variant="secondary" disabled={busy} onClick={() => void action(`/ai/rubrics/${rubric.id}`, { content }, "PUT")}>Save draft edits</Button><Button variant="secondary" disabled={busy || JSON.stringify(content) !== JSON.stringify(rubric.content)} onClick={() => void action(`/ai/rubrics/${rubric.id}/approve`)}>Approve saved draft</Button></>}</div></div>}
    <Button className="mt-4" variant="secondary" disabled={busy} onClick={() => void action(`/ai/rubrics/${question.id}/generate`)}>Generate fictional draft with LLM</Button>{error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
  </GlassCard>;
}
export function AiManagement() {
  const { profile } = useAuth();
  const allowed = !!profile?.permissions.includes("question_sets:manage");
  const admin = !!profile?.permissions.includes("users:manage");
  const [error, setError] = useState("");
  const rubrics = useQuery({ queryKey: ["ai-rubrics"], enabled: isApiMode && allowed, queryFn: async () => (await apiRequest<QuestionRow[]>("/ai/rubrics")).data });
  const usage = useQuery({ queryKey: ["ai-usage"], enabled: isApiMode && admin, queryFn: async () => (await apiRequest<Record<string, string | number | null>>("/ai/usage")).data });
  if (!isApiMode) return <GlassCard className="p-6">Rubric management requires API mode. Demo mode never sends candidate answers externally.</GlassCard>;
  if (!allowed) return <GlassCard className="p-6">HR manager access is required.</GlassCard>;
  return <div className="space-y-5"><h1 className="text-2xl font-bold">Reference rubrics & AI usage</h1><p className="text-sm text-fg-muted">Drafts require HR approval. Alternative answers are valid. Approved versions remain in history.</p>{admin && usage.data && <GlassCard className="grid gap-3 p-6 sm:grid-cols-3">{Object.entries(usage.data).map(([k, v]) => <p key={k} className="break-words text-sm"><span className="text-fg-muted">{k.replace(/([A-Z])/g, " $1")}: </span>{v ?? "Unavailable"}</p>)}</GlassCard>}{usage.error && <ApiErrorPanel error={usage.error} onRetry={() => void usage.refetch()} />}<Button onClick={() => { setError(""); void apiRequest("/ai/rubrics/prepare", { method: "POST" }).then(() => rubrics.refetch()).catch(e => setError(e.message)); }}>Prepare eight initial drafts</Button>{error && <p role="alert">{error}</p>}{rubrics.error && <ApiErrorPanel error={rubrics.error} onRetry={() => void rubrics.refetch()} />}{rubrics.isPending && <p>Loading rubrics…</p>}{rubrics.data?.map(q => <Editor key={`${q.id}-${q.rubrics.map(r => `${r.id}-${r.status}-${JSON.stringify(r.content)}`).join()}`} question={q} refresh={() => void rubrics.refetch()} />)}</div>;
}
