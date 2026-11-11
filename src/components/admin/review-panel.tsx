"use client";
/** HR review controls shared by the interview review workspace and the assessment report. */
import Link from "next/link";
import { useState } from "react";
import { BadgeCheck, Flag, KanbanSquare, MessageSquarePlus, Star, UserX } from "lucide-react";
import { toast } from "sonner";
import type { Candidate, InterviewSession } from "@/types";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/primitives";
import { ConfirmationDialog } from "@/components/ui/overlays";
import { RecruitmentStatusBadge, ReviewStatusBadge } from "@/components/ui/states";
import { useStatusChange } from "./candidate-actions";
import { useDemoStore } from "@/lib/demo/store";
import { STATUS_PATH } from "@/lib/demo/statuses";
import { formatDateTime } from "@/lib/utils";

export function ReviewPanel({ candidate, interview, compact }: { candidate: Candidate; interview: InterviewSession; compact?: boolean }) {
  const team = useDemoStore((s) => s.team);
  const setReview = useDemoStore((s) => s.setReview);
  const addRemark = useDemoStore((s) => s.addRemark);
  const change = useStatusChange();
  const [remark, setRemark] = useState("");
  const [confirm, setConfirm] = useState<"shortlist" | "reject" | null>(null);
  const reviewer = team.find((t) => t.id === interview.reviewerId);
  const idx = STATUS_PATH.indexOf(candidate.status);
  const canShortlist = idx >= 0 && idx < STATUS_PATH.indexOf("shortlisted") && interview.status === "completed";
  const closed = candidate.status === "not_selected" || candidate.status === "withdrawn";

  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div><dt className="text-xs text-fg-muted">Review status</dt><dd className="mt-1.5"><ReviewStatusBadge review={interview.reviewStatus} /></dd></div>
        <div><dt className="text-xs text-fg-muted">Recruitment stage</dt><dd className="mt-1.5"><RecruitmentStatusBadge status={candidate.status} /></dd></div>
        <div><dt className="text-xs text-fg-muted">Reviewer</dt><dd className="mt-1 text-fg">{reviewer?.name ?? "Unassigned"}</dd></div>
        <div><dt className="text-xs text-fg-muted">Review date</dt><dd className="mt-1 text-fg">{formatDateTime(interview.reviewedAt)}</dd></div>
      </dl>

      <div>
        <Label htmlFor={`remark-${interview.id}`}>HR remarks</Label>
        <Textarea id={`remark-${interview.id}`} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Add an internal remark about this interview…" className={compact ? "min-h-[80px]" : undefined} />
        <Button
          size="sm"
          variant="secondary"
          className="mt-2"
          disabled={!remark.trim()}
          onClick={() => { addRemark(candidate.id, remark.trim()); setRemark(""); toast.success("HR remark saved."); }}
        >
          <MessageSquarePlus />Save Remark
        </Button>
      </div>

      <div className="grid gap-2">
        <Button disabled={!canShortlist} onClick={() => setConfirm("shortlist")}><Star />Shortlist Candidate</Button>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            disabled={interview.status !== "completed" || interview.reviewStatus === "reviewed"}
            onClick={() => { setReview(interview.id, "reviewed"); toast.success("Interview marked as reviewed."); }}
          >
            <BadgeCheck />Mark Reviewed
          </Button>
          <Button
            variant="secondary"
            disabled={interview.status !== "completed" || interview.reviewStatus === "follow_up"}
            onClick={() => { setReview(interview.id, "follow_up"); toast.info("Marked for follow-up / further review."); }}
          >
            <Flag />Follow-up
          </Button>
        </div>
        <Button variant="danger" disabled={closed || interview.status !== "completed"} onClick={() => setConfirm("reject")}><UserX />Not Selected</Button>
        <Button variant="ghost" asChild><Link href="/admin/pipeline"><KanbanSquare />Open Recruitment Pipeline</Link></Button>
      </div>
      <p className="text-xs leading-relaxed text-fg-muted">AI output is decision support only. Hiring decisions are made and recorded by HR.</p>

      <ConfirmationDialog
        open={confirm === "shortlist"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Shortlist this candidate?"
        description={`${candidate.name} will move to Shortlisted. The candidate profile, pipeline, and dashboard will update.`}
        confirmLabel="Shortlist Candidate"
        onConfirm={() => change(candidate, "shortlisted", "Shortlisted after interview review")}
      />
      <ConfirmationDialog
        open={confirm === "reject"}
        onOpenChange={(o) => !o && setConfirm(null)}
        tone="danger"
        title="Mark as not selected?"
        description={`${candidate.name}'s application will be closed as Not Selected. You can reopen it later from the candidate profile if needed.`}
        confirmLabel="Confirm Not Selected"
        onConfirm={() => change(candidate, "not_selected", "Closed after interview review")}
      />
    </div>
  );
}
