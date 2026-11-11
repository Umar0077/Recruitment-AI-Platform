"use client";
/**
 * API mode Kanban. Column counts come from GET /recruitment/pipeline (exact totals); cards are the 100 most
 * recently updated matching applications. Every move is validated by the backend before the card moves.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Clock, GripVertical, Inbox, MoreHorizontal, RefreshCw, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CandidateAvatar, Pill, SearchInput } from "@/components/ui/primitives";
import { ConfirmationDialog, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, Select, Tabs, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { PageHeader } from "@/components/ui/states";
import { ApiErrorPanel, errorText } from "@/components/api/query-state";
import { ApiRecruitmentBadge, ApiStatusDialog, recruitmentLabel, useDebounced } from "./common";
import { useApplication, useApplications, useJobRoles, useMoveApplication, usePipelineCounts } from "@/lib/data/queries";
import { CLOSED_COLUMNS, PIPELINE_COLUMNS, PRE_COLUMN, type PipelineColumn } from "@/lib/demo/statuses";
import { fromUiStatus, toUiStatus } from "@/lib/api/labels";
import type { ApplicationSummary, RecruitmentStatus } from "@/lib/api/types";
import { cn, daysBetween, timeAgo } from "@/lib/utils";

const VIEWS = { active: PIPELINE_COLUMNS, pre: [PRE_COLUMN], closed: CLOSED_COLUMNS } as const;
const CARD_LIMIT = 100;
const consequential = (to: RecruitmentStatus) => ["NOT_SELECTED", "CANDIDATE_WITHDRAWN", "SELECTED", "OFFER_RELEASED", "JOINED"].includes(to);

function Card({ a, dragging, onDragStart, onMove }: { a: ApplicationSummary; dragging: boolean; onDragStart: (id: string) => void; onMove: (a: ApplicationSummary) => void }) {
  const router = useRouter();
  return (
    <article
      draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", a.id); e.dataTransfer.effectAllowed = "move"; onDragStart(a.id); }}
      onClick={() => router.push(`/admin/candidates/${a.id}`)}
      className={cn("group relative cursor-grab rounded-xl border border-subtle card-surface p-3.5 shadow-glass transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-glow/60 hover:shadow-glow-sm active:cursor-grabbing", dragging && "opacity-40")}
      aria-label={`${a.candidate.fullName}, ${a.statusLabel}`}
    >
      <div className="flex items-start gap-2.5">
        <CandidateAvatar name={a.candidate.fullName} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">{a.candidate.fullName}</p>
          <p className="truncate text-[11px] text-fg-muted">{a.candidate.email ?? "—"}</p>
        </div>
        <GripVertical className="size-4 shrink-0 text-fg-disabled opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="-mr-1.5 -mt-1 size-7" aria-label={`Quick actions for ${a.candidate.fullName}`}><MoreHorizontal /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>{a.candidate.fullName}</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => router.push(`/admin/candidates/${a.id}`)}><UserRound />View profile</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onMove(a)}><RefreshCw />Move to stage…</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5"><Pill className="h-5 max-w-full truncate text-[11px]">{a.jobRole.title}</Pill></div>
      <p className="mt-2.5 truncate text-[11px] text-fg-secondary">{a.statusLabel}</p>
      <div className="mt-2 flex items-center justify-between text-[11px] text-fg-muted">
        <span className="flex items-center gap-1"><Clock className="size-3" aria-hidden />{daysBetween(a.statusChangedAt)}d in stage</span>
        <span>{timeAgo(a.statusChangedAt)}</span>
      </div>
    </article>
  );
}

/** Loads the application to know which transitions the backend allows, then shows the status dialog. */
function MoveDialog({ a, onClose }: { a: ApplicationSummary; onClose: () => void }) {
  const detail = useApplication(a.id);
  if (!detail.data) return null;
  return <ApiStatusDialog applicationId={a.id} name={a.candidate.fullName} current={detail.data.status} allowed={detail.data.allowedTransitions} open onOpenChange={(o) => !o && onClose()} />;
}

