"use client";
import { isApiMode } from "@/lib/config/environment";
import { ApiSettings } from "@/components/api/admin/management";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Building2, FlaskConical, Lock, Palette, RotateCcw, Save, Settings2, SlidersHorizontal, Sun, Users } from "lucide-react";
import { toast } from "sonner";
import type { PlatformSettings, RecruitmentStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { GlassCard, CardHeader, Input, Switch, Textarea, Badge } from "@/components/ui/primitives";
import { ConfirmationDialog, Notice, Select } from "@/components/ui/overlays";
import { PageHeader } from "@/components/ui/states";
import { BrandMark } from "@/components/ui/brand";
import { ThemeSegmented } from "@/components/ui/theme-toggle";
import { useDemoStore } from "@/lib/demo/store";
import { FEATURED } from "@/lib/demo/seed";
import { RECRUITMENT_STATUSES } from "@/lib/demo/statuses";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "general", label: "General", icon: Settings2 },
  { id: "branding", label: "Branding", icon: Palette },
  { id: "interview", label: "Interview Preferences", icon: SlidersHorizontal },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "privacy", label: "Privacy Information", icon: Lock },
  { id: "team", label: "Team Defaults", icon: Users },
  { id: "appearance", label: "Appearance", icon: Sun },
  { id: "demo", label: "Demo Controls", icon: FlaskConical },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 border-t border-subtle py-5 first:border-t-0 first:pt-0 xl:grid-cols-[220px_1fr] xl:gap-8">
      <div><p className="text-sm font-medium text-fg">{label}</p>{hint && <p className="mt-0.5 text-xs text-fg-muted">{hint}</p>}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-6 border-t border-subtle py-4 first:border-t-0 first:pt-0">
      <span><span className="block text-sm font-medium text-fg">{label}</span>{hint && <span className="mt-0.5 block text-xs text-fg-muted">{hint}</span>}</span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}

