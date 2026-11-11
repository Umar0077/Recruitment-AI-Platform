"use client";
import { SkeletonPage } from "@/components/ui/primitives";
import { isApiMode } from "@/lib/config/environment";
import { ApiCandidatesList } from "@/components/api/admin/candidates-list";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Columns3, Download, Eye, FilterX, MoreHorizontal, RefreshCw, SlidersHorizontal, UserRound, UsersRound, Video, X } from "lucide-react";
import { toast } from "sonner";
import type { Candidate } from "@/types";
import { Button } from "@/components/ui/button";
import { CandidateAvatar, Checkbox, GlassCard, Pill, SearchInput, SkeletonTable } from "@/components/ui/primitives";
import { Drawer, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, Select } from "@/components/ui/overlays";
import { EmptyState, InterviewStatusBadge, PageHeader, RecruitmentStatusBadge } from "@/components/ui/states";
import { ChangeStatusDialog } from "@/components/admin/candidate-actions";
import { useDemoStore } from "@/lib/demo/store";
import { roleShort } from "@/lib/demo/selectors";
import { INTERVIEW_STATUS_META, RECRUITMENT_STATUSES, statusLabel } from "@/lib/demo/statuses";
import { JOB_ROLES, roleById } from "@/lib/demo/questions";
import { cn, downloadCsv, formatDate, timeAgo } from "@/lib/utils";

type Row = Candidate & { interviewStatus: string; interviewReview?: string };
const col = createColumnHelper<Row>();

