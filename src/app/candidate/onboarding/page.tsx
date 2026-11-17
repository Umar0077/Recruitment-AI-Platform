"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CandidateShell } from "@/components/candidate/shell";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/primitives";
import { ApiErrorPanel } from "@/components/api/query-state";
import { apiRequest, ApiError } from "@/lib/api/client";
import { isApiMode } from "@/lib/config/environment";
import { useAuth } from "@/lib/auth/auth-provider";

type Role = { code: string; title: string; description: string | null; track: string };
type Result = { state: "assigned"; interviewId: string; applicationId: string; candidateId: string } | { state: "select_role"; roles: Role[] } | { state: "select_application"; applications: { id: string; title: string; status: string }[] };
export default function OnboardingPage() { return <CandidateShell><Onboarding /></CandidateShell>; }
function Onboarding() {
  const router = useRouter();
  const qc = useQueryClient();
  const auth = useAuth();
  const started = useRef(false);
  const [selection, setSelection] = useState("");
  const [choices, setChoices] = useState<Exclude<Result, { state: "assigned" }> | null>(null);
  const assignment = useMutation({
    mutationFn: async (body: { roleCode?: string; applicationId?: string }) => {
      const { data } = await apiRequest<Result>("/interviews/initial", { method: "POST", body });
      if (!data || !["assigned", "select_role", "select_application"].includes(data.state) || (data.state === "assigned" && !data.interviewId) || (data.state === "select_role" && !Array.isArray(data.roles)) || (data.state === "select_application" && !Array.isArray(data.applications))) throw new ApiError("BAD_RESPONSE", "Interview setup returned an unexpected response. Please retry.", 502);
      return data;
    },
    onSuccess: async result => {
      if (result.state === "assigned") {
        await auth.refresh(true);
        await Promise.all([qc.invalidateQueries({ queryKey: ["portal"] }), qc.invalidateQueries({ queryKey: ["interview", result.interviewId] })]);
        router.replace("/candidate/interview");
      } else setChoices(result);
    },
  });
  const { mutate } = assignment;
  useEffect(() => {
    if (!isApiMode) { router.replace("/candidate/interview"); return; }
    if (auth.status === "signedIn" && auth.profile && !started.current) { started.current = true; mutate({}); }
  }, [auth.status, auth.profile, mutate, router]);
  const applications = choices?.state === "select_application";
  const options = choices?.state === "select_application" ? choices.applications.map(a => ({ id: a.id, title: a.title, description: a.status.replaceAll("_", " "), category: "Existing application" })) : choices?.roles.map(r => ({ id: r.code, title: r.title, description: r.description, category: r.track?.replaceAll("_", " ") }));
  const submitSelection = () => mutate(selection ? applications ? { applicationId: selection } : { roleCode: selection } : {});
  return <GlassCard className="mx-auto max-w-xl p-8">
    <p className="eyebrow">Candidate onboarding</p>
    <h1 className="mt-3 text-3xl font-bold">{applications ? "Choose your application" : "Complete Your Application"}</h1>
    <p className="mt-3 text-fg-muted">{applications ? "You have multiple applications. Select the one you want recruitment to consider for your initial interview." : "Select the position you are applying for. Your interview will use its published HR-approved questions."}</p>
    {assignment.isError && <ApiErrorPanel error={assignment.error} onRetry={submitSelection} />}
    {!options && !assignment.isError && <p className="mt-6" role="status">Preparing your interview…</p>}
    {options && <form className="mt-6 space-y-5" onSubmit={e => { e.preventDefault(); if (selection && !assignment.isPending) submitSelection(); }}>
      <div className="space-y-3" role="group" aria-label="Available positions">{options.map(o => <div key={o.id} className={`rounded-xl border p-5 ${selection === o.id ? "border-brand-cyan bg-brand/10" : "border-subtle"}`}><h2 className="font-semibold">{o.title}</h2><p className="mt-2 text-sm text-fg-muted">{o.description}</p><p className="mt-2 text-xs text-fg-muted">{o.category}</p><Button className="mt-3" type="button" variant="secondary" aria-label={`Select Role: ${o.title}`} aria-pressed={selection === o.id} disabled={assignment.isPending} onClick={() => setSelection(o.id)}>{selection === o.id ? "Selected" : "Select Role"}</Button></div>)}</div>
      {!options.length && <p>No roles are currently available. Please contact recruitment.</p>}
      <Button type="submit" disabled={!selection || assignment.isPending}>{assignment.isPending ? "Preparing Your Interview…" : "Continue to Interview"}</Button>
    </form>}
  </GlassCard>;
}