export function ApiPipeline() {
  const [view, setView] = useState<keyof typeof VIEWS>("active");
  const [role, setRole] = useState("all");
  const [search, setSearch] = useState("");
  const term = useDebounced(search.trim());
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [pending, setPending] = useState<{ a: ApplicationSummary; to: RecruitmentStatus } | null>(null);
  const [moveFor, setMoveFor] = useState<ApplicationSummary | null>(null);
  const roles = useJobRoles();
  const counts = usePipelineCounts();
  const list = useApplications({ limit: CARD_LIMIT, sortBy: "statusChangedAt", sortDir: "desc", search: term || undefined, jobRoleId: role === "all" ? undefined : role });
  const move = useMoveApplication();
  const apps = list.data?.items ?? [];
  const columns = VIEWS[view] as readonly PipelineColumn[];
  const countOf = (col: PipelineColumn) => (counts.data?.stages ?? []).filter((s) => col.statuses.includes(toUiStatus(s.status))).reduce((n, s) => n + s.count, 0);
  const viewCount = (v: keyof typeof VIEWS) => (VIEWS[v] as readonly PipelineColumn[]).reduce((n, c) => n + countOf(c), 0);

  const doMove = (a: ApplicationSummary, to: RecruitmentStatus) =>
    move.mutate(
      { applicationId: a.id, status: to },
      {
        onSuccess: (r) => toast.success(`${a.candidate.fullName} moved to ${recruitmentLabel(r.status)}.`),
        onError: (e) => toast.error("Move not allowed.", { description: errorText(e) }),
      },
    );
  const attemptMove = (a: ApplicationSummary, col: PipelineColumn) => {
    if (col.statuses.includes(toUiStatus(a.status))) return;
    const to = fromUiStatus(col.statuses[0]!);
    if (consequential(to)) setPending({ a, to });
    else doMove(a, to);
  };

  return (
    <div>
      <PageHeader title="Recruitment Pipeline" description="Track every candidate from interview completion through final hiring." />
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between [&>*]:min-w-0">
        <Tabs value={view} onValueChange={(v) => setView(v as keyof typeof VIEWS)}>
          <TabsList className="border-b-0">
            <TabsTrigger value="active">Active pipeline<span className="rounded-full bg-overlay/[0.08] px-1.5 text-[11px]">{viewCount("active")}</span></TabsTrigger>
            <TabsTrigger value="pre">Awaiting interview<span className="rounded-full bg-overlay/[0.08] px-1.5 text-[11px]">{viewCount("pre")}</span></TabsTrigger>
            <TabsTrigger value="closed">Not selected / Withdrawn<span className="rounded-full bg-overlay/[0.08] px-1.5 text-[11px]">{viewCount("closed")}</span></TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-col gap-2 sm:flex-row">
          <SearchInput className="sm:w-60" placeholder="Search pipeline…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search pipeline" />
          <Select label="Role" className="sm:w-48" value={role} onValueChange={setRole} options={[{ value: "all", label: "All roles" }, ...(roles.data ?? []).map((r) => ({ value: r.id, label: r.title }))]} />
        </div>
      </div>
      <p className="mb-3 flex items-center gap-2 text-xs text-fg-muted">
        <ArrowRightLeft className="size-3.5" aria-hidden />Drag cards between stages, or use the card menu. Moves are checked against the recruitment rules before they apply.
        {(list.data?.meta.total ?? 0) > CARD_LIMIT && <span> Showing the {CARD_LIMIT} most recently updated candidates; column totals include everyone.</span>}
      </p>
      {list.isError || counts.isError ? (
        <ApiErrorPanel error={list.error ?? counts.error} onRetry={() => { void list.refetch(); void counts.refetch(); }} />
      ) : (
        <div className="relative -mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className={cn("flex gap-3", view !== "active" && "max-w-3xl", move.isPending && "pointer-events-none opacity-80")} aria-busy={move.isPending}>
            {columns.map((col) => {
              const items = apps.filter((a) => col.statuses.includes(toUiStatus(a.status)));
              const isOver = overCol === col.id && dragId;
              return (
                <section
                  key={col.id}
                  aria-label={`${col.label}, ${countOf(col)} candidates`}
                  onDragOver={(e) => { e.preventDefault(); setOverCol(col.id); }}
                  onDragLeave={() => setOverCol((o) => (o === col.id ? null : o))}
                  onDrop={(e) => {
                    e.preventDefault();
                    const a = apps.find((x) => x.id === (e.dataTransfer.getData("text/plain") || dragId));
                    setDragId(null);
                    setOverCol(null);
                    if (a) attemptMove(a, col);
                  }}
                  className={cn("flex w-[272px] shrink-0 flex-col rounded-xl border bg-overlay/[0.02] transition-colors duration-200", isOver ? "border-brand-cyan/50 bg-brand/[0.07]" : "border-subtle")}
                >
                  <header className="flex items-center justify-between gap-2 px-3.5 pb-2 pt-3.5">
                    <div className="min-w-0">
                      <h2 className="flex items-center gap-2 text-sm font-semibold">{col.label}<span className="rounded-full bg-overlay/[0.07] px-2 py-0.5 text-[11px] font-medium tabular-nums text-fg-secondary">{counts.data ? countOf(col) : "…"}</span></h2>
                      <p className="mt-0.5 truncate text-[11px] text-fg-muted">{col.hint}</p>
                    </div>
                  </header>
                  <div className="flex min-h-[160px] flex-1 flex-col gap-2 overflow-y-auto p-2.5 lg:max-h-[calc(100dvh-330px)]" onDragEnd={() => { setDragId(null); setOverCol(null); }}>
                    {list.isPending ? (
                      <><div className="skeleton h-24 rounded-xl" /><div className="skeleton h-24 rounded-xl" /></>
                    ) : items.length === 0 ? (
                      <div className="grid flex-1 place-items-center rounded-lg border border-dashed border-subtle py-8 text-center text-xs text-fg-disabled">
                        <span className="flex flex-col items-center gap-2"><Inbox className="size-4" aria-hidden />No candidates</span>
                      </div>
                    ) : (
                      items.map((a) => <Card key={a.id} a={a} dragging={dragId === a.id} onDragStart={setDragId} onMove={setMoveFor} />)
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
      <ConfirmationDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        tone={pending && (pending.to === "NOT_SELECTED" || pending.to === "CANDIDATE_WITHDRAWN") ? "danger" : "default"}
        title="Confirm stage change"
        description={pending ? `Move ${pending.a.candidate.fullName} from ${recruitmentLabel(pending.a.status)} to ${recruitmentLabel(pending.to)}?` : ""}
        confirmLabel="Move Candidate"
        onConfirm={() => pending && doMove(pending.a, pending.to)}
      >
        {pending && <div className="flex items-center gap-2 text-sm"><ApiRecruitmentBadge status={pending.a.status} /><span className="text-fg-muted">→</span><ApiRecruitmentBadge status={pending.to} /></div>}
      </ConfirmationDialog>
      {moveFor && <MoveDialog a={moveFor} onClose={() => setMoveFor(null)} />}
    </div>
  );
}