const DATE_OPTS = [
  { value: "all", label: "Any date" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

function DemoCandidatesPage() {
  return (
    <Suspense fallback={<SkeletonTable />}>
      <Candidates />
    </Suspense>
  );
}

function Candidates() {
  const router = useRouter();
  const params = useSearchParams();
  const candidates = useDemoStore((s) => s.candidates);
  const interviews = useDemoStore((s) => s.interviews);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState(params.get("role") ?? "all");
  const [ivStatus, setIvStatus] = useState("all");
  const [stage, setStage] = useState(params.get("stage") ?? "all");
  const [dateRange, setDateRange] = useState("all");
  const [sorting, setSorting] = useState<SortingState>([{ id: "lastUpdated", desc: true }]);
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [visibility, setVisibility] = useState<VisibilityState>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFor, setStatusFor] = useState<Candidate | null>(null);
  const [busy, setBusy] = useState(false);

  // A brief skeleton when filters change keeps feedback visible without blocking the page.
  useEffect(() => {
    setBusy(true);
    const t = setTimeout(() => setBusy(false), 180);
    return () => clearTimeout(t);
  }, [role, ivStatus, stage, dateRange]);

  const rows = useMemo<Row[]>(() => {
    const ivMap = new Map(interviews.map((i) => [i.id, i]));
    const from = dateRange === "all" ? 0 : Date.now() - Number(dateRange) * 86400000;
    return candidates
      .map((c) => {
        const iv = c.interviewId ? ivMap.get(c.interviewId) : undefined;
        const interviewStatus = !iv ? "not_invited" : iv.status === "completed" && iv.reviewStatus === "awaiting_review" ? "awaiting_review" : iv.status;
        return { ...c, interviewStatus, interviewReview: iv?.reviewStatus };
      })
      .filter((c) => (role === "all" || c.roleId === role) && (ivStatus === "all" || c.interviewStatus === ivStatus) && (stage === "all" || c.status === stage) && new Date(c.appliedAt).getTime() >= from);
  }, [candidates, interviews, role, ivStatus, stage, dateRange]);

  const columns = useMemo(
    () => [
      col.display({
        id: "select",
        header: ({ table }) => <Checkbox aria-label="Select all on this page" checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? "indeterminate" : false} onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)} />,
        cell: ({ row }) => <Checkbox aria-label={`Select ${row.original.name}`} checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(!!v)} onClick={(e) => e.stopPropagation()} />,
        enableSorting: false,
        enableHiding: false,
      }),
      col.accessor("name", {
        header: "Candidate",
        cell: ({ row }) => (
          <span className="flex items-center gap-3">
            <CandidateAvatar name={row.original.name} size="sm" />
            <span className="min-w-0">
              <span className="block font-medium text-fg">{row.original.name}</span>
              <span className="block text-xs text-fg-muted">{row.original.email}</span>
            </span>
          </span>
        ),
        enableHiding: false,
      }),
      col.accessor("id", { header: "Candidate ID", cell: (i) => <span className="font-mono text-xs">{i.getValue()}</span> }),
      col.accessor("roleId", { header: "Applied Position", cell: ({ row }) => <Pill>{roleShort(row.original)}</Pill> }),
      col.accessor("appliedAt", { header: "Application Date", cell: (i) => formatDate(i.getValue()) }),
      col.accessor("interviewStatus", {
        header: "AI Interview",
        cell: ({ row }) => (row.original.interviewStatus === "not_invited" ? <span className="text-fg-disabled">Not invited</span> : <InterviewStatusBadge status={row.original.interviewStatus === "awaiting_review" ? "completed" : (row.original.interviewStatus as never)} review={row.original.interviewReview as never} />),
      }),
      col.accessor("status", { header: "Recruitment Stage", cell: (i) => <RecruitmentStatusBadge status={i.getValue()} />, sortingFn: (a, b) => RECRUITMENT_STATUSES.findIndex((s) => s.id === a.original.status) - RECRUITMENT_STATUSES.findIndex((s) => s.id === b.original.status) }),
      col.accessor("lastUpdated", { header: "Last Updated", cell: (i) => <span title={formatDate(i.getValue())}>{timeAgo(i.getValue())}</span> }),
      col.display({
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.original.name}`} onClick={(e) => e.stopPropagation()}><MoreHorizontal /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onSelect={() => router.push(`/admin/candidates/${row.original.id}`)}><UserRound />View profile</DropdownMenuItem>
              {row.original.interviewId && row.original.interviewStatus !== "not_started" && (
                <DropdownMenuItem onSelect={() => router.push(`/admin/interviews/${row.original.interviewId}`)}><Video />View interview</DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setStatusFor(row.original)}><RefreshCw />Update status</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
        enableSorting: false,
        enableHiding: false,
      }),
    ],
    [router],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter: search, rowSelection: selection, columnVisibility: visibility },
    onSortingChange: setSorting,
    onGlobalFilterChange: setSearch,
    onRowSelectionChange: setSelection,
    onColumnVisibilityChange: setVisibility,
    getRowId: (r) => r.id,
    globalFilterFn: (row, _id, value: string) => {
      const v = value.toLowerCase();
      const c = row.original;
      return c.name.toLowerCase().includes(v) || c.id.toLowerCase().includes(v) || c.email.toLowerCase().includes(v) || (c.interviewId ?? "").toLowerCase().includes(v);
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 12 } },
  });

  const activeFilters = [role !== "all", ivStatus !== "all", stage !== "all", dateRange !== "all", !!search].filter(Boolean).length;
  const clear = () => { setRole("all"); setIvStatus("all"); setStage("all"); setDateRange("all"); setSearch(""); toast.info("Filters cleared."); };
  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);
  const filtered = table.getFilteredRowModel().rows.map((r) => r.original);
  const exportRows = (list: Row[]) => {
    downloadCsv("candidates.csv", list.map((c) => ({ id: c.id, name: c.name, email: c.email, position: roleById(c.roleId).title, applied: formatDate(c.appliedAt), interview: c.interviewStatus, stage: statusLabel(c.status) })));
    toast.success(`Exported ${list.length} candidate${list.length === 1 ? "" : "s"} to CSV.`);
  };

  const filterControls = (
    <>
      <Select label="Applied role" value={role} onValueChange={setRole} options={[{ value: "all", label: "All roles" }, ...JOB_ROLES.map((r) => ({ value: r.id, label: r.shortTitle }))]} />
      <Select label="Interview status" value={ivStatus} onValueChange={setIvStatus} options={[{ value: "all", label: "Any interview status" }, ...Object.entries(INTERVIEW_STATUS_META).map(([k, v]) => ({ value: k, label: v.label === "—" ? k : v.label })), { value: "awaiting_review", label: "Awaiting Review" }]} />
      <Select label="Recruitment stage" value={stage} onValueChange={setStage} options={[{ value: "all", label: "All stages" }, ...RECRUITMENT_STATUSES.map((s) => ({ value: s.id, label: s.label }))]} />
      <Select label="Application date" value={dateRange} onValueChange={setDateRange} options={DATE_OPTS} />
    </>
  );

  return (
    <div>
      <PageHeader
        title="Candidates"
        description="Review and manage applicants throughout their recruitment journey."
        actions={<Button variant="secondary" onClick={() => exportRows(filtered)} disabled={!filtered.length}><Download />Export</Button>}
      />

      <GlassCard className="overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-subtle p-4">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput className="min-w-0 flex-1 sm:max-w-sm" placeholder="Search name, email, candidate or interview ID…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search candidates" />
            <Button variant="secondary" className="lg:hidden" onClick={() => setFiltersOpen(true)}>
              <SlidersHorizontal />Filters{activeFilters > 0 && <span className="rounded-full bg-brand px-1.5 text-[11px] text-white">{activeFilters}</span>}
            </Button>
            <div className="hidden flex-1 grid-cols-4 gap-2 lg:grid">{filterControls}</div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon" aria-label="Column visibility" className="hidden md:inline-flex"><Columns3 /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
                {table.getAllLeafColumns().filter((c) => c.getCanHide()).map((c) => (
                  <DropdownMenuItem key={c.id} onSelect={(e) => { e.preventDefault(); c.toggleVisibility(); }}>
                    <Checkbox checked={c.getIsVisible()} aria-hidden tabIndex={-1} className="pointer-events-none" />
                    {typeof c.columnDef.header === "string" ? c.columnDef.header : c.id}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
            <span aria-live="polite">{filtered.length} of {candidates.length} candidates</span>
            {activeFilters > 0 && <Button variant="ghost" size="sm" onClick={clear}><FilterX />Clear filters ({activeFilters})</Button>}
          </div>
        </div>

        {/* Bulk bar */}
        {selectedRows.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-b border-subtle bg-brand/[0.08] px-4 py-2.5 text-sm">
            <span className="font-medium">{selectedRows.length} selected</span>
            <Button size="sm" variant="secondary" onClick={() => exportRows(selectedRows)}><Download />Export selected</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelection({})}><X />Clear selection</Button>
          </div>
        )}

        {busy ? (
          <SkeletonTable rows={8} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={<UsersRound />} title="No candidates found" description="No candidates match your search and filters. Try a different name or ID, or clear the filters." action={<Button variant="secondary" onClick={clear}><FilterX />Clear filters</Button>} />
        ) : (
          <>
            {/* Desktop table */}
            <div className="relative hidden max-h-[calc(100dvh-340px)] min-h-[420px] overflow-auto md:block">
              <table className="data-table w-full">
                <thead className="sticky top-0 z-10 bg-ink-900/95 backdrop-blur">
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id}>
                      {hg.headers.map((h) => (
                        <th key={h.id} className={cn(h.column.id === "select" && "w-10", h.column.id === "actions" && "w-12")} aria-sort={h.column.getIsSorted() ? (h.column.getIsSorted() === "asc" ? "ascending" : "descending") : undefined}>
                          {h.column.getCanSort() ? (
                            <button className="inline-flex items-center gap-1.5 hover:text-fg" onClick={h.column.getToggleSortingHandler()}>
                              {flexRender(h.column.columnDef.header, h.getContext())}
                              {h.column.getIsSorted() === "asc" ? <ArrowUp className="size-3" /> : h.column.getIsSorted() === "desc" ? <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-40" />}
                            </button>
                          ) : (
                            flexRender(h.column.columnDef.header, h.getContext())
                          )}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr key={row.id} className={cn("cursor-pointer", row.getIsSelected() && "bg-brand/[0.06]")} onClick={() => router.push(`/admin/candidates/${row.original.id}`)}>
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile list */}
            <ul className="divide-y divide-[rgba(148,163,184,0.12)] md:hidden">
              {table.getRowModel().rows.map(({ original: c }) => (
                <li key={c.id}>
                  <Link href={`/admin/candidates/${c.id}`} className="block px-4 py-4">
                    <span className="flex items-center gap-3">
                      <CandidateAvatar name={c.name} size="md" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{c.name}</span>
                        <span className="block text-xs text-fg-muted">{c.id} · {roleShort(c)}</span>
                      </span>
                      <Eye className="size-4 text-fg-disabled" aria-hidden />
                    </span>
                    <span className="mt-3 flex flex-wrap items-center gap-2">
                      <RecruitmentStatusBadge status={c.status} />
                      <span className="text-xs text-fg-muted">Updated {timeAgo(c.lastUpdated)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {/* Pagination */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-subtle px-4 py-3 text-xs text-fg-muted">
              <span>Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}</span>
              <div className="flex items-center gap-2">
                <Select label="Rows per page" size="sm" className="w-28" value={String(table.getState().pagination.pageSize)} onValueChange={(v) => table.setPageSize(Number(v))} options={[12, 25, 50].map((n) => ({ value: String(n), label: `${n} / page` }))} />
                <Button variant="secondary" size="icon-sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Previous page"><ChevronLeft /></Button>
                <Button variant="secondary" size="icon-sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Next page"><ChevronRight /></Button>
              </div>
            </div>
          </>
        )}
      </GlassCard>

      <Drawer open={filtersOpen} onOpenChange={setFiltersOpen} title="Filters" description="Narrow the candidate list">
        <div className="space-y-3 p-5">
          {filterControls}
          <div className="grid grid-cols-2 gap-2 pt-3">
            <Button variant="secondary" onClick={clear}>Clear</Button>
            <Button onClick={() => setFiltersOpen(false)}>Show {filtered.length} results</Button>
          </div>
        </div>
      </Drawer>
      {statusFor && <ChangeStatusDialog candidate={statusFor} open={!!statusFor} onOpenChange={(o) => !o && setStatusFor(null)} />}
    </div>
  );
}

/** API mode renders the PostgreSQL-backed screen; demo mode keeps the original demo screen unchanged. */
export default function CandidatesPage() {
  return isApiMode ? <Suspense fallback={<SkeletonPage />}><ApiCandidatesList /></Suspense> : <DemoCandidatesPage />;
}
