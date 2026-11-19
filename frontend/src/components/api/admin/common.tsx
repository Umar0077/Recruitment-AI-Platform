"use client";
/** Shared building blocks for API-mode admin screens (backend values, existing visual language). */
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Label, Textarea } from "@/components/ui/primitives";
import { Dialog, DialogContent, DialogFooter, Select } from "@/components/ui/overlays";
import { INTERVIEW_STATUS, recruitmentTone, REVIEW_STATUS } from "@/lib/api/labels";
import type { HrReviewStatus, InterviewStatus, RecruitmentStatus } from "@/lib/api/types";
import { RECRUITMENT_STATUSES } from "@/lib/demo/statuses";
import { toUiStatus } from "@/lib/api/labels";
import { useAddRemark, useUpdateStatus } from "@/lib/data/queries";
import { errorText } from "@/components/api/query-state";
import type { ApiMeta } from "@/lib/api/types";

const LABEL = Object.fromEntries(RECRUITMENT_STATUSES.map((s) => [s.id, s.label])) as Record<string, string>;
export const recruitmentLabel = (s: RecruitmentStatus) => LABEL[toUiStatus(s)] ?? s;

export const ApiRecruitmentBadge = ({ status }: { status: RecruitmentStatus }) => <Badge tone={recruitmentTone(status)}>{recruitmentLabel(status)}</Badge>;
export const ApiInterviewBadge = ({ status }: { status: InterviewStatus }) => <Badge tone={INTERVIEW_STATUS[status].tone}>{INTERVIEW_STATUS[status].label}</Badge>;
export const ApiReviewBadge = ({ status }: { status: HrReviewStatus }) => <Badge tone={REVIEW_STATUS[status].tone}>{REVIEW_STATUS[status].label}</Badge>;

export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function Pager({ meta, page, setPage, limit, setLimit, fetching }: { meta?: ApiMeta; page: number; setPage: (p: number) => void; limit: number; setLimit: (n: number) => void; fetching?: boolean }) {
  const totalPages = meta?.totalPages ?? 1;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-subtle px-4 py-3 text-xs text-fg-muted">
      <span aria-live="polite">
        Page {page} of {totalPages} · {meta?.total ?? 0} total{fetching ? " · Updating…" : ""}
      </span>
      <div className="flex items-center gap-2">
        <Select label="Rows per page" size="sm" className="w-28" value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1); }} options={[12, 25, 50].map((n) => ({ value: String(n), label: `${n} / page` }))} />
        <Button variant="secondary" size="icon-sm" onClick={() => setPage(page - 1)} disabled={page <= 1} aria-label="Previous page"><ChevronLeft /></Button>
        <Button variant="secondary" size="icon-sm" onClick={() => setPage(page + 1)} disabled={page >= totalPages} aria-label="Next page"><ChevronRight /></Button>
      </div>
    </div>
  );
}

/** Status change limited to the transitions the backend allows from the current status. */
export function ApiStatusDialog({ applicationId, name, current, allowed, open, onOpenChange, preset }: { applicationId: string; name: string; current: RecruitmentStatus; allowed: RecruitmentStatus[]; open: boolean; onOpenChange: (o: boolean) => void; preset?: RecruitmentStatus }) {
  const m = useUpdateStatus(applicationId);
  const [to, setTo] = useState<string>(preset ?? allowed[0] ?? "");
  const [note, setNote] = useState("");
  useEffect(() => {
    if (open) { setTo(preset ?? allowed[0] ?? ""); setNote(""); m.reset(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const consequential = to === "NOT_SELECTED" || to === "CANDIDATE_WITHDRAWN" || to === "SELECTED" || to === "OFFER_RELEASED";
  return (
    <Dialog open={open} onOpenChange={(o) => !m.isPending && onOpenChange(o)}>
      <DialogContent title="Update recruitment status" description={`${name} · currently ${recruitmentLabel(current)}`} size="sm">
        {allowed.length === 0 ? (
          <p className="text-sm text-fg-muted">No manual changes are allowed from this status.</p>
        ) : (
          <div className="space-y-4">
            <Select label="New status" value={to} onValueChange={setTo} options={allowed.map((s) => ({ value: s, label: recruitmentLabel(s) }))} />
            <div>
              <Label htmlFor="status-note">Note (optional, shown on the timeline)</Label>
              <Textarea id="status-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[80px]" />
            </div>
            {consequential && <p className="rounded-lg border border-amber-400/30 bg-amber-400/[0.08] p-2.5 text-xs text-amber-800 dark:text-amber-100">This is a consequential decision. Please confirm it is correct before saving.</p>}
            {m.isError && <p role="alert" className="text-sm text-red-700 dark:text-red-200">{errorText(m.error)}</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="secondary" disabled={m.isPending} onClick={() => onOpenChange(false)}>Cancel</Button>
          {allowed.length > 0 && (
            <Button
              loading={m.isPending}
              disabled={!to}
              onClick={() =>
                m.mutate(
                  { status: to as RecruitmentStatus, note: note.trim() || undefined },
                  {
                    onSuccess: (r) => {
                      toast.success(`Status updated to ${recruitmentLabel(r.status)}.`);
                      onOpenChange(false);
                    },
                  },
                )
              }
            >
              Save Status
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ApiRemarkDialog({ applicationId, open, onOpenChange }: { applicationId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const m = useAddRemark(applicationId);
  const [body, setBody] = useState("");
  useEffect(() => {
    if (open) m.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={(o) => !m.isPending && onOpenChange(o)}>
      <DialogContent title="Add HR remark" description="Internal note for the recruitment team. Never shown to the candidate." size="sm">
        <Label htmlFor="remark-body">Remark</Label>
        <Textarea id="remark-body" maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[120px]" placeholder="Observations, follow-ups, decisions…" />
        {m.isError && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-200">{errorText(m.error)}</p>}
        <DialogFooter>
          <Button variant="secondary" disabled={m.isPending} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            loading={m.isPending}
            disabled={!body.trim()}
            onClick={() =>
              m.mutate(body.trim(), {
                onSuccess: () => {
                  toast.success("Remark saved.");
                  setBody("");
                  onOpenChange(false);
                },
              })
            }
          >
            Save Remark
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