function DemoSettingsPage() {
  const router = useRouter();
  const settings = useDemoStore((s) => s.settings);
  const updateSettings = useDemoStore((s) => s.updateSettings);
  const team = useDemoStore((s) => s.team);
  const [section, setSection] = useState<SectionId>("general");
  const [draft, setDraft] = useState<PlatformSettings>(settings);
  useEffect(() => setDraft(settings), [settings]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const set = <K extends keyof PlatformSettings>(k: K, v: PlatformSettings[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const save = () => { updateSettings(draft); toast.success("Changes saved.", { description: "Stored in this browser for the demo." }); };

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#demo") setSection("demo");
  }, []);

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Platform preferences for this workspace. Values are demo defaults stored locally in your browser."
        actions={section !== "demo" && (
          <>
            {dirty && <Badge tone="warning">Unsaved changes</Badge>}
            <Button variant="ghost" disabled={!dirty} onClick={() => { setDraft(settings); toast.info("Changes discarded."); }}>Cancel</Button>
            <Button disabled={!dirty} onClick={save}><Save />Save Changes</Button>
          </>
        )}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr] [&>*]:min-w-0">
        <nav aria-label="Settings sections" className="lg:sticky lg:top-24 lg:self-start">
          <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {SECTIONS.map((s) => (
              <li key={s.id} className="shrink-0">
                <button
                  onClick={() => setSection(s.id)}
                  aria-current={section === s.id ? "page" : undefined}
                  className={cn("flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-colors", section === s.id ? "bg-overlay/[0.06] font-medium text-fg" : "text-fg-muted hover:bg-overlay/[0.03] hover:text-fg")}
                >
                  <s.icon className={cn("size-4", section === s.id ? "text-brand-cyan" : "")} aria-hidden />{s.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <GlassCard className="p-6 sm:p-7">
          {section === "general" && (
            <>
              <CardHeader title="General" description="Organisation details and regional formats" icon={<Building2 />} />
              <div className="mt-7">
                <Row label="Platform name" hint="Provisional — configured centrally in code"><Input value={draft.platformName} onChange={(e) => set("platformName", e.target.value)} /></Row>
                <Row label="Organization name"><Input value={draft.organizationName} onChange={(e) => set("organizationName", e.target.value)} /></Row>
                <Row label="Support email" hint="Placeholder address shown to candidates"><Input type="email" value={draft.supportEmail} onChange={(e) => set("supportEmail", e.target.value)} /></Row>
                <Row label="Timezone"><Select label="Timezone" value={draft.timezone} onValueChange={(v) => set("timezone", v)} options={["Asia/Karachi", "UTC", "America/New_York", "America/Chicago", "Europe/London"].map((t) => ({ value: t, label: t }))} /></Row>
                <Row label="Date format"><Select label="Date format" value={draft.dateFormat} onValueChange={(v) => set("dateFormat", v)} options={["MMM d, yyyy", "dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd"].map((t) => ({ value: t, label: t }))} /></Row>
                <Row label="Default interview" hint="Configuration used for new invitations"><Button variant="secondary" asChild><Link href="/admin/interview-setup">Open Interview Setup</Link></Button></Row>
              </div>
            </>
          )}

          {section === "branding" && (
            <>
              <CardHeader title="Branding" description="Candidate-facing identity. The app uses centralised design tokens." icon={<Palette />} />
              <div className="mt-7">
                <Row label="Logo preview">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="grid size-20 place-items-center rounded-2xl border border-subtle bg-ink-950"><BrandMark className="size-12" /></div>
                    <div className="grid size-20 place-items-center rounded-2xl border border-subtle bg-white"><BrandMark className="size-12" /></div>
                    <p className="max-w-xs text-xs text-fg-muted">Brand assets are replaced in code (BRAND config) for this phase. Upload is planned for the functional phase.</p>
                  </div>
                </Row>
                <Row label="Brand name"><Input value={draft.platformName} onChange={(e) => set("platformName", e.target.value)} /></Row>
                <Row label="Primary color">
                  <div className="flex items-center gap-3"><input type="color" value={draft.primaryColor} onChange={(e) => set("primaryColor", e.target.value)} className="h-10 w-14 cursor-pointer rounded-lg border border-subtle bg-transparent" aria-label="Primary color" /><Input value={draft.primaryColor} onChange={(e) => set("primaryColor", e.target.value)} className="w-32 font-mono" aria-label="Primary color hex" /></div>
                </Row>
                <Row label="Accent color">
                  <div className="flex items-center gap-3"><input type="color" value={draft.accentColor} onChange={(e) => set("accentColor", e.target.value)} className="h-10 w-14 cursor-pointer rounded-lg border border-subtle bg-transparent" aria-label="Accent color" /><Input value={draft.accentColor} onChange={(e) => set("accentColor", e.target.value)} className="w-32 font-mono" aria-label="Accent color hex" /></div>
                </Row>
                <Row label="Interview welcome text" hint="Shown on the candidate welcome screen"><Textarea value={draft.welcomeText} onChange={(e) => set("welcomeText", e.target.value)} /></Row>
                <Row label="Candidate-facing organization label"><Input value={draft.orgLabel} onChange={(e) => set("orgLabel", e.target.value)} /></Row>
              </div>
            </>
          )}

          {section === "interview" && (
            <>
              <CardHeader title="Interview Preferences" description="Workspace-wide interview behaviour" icon={<SlidersHorizontal />} />
              <div className="mt-7">
                <ToggleRow label="Candidate reminders" hint="Remind candidates before their invitation expires" checked={draft.candidateReminders} onChange={(v) => set("candidateReminders", v)} />
                <Row label="Per-role configuration" hint="Questions, timing, and requirements"><Button variant="secondary" asChild><Link href="/admin/interview-setup">Manage question sets</Link></Button></Row>
              </div>
            </>
          )}

          {section === "notifications" && (
            <>
              <CardHeader title="Notifications" description="In-app notification preferences (no emails are sent in the demo)" icon={<Bell />} />
              <div className="mt-7">
                <ToggleRow label="Interview completed" hint="When a candidate submits an interview" checked={draft.notifyOnCompletion} onChange={(v) => set("notifyOnCompletion", v)} />
                <ToggleRow label="Assessment ready" hint="When an AI assessment is ready for review" checked={draft.notifyOnAssessment} onChange={(v) => set("notifyOnAssessment", v)} />
                <ToggleRow label="Daily digest" hint="A summary of pending reviews each morning" checked={draft.dailyDigest} onChange={(v) => set("dailyDigest", v)} />
              </div>
            </>
          )}

          {section === "privacy" && (
            <>
              <CardHeader title="Privacy Information" description="Candidate-facing privacy text" icon={<Lock />} />
              <div className="mt-7">
                <Row label="Recording use statement" hint="Shown on the consent screen"><Textarea className="min-h-[120px]" value={draft.privacyText} onChange={(e) => set("privacyText", e.target.value)} /></Row>
                <Row label="Privacy notice"><Notice tone="warning">Link to the approved privacy notice once available. No retention period or compliance claims are shown until confirmed.</Notice></Row>
              </div>
            </>
          )}

          {section === "team" && (
            <>
              <CardHeader title="Team Defaults" description="Default assignments for new interviews" icon={<Users />} />
              <div className="mt-7">
                <Row label="Default reviewer"><Select label="Default reviewer" value={draft.defaultReviewer} onValueChange={(v) => set("defaultReviewer", v)} options={team.filter((t) => t.active).map((t) => ({ value: t.id, label: `${t.name} — ${t.title}` }))} /></Row>
                <Row label="Team members"><Button variant="secondary" asChild><Link href="/admin/team">Manage HR team</Link></Button></Row>
              </div>
            </>
          )}

          {section === "appearance" && (
            <>
              <CardHeader title="Appearance" description="Display preferences for this browser" icon={<Sun />} />
              <div className="mt-7">
                <Row label="Theme" hint="Saved in this browser. System follows your device setting."><ThemeSegmented /></Row>
                <ToggleRow label="Reduce motion" hint="Minimise animations across the platform" checked={draft.reduceMotion} onChange={(v) => set("reduceMotion", v)} />
                <ToggleRow label="Compact tables" hint="Tighter row spacing in data tables" checked={draft.compactTables} onChange={(v) => set("compactTables", v)} />
              </div>
            </>
          )}

          {section === "demo" && <DemoControls onNavigate={(href) => router.push(href)} />}
        </GlassCard>
      </div>
    </div>
  );
}

function DemoControls({ onNavigate }: { onNavigate: (href: string) => void }) {
  const candidates = useDemoStore((s) => s.candidates);
  const interviews = useDemoStore((s) => s.interviews);
  const flow = useDemoStore((s) => s.flow);
  // Actions only — read without subscribing so this panel does not re-render on every store change.
  const s = useDemoStore.getState();
  const [confirmReset, setConfirmReset] = useState(false);
  const pending = candidates.filter((c) => c.status === "ai_interview_pending" || c.status === "ai_interview_in_progress");
  const completed = interviews.filter((i) => i.status === "completed");
  const [simId, setSimId] = useState(pending[0]?.id ?? "");
  const [reportId, setReportId] = useState(completed[0]?.id ?? "");
  const [moveId, setMoveId] = useState(candidates[0]?.id ?? "");
  const [moveTo, setMoveTo] = useState<RecruitmentStatus>("shortlisted");
  const nameOf = (id: string) => candidates.find((c) => c.id === id)?.name ?? id;

  return (
    <>
      <CardHeader title="Demo Controls" description="Presentation helpers. Everything here changes local demo data only." icon={<FlaskConical />} />
      <div className="mt-7">
        <Row label="Reset demo data" hint="Restore the original fictional dataset">
          <Button variant="danger" onClick={() => setConfirmReset(true)}><RotateCcw />Reset Demo</Button>
        </Row>
        <Row label="Candidate-mode demo profile" hint="Which candidate the candidate experience signs in as">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select label="Demo candidate" className="sm:w-80" value={flow.candidateId} onValueChange={(v) => { s.selectDemoCandidate(v); toast.success("Demo candidate selected."); }} options={[{ value: FEATURED.fresher, label: "Ayesha Malik — CSR Fresher" }, { value: FEATURED.experienced, label: "Omar Siddiqui — Experienced FE Closer" }]} />
            <Button variant="secondary" onClick={() => { s.startSession("candidate", "demo.candidate@example.com"); onNavigate("/candidate/interview"); }}>Return to Candidate Mode</Button>
          </div>
        </Row>
        <Row label="Simulate interview completion" hint="Submits a pending interview and generates its assessment">
          {pending.length === 0 ? <p className="text-sm text-fg-muted">No pending interviews left.</p> : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select label="Candidate" className="sm:w-80" value={simId} onValueChange={setSimId} options={pending.map((c) => ({ value: c.id, label: `${c.name} (${c.id})` }))} />
              <Button onClick={() => { s.completeInterviewFor(simId); toast.success("Interview completion simulated.", { description: `${nameOf(simId)} is now awaiting review.` }); setSimId(pending.find((c) => c.id !== simId)?.id ?? ""); }}>Simulate</Button>
            </div>
          )}
        </Row>
        <Row label="Open an assessment report">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select label="Assessment" className="sm:w-80" value={reportId} onValueChange={setReportId} options={completed.slice(0, 40).map((i) => ({ value: i.id, label: `${nameOf(i.candidateId)} — ${i.id}` }))} />
            <Button variant="secondary" onClick={() => onNavigate(`/admin/assessments/${reportId}`)}>Open Report</Button>
          </div>
        </Row>
        <Row label="Move a candidate to a new stage" hint="Bypasses workflow checks — for presentations">
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Select label="Candidate" value={moveId} onValueChange={setMoveId} options={candidates.map((c) => ({ value: c.id, label: `${c.name} (${c.id})` }))} />
            <Select label="Stage" value={moveTo} onValueChange={(v) => setMoveTo(v as RecruitmentStatus)} options={RECRUITMENT_STATUSES.map((x) => ({ value: x.id, label: x.label }))} />
            <Button onClick={() => { s.updateStatus(moveId, moveTo, "Demo control"); toast.success("Candidate stage updated."); }}>Move</Button>
          </div>
        </Row>
        <Row label="Trigger a notification">
          <Button variant="secondary" onClick={() => { const c = completed[0]; s.pushNotification({ kind: "assessment_ready", title: "Assessment ready for review", body: `The AI assessment for ${nameOf(c?.candidateId ?? "")} is ready.`, href: `/admin/assessments/${c?.id}` }); toast.info("Demo notification sent to the bell icon."); }}><Bell />Trigger Notification</Button>
        </Row>
        <Row label="Preview an incomplete interview" hint="Candidate view with 2 of 4 questions answered">
          <Button variant="secondary" onClick={() => {
            const cand = candidates.find((c) => c.id === flow.candidateId);
            if (interviews.find((i) => i.id === cand?.interviewId)?.status === "completed") {
              toast.warning("This demo candidate has already submitted.", { description: "Reset demo data or pick the other demo candidate first." });
              return;
            }
            s.selectDemoCandidate(flow.candidateId);
            s.updateFlow({ consent: true, equipmentChecked: true, practiceDone: true });
            s.recordAnswer(); s.recordAnswer();
            s.interruptInterview();
            s.startSession("candidate", "demo.candidate@example.com");
            onNavigate("/candidate/interview/resume");
          }}>Open Resume Screen</Button>
        </Row>
        <Row label="Error state previews">
          <div className="flex flex-wrap gap-2">
            {[["expired", "Invitation expired"], ["session", "Session unavailable"], ["connection", "Connection problem"], ["service", "Demo service unavailable"]].map(([k, l]) => (
              <Button key={k} variant="ghost" size="sm" asChild><Link href={`/candidate/interview/unavailable?reason=${k}`}>{l}</Link></Button>
            ))}
            <Button variant="ghost" size="sm" asChild><Link href="/this-page-does-not-exist">404 page</Link></Button>
          </div>
        </Row>
      </div>
      <ConfirmationDialog open={confirmReset} onOpenChange={setConfirmReset} title="Reset demo data?" description="All demo changes will be restored to the original fictional dataset. Your demo sign-in is kept." confirmLabel="Reset Demo Data" onConfirm={() => { s.resetDemo(); toast.success("Demo data reset."); }} />
    </>
  );
}

/** API mode renders the PostgreSQL-backed screen; demo mode keeps the original demo screen unchanged. */
export default function SettingsPage() {
  return isApiMode ? <ApiSettings /> : <DemoSettingsPage />;
}
