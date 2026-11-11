"use client";
import { isApiMode } from "@/lib/config/environment";
import { ApiPipeline } from "@/components/api/admin/pipeline";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, LayoutGroup } from "motion/react";
import { Clock, GripVertical, MoreHorizontal, RefreshCw, Sparkles, UserRound, Video, ArrowRightLeft, Inbox } from "lucide-react";
import { toast } from "sonner";
import type { Candidate, RecruitmentStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { CandidateAvatar, Pill, SearchInput } from "@/components/ui/primitives";
import { ConfirmationDialog, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, Select, Tabs, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { PageHeader, RecruitmentStatusBadge } from "@/components/ui/states";
import { ChangeStatusDialog, canMoveTo, isConsequential, useStatusChange } from "@/components/admin/candidate-actions";
import { useDemoStore } from "@/lib/demo/store";
import { buildAssessment } from "@/lib/demo/assessments";
import { CLOSED_COLUMNS, PIPELINE_COLUMNS, PRE_COLUMN, statusLabel, type PipelineColumn } from "@/lib/demo/statuses";
import { JOB_ROLES } from "@/lib/demo/questions";
import { roleShort } from "@/lib/demo/selectors";
import { cn, daysBetween, timeAgo } from "@/lib/utils";

const VIEWS = { active: PIPELINE_COLUMNS, pre: [PRE_COLUMN], closed: CLOSED_COLUMNS } as const;

function KanbanCard({ c, score, onMove, onDragStart, dragging }: { c: Candidate; score?: number; onMove: (c: Candidate) => void; onDragStart: (id: string) => void; dragging: boolean }) {
  const router = useRouter();
  return (
    <motion.div layout="position" layoutId={c.id} transition={{ type: "spring", stiffness: 420, damping: 36 }}>
    <article
      draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", c.id); e.dataTransfer.effectAllowed = "move"; onDragStart(c.id); }}
      onClick={() => router.push(`/admin/candidates/${c.id}`)}
      className={cn(
        "group relative cursor-grab rounded-xl border border-subtle card-surface p-3.5 shadow-glass transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-glow/60 hover:shadow-glow-sm active:cursor-grabbing",
        dragging && "opacity-40",
      )}
      aria-label={`${c.name}, ${statusLabel(c.status)}`}
    >
      <div className="flex items-start gap-2.5">
        <CandidateAvatar name={c.name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">{c.name}</p>
          <p className="font-mono text-[11px] text-fg-muted">{c.id}</p>
        </div>
        <GripVertical className="size-4 shrink-0 text-fg-disabled opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="-mr-1.5 -mt-1 size-7" aria-label={`Quick actions for ${c.name}`}><MoreHorizontal /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>{c.name}</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => router.push(`/admin/candidates/${c.id}`)}><UserRound />View profile</DropdownMenuItem>
              {c.interviewId && <DropdownMenuItem onSelect={() => router.push(`/admin/interviews/${c.interviewId}`)}><Video />View interview</DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onMove(c)}><RefreshCw />Move to stage…</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Pill className="h-5 text-[11px]">{roleShort(c)}</Pill>
        {score !== undefined && (
          <span className="inline-flex h-5 items-center gap-1 rounded-md border border-blue-400/20 bg-blue-500/10 px-1.5 text-[11px] text-blue-700 dark:text-blue-200" title="Illustrative AI assessment score (decision support only)">
            <Sparkles className="size-3" aria-hidden />{score.toFixed(1)}
          </span>
        )}
      </div>
      <p className="mt-2.5 truncate text-[11px] text-fg-secondary">{statusLabel(c.status)}</p>
      <div className="mt-2 flex items-center justify-between text-[11px] text-fg-muted">
        <span className="flex items-center gap-1"><Clock className="size-3" aria-hidden />{daysBetween(c.stageEnteredAt)}d in stage</span>
        <span>{timeAgo(c.lastUpdated)}</span>
      </div>
    </article>
    </motion.div>
  );
}

function DemoPipelinePage() {
  const candidates = useDemoStore((s) => s.candidates);
  const interviews = useDemoStore((s) => s.interviews);
  const change = useStatusChange();
  const [view, setView] = useState<keyof typeof VIEWS>("active");
  const [role, setRole] = useState("all");
  const [q, setQ] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [pending, setPending] = useState<{ c: Candidate; to: RecruitmentStatus } | null>(null);
  const [moveFor, setMoveFor] = useState<Candidate | null>(null);

  const ivMap = useMemo(() => new Map(interviews.map((i) => [i.id, i])), [interviews]);
  const scores = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of candidates) {
      const iv = c.interviewId ? ivMap.get(c.interviewId) : undefined;
      const r = iv ? buildAssessment(c, iv) : null;
      if (r) m.set(c.id, r.overall);
    }
    return m;
  }, [candidates, ivMap]);

  const visible = candidates.filter((c) => (role === "all" || c.roleId === role) && (!q || c.name.toLowerCase().includes(q.toLowerCase()) || c.id.toLowerCase().includes(q.toLowerCase())));
  const columns = VIEWS[view] as readonly PipelineColumn[];

  const attemptMove = (c: Candidate, col: PipelineColumn) => {
    if (col.statuses.includes(c.status)) return;
    const to = col.statuses[0]!;
    const done = c.interviewId ? ivMap.get(c.interviewId)?.status === "completed" : false;
    if (!canMoveTo(c, to, done)) {
      toast.error("Unable to complete this action.", { description: "This stage requires a completed AI interview." });
      return;
    }
    if (isConsequential(c.status, to)) setPending({ c, to });
    else change(c, to);
  };

  const counts = { active: candidates.filter((c) => PIPELINE_COLUMNS.some((col) => col.statuses.includes(c.status))).length, pre: candidates.filter((c) => PRE_COLUMN.statuses.includes(c.status)).length, closed: candidates.filter((c) => c.status === "not_selected" || c.status === "withdrawn").length };

  return (
    <div>
      <PageHeader title="Recruitment Pipeline" description="Track every candidate from interview completion through final hiring." />
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between [&>*]:min-w-0">
        <Tabs value={view} onValueChange={(v) => setView(v as keyof typeof VIEWS)}>
          <TabsList className="border-b-0">
            <TabsTrigger value="active">Active pipeline<span className="rounded-full bg-overlay/[0.08] px-1.5 text-[11px]">{counts.active}</span></TabsTrigger>
            <TabsTrigger value="pre">Awaiting interview<span className="rounded-full bg-overlay/[0.08] px-1.5 text-[11px]">{counts.pre}</span></TabsTrigger>
            <TabsTrigger value="closed">Not selected / Withdrawn<span className="rounded-full bg-overlay/[0.08] px-1.5 text-[11px]">{counts.closed}</span></TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-col gap-2 sm:flex-row">
          <SearchInput className="sm:w-60" placeholder="Search pipeline…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search pipeline" />
          <Select label="Role" className="sm:w-44" value={role} onValueChange={setRole} options={[{ value: "all", label: "All roles" }, ...JOB_ROLES.map((r) => ({ value: r.id, label: r.shortTitle }))]} />
        </div>
      </div>
      <p className="mb-3 flex items-center gap-2 text-xs text-fg-muted"><ArrowRightLeft className="size-3.5" aria-hidden />Drag cards between stages, or use the card menu to move a candidate with the keyboard.</p>

      <LayoutGroup>
        <div className="relative -mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className={cn("flex gap-3", view !== "active" && "max-w-3xl")}>
            {columns.map((col) => {
              const items = visible.filter((c) => col.statuses.includes(c.status)).sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated));
              const isOver = overCol === col.id && dragId;
              return (
                <section
                  key={col.id}
                  aria-label={`${col.label}, ${items.length} candidates`}
                  onDragOver={(e) => { e.preventDefault(); setOverCol(col.id); }}
                  onDragLeave={() => setOverCol((o) => (o === col.id ? null : o))}
                  onDrop={(e) => {
                    e.preventDefault();
                    const c = candidates.find((x) => x.id === (e.dataTransfer.getData("text/plain") || dragId));
                    setDragId(null);
                    setOverCol(null);
                    if (c) attemptMove(c, col);
                  }}
                  className={cn("flex w-[272px] shrink-0 flex-col rounded-xl border bg-overlay/[0.02] transition-colors duration-200", isOver ? "border-brand-cyan/50 bg-brand/[0.07]" : "border-subtle")}
                >
                  <header className="flex items-center justify-between gap-2 px-3.5 pb-2 pt-3.5">
                    <div className="min-w-0">
                      <h2 className="flex items-center gap-2 text-sm font-semibold">{col.label}<span className="rounded-full bg-overlay/[0.07] px-2 py-0.5 text-[11px] font-medium tabular-nums text-fg-secondary">{items.length}</span></h2>
                      <p className="mt-0.5 truncate text-[11px] text-fg-muted">{col.hint}</p>
                    </div>
                  </header>
                  <div className="flex min-h-[160px] flex-1 flex-col gap-2 overflow-y-auto p-2.5 lg:max-h-[calc(100dvh-330px)]" onDragEnd={() => { setDragId(null); setOverCol(null); }}>
                    {items.length === 0 ? (
                      <div className="grid flex-1 place-items-center rounded-lg border border-dashed border-subtle py-8 text-center text-xs text-fg-disabled">
                        <span className="flex flex-col items-center gap-2"><Inbox className="size-4" aria-hidden />No candidates</span>
                      </div>
                    ) : (
                      items.map((c) => <KanbanCard key={c.id} c={c} score={scores.get(c.id)} dragging={dragId === c.id} onDragStart={setDragId} onMove={setMoveFor} />)
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </LayoutGroup>

      <ConfirmationDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        tone={pending && (pending.to === "not_selected" || pending.to === "withdrawn") ? "danger" : "default"}
        title="Confirm stage change"
        description={pending ? `Move ${pending.c.name} from ${statusLabel(pending.c.status)} to ${statusLabel(pending.to)}? This skips or reverses standard workflow stages.` : ""}
        confirmLabel="Move Candidate"
        onConfirm={() => pending && change(pending.c, pending.to)}
      >
        {pending && <div className="flex items-center gap-2 text-sm"><RecruitmentStatusBadge status={pending.c.status} /><span className="text-fg-muted">→</span><RecruitmentStatusBadge status={pending.to} /></div>}
      </ConfirmationDialog>
      {moveFor && <MoveMenuDialog c={moveFor} onClose={() => setMoveFor(null)} />}
    </div>
  );
}

/** Keyboard / touch alternative to drag-and-drop: the full status dialog. */
function MoveMenuDialog({ c, onClose }: { c: Candidate; onClose: () => void }) {
  return <ChangeStatusDialog candidate={c} open onOpenChange={(o) => !o && onClose()} />;
}

/** API mode renders the PostgreSQL-backed screen; demo mode keeps the original demo screen unchanged. */
export default function PipelinePage() {
  return isApiMode ? <ApiPipeline /> : <DemoPipelinePage />;
}
