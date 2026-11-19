"use client";
/**
 * Shared HR actions: status change, remark, scheduling, shortlist/reject confirmations.
 * All actions update the single demo store, so profile, tables, pipeline,
 * dashboard counts, and analytics stay consistent.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarPlus, MessageSquarePlus, RefreshCw } from "lucide-react";
import type { Candidate, RecruitmentStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/primitives";
import { ConfirmationDialog, Dialog, DialogContent, DialogFooter, Select } from "@/components/ui/overlays";
import { RecruitmentStatusBadge } from "@/components/ui/states";
import { useDemoStore } from "@/lib/demo/store";
import { CLOSED_STATUSES, RECRUITMENT_STATUSES, STATUS_PATH, statusLabel } from "@/lib/demo/statuses";

/** Transitions that skip stages, go backwards, or close a candidate need confirmation. */
export function isConsequential(from: RecruitmentStatus, to: RecruitmentStatus) {
  if (CLOSED_STATUSES.includes(to)) return true;
  const a = STATUS_PATH.indexOf(from);
  const b = STATUS_PATH.indexOf(to);
  if (a < 0 || b < 0) return true;
  return b < a || b - a > 2;
}

/** Interview-dependent stages cannot be reached before the AI interview is completed. */
export function canMoveTo(c: Candidate, to: RecruitmentStatus, interviewCompleted: boolean) {
  if (CLOSED_STATUSES.includes(to)) return true;
  if (STATUS_PATH.indexOf(to) >= STATUS_PATH.indexOf("ai_interview_completed") && !interviewCompleted) return false;
  return to !== c.status;
}

export function useStatusChange() {
  const updateStatus = useDemoStore((s) => s.updateStatus);
  return (c: Candidate, to: RecruitmentStatus, note?: string) => {
    updateStatus(c.id, to, note);
    toast.success(to === "shortlisted" ? "Candidate shortlisted." : to === "not_selected" ? "Candidate marked as not selected." : "Candidate stage updated.", {
      description: `${c.name} → ${statusLabel(to)}`,
    });
  };
}

export function ChangeStatusDialog({ candidate, open, onOpenChange, initial }: { candidate: Candidate; open: boolean; onOpenChange: (o: boolean) => void; initial?: RecruitmentStatus }) {
  const interviewDone = useDemoStore((s) => s.interviews.find((i) => i.id === candidate.interviewId)?.status === "completed");
  const change = useStatusChange();
  const [to, setTo] = useState<RecruitmentStatus>(initial ?? candidate.status);
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const allowed = RECRUITMENT_STATUSES.filter((s) => s.id === candidate.status || canMoveTo(candidate, s.id, interviewDone));
  const apply = () => {
    change(candidate, to, note || undefined);
    setNote("");
    onOpenChange(false);
  };
  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (o) setTo(initial ?? candidate.status); onOpenChange(o); }}>
        <DialogContent title="Update Candidate Status" description={`Move ${candidate.name} to a new recruitment stage. Changes are recorded in the candidate's timeline.`}>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-subtle bg-overlay/[0.02] px-4 py-3 text-sm">
              <span className="text-fg-muted">Current stage</span>
              <RecruitmentStatusBadge status={candidate.status} />
            </div>
            <div>
              <Label>New stage</Label>
              <Select label="New stage" value={to} onValueChange={(v) => setTo(v as RecruitmentStatus)} options={allowed.map((s) => ({ value: s.id, label: s.label }))} />
              {!interviewDone && <p className="mt-1.5 text-xs text-fg-muted">Later stages unlock once the AI interview is completed.</p>}
            </div>
            <div>
              <Label htmlFor="status-note">Note (optional)</Label>
              <Textarea id="status-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for this change…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button disabled={to === candidate.status} onClick={() => (isConsequential(candidate.status, to) ? setConfirm(true) : apply())}>
              <RefreshCw />Update Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmationDialog
        open={confirm}
        onOpenChange={setConfirm}
        tone={CLOSED_STATUSES.includes(to) ? "danger" : "default"}
        title={CLOSED_STATUSES.includes(to) ? `Mark as ${statusLabel(to)}?` : "Confirm non-standard move"}
        description={`${candidate.name} will move from ${statusLabel(candidate.status)} to ${statusLabel(to)}. This ${CLOSED_STATUSES.includes(to) ? "closes the candidate's application" : "skips or reverses workflow stages"}.`}
        confirmLabel="Confirm change"
        onConfirm={apply}
      />
    </>
  );
}

export function AddRemarkDialog({ candidate, open, onOpenChange }: { candidate: Candidate; open: boolean; onOpenChange: (o: boolean) => void }) {
  const addRemark = useDemoStore((s) => s.addRemark);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add HR Remark" description={`Internal note on ${candidate.name}. Remarks are visible to the HR team only — never to candidates.`}>
        <Label htmlFor="remark">Remark</Label>
        <Textarea id="remark" value={text} onChange={(e) => { setText(e.target.value); setError(""); }} placeholder="e.g. Strong objection handling. Confirm night-shift availability in HR interview." className="min-h-[120px]" aria-invalid={!!error} />
        {error && <p className="mt-1.5 text-xs text-red-700 dark:text-red-300" role="alert">{error}</p>}
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => {
              if (!text.trim()) return setError("Write a remark before saving.");
              addRemark(candidate.id, text.trim());
              toast.success("HR remark saved.");
              setText("");
              onOpenChange(false);
            }}
          >
            <MessageSquarePlus />Save Remark
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ScheduleInterviewDialog({ candidate, open, onOpenChange }: { candidate: Candidate; open: boolean; onOpenChange: (o: boolean) => void }) {
  const change = useStatusChange();
  const allTeam = useDemoStore((s) => s.team);
  const team = useMemo(() => allTeam.filter((t) => t.active), [allTeam]);
  const [date, setDate] = useState(() => new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10));
  const [time, setTime] = useState("19:00");
  const [with_, setWith] = useState(team[1]?.id ?? "");
  const interviewDone = useDemoStore((s) => s.interviews.find((i) => i.id === candidate.interviewId)?.status === "completed");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Schedule HR Interview" description="Demo scheduling — no calendar invite or email is sent.">
        {!interviewDone ? (
          <p className="text-sm text-fg-muted">An HR interview can be scheduled once the AI interview is completed.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="hr-date">Date</Label><Input id="hr-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div><Label htmlFor="hr-time">Time</Label><Input id="hr-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
            <div className="sm:col-span-2">
              <Label>Interviewer</Label>
              <Select label="Interviewer" value={with_} onValueChange={setWith} options={team.map((t) => ({ value: t.id, label: `${t.name} — ${t.title}` }))} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!interviewDone || !date || !time}
            onClick={() => {
              const who = team.find((t) => t.id === with_)?.name ?? "HR";
              change(candidate, "hr_interview_scheduled", `${date} at ${time} with ${who}`);
              onOpenChange(false);
            }}
          >
            <CalendarPlus />Schedule Interview
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
