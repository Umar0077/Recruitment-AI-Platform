"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Briefcase, CornerDownLeft, Search, SearchX, Video } from "lucide-react";
import { CandidateAvatar, Kbd } from "@/components/ui/primitives";
import { useDemoStore } from "@/lib/demo/store";
import { isApiMode } from "@/lib/config/environment";
import { useApplicationSearch } from "@/lib/data/queries";
import type { Candidate, InterviewSession } from "@/types";

const NO_CANDIDATES: Candidate[] = [];
const NO_INTERVIEWS: InterviewSession[] = [];
import { JOB_ROLES, roleById } from "@/lib/demo/questions";
import { statusLabel } from "@/lib/demo/statuses";
import { ALL_NAV } from "./nav";
import { cn } from "@/lib/utils";

interface Result {
  id: string;
  group: "Pages" | "Candidates" | "Interviews" | "Job Roles";
  label: string;
  sub?: string;
  href: string;
  icon: React.ReactNode;
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const demoCandidates = useDemoStore((s) => s.candidates);
  const demoInterviews = useDemoStore((s) => s.interviews);
  // API mode never searches demo records; candidates come from a server-side search instead.
  const candidates = isApiMode ? NO_CANDIDATES : demoCandidates;
  const interviews = isApiMode ? NO_INTERVIEWS : demoInterviews;
  const [q, setQ] = useState("");
  const remote = useApplicationSearch(isApiMode ? q.trim() : "");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => { if (open) { setQ(""); setActive(0); } }, [open]);

  const results = useMemo<Result[]>(() => {
    const term = q.trim().toLowerCase();
    const has = (...s: string[]) => !term || s.some((x) => x.toLowerCase().includes(term));
    const pages: Result[] = ALL_NAV.filter((n) => has(n.label)).map((n) => ({ id: n.href, group: "Pages", label: n.label, href: n.href, icon: <n.icon className="size-4" /> }));
    const cands: Result[] = candidates
      .filter((c) => term && has(c.name, c.id, c.email))
      .slice(0, 6)
      .map((c) => ({ id: c.id, group: "Candidates", label: c.name, sub: `${c.id} · ${roleById(c.roleId).shortTitle} · ${statusLabel(c.status)}`, href: `/admin/candidates/${c.id}`, icon: <CandidateAvatar name={c.name} size="sm" /> }));
    const ivs: Result[] = interviews
      .filter((i) => term && has(i.id, candidates.find((c) => c.id === i.candidateId)?.name ?? ""))
      .slice(0, 4)
      .map((i) => ({ id: i.id, group: "Interviews", label: i.id, sub: candidates.find((c) => c.id === i.candidateId)?.name, href: `/admin/interviews/${i.id}`, icon: <Video className="size-4" /> }));
    const roles: Result[] = JOB_ROLES.filter((r) => has(r.title)).map((r) => ({ id: r.id, group: "Job Roles", label: r.title, sub: r.department, href: `/admin/interview-setup?track=${r.track}`, icon: <Briefcase className="size-4" /> }));
    const apiCands: Result[] = (remote.data?.items ?? []).map((a) => ({ id: a.id, group: "Candidates", label: a.candidate.fullName, sub: `${a.jobRole.title} · ${a.statusLabel}`, href: `/admin/candidates/${a.id}`, icon: <CandidateAvatar name={a.candidate.fullName} size="sm" /> }));
    return [...apiCands, ...cands, ...ivs, ...pages, ...roles];
  }, [q, candidates, interviews, remote.data]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = (r?: Result) => {
    if (!r) return;
    onOpenChange(false);
    router.push(r.href);
  };

  const groups = ["Candidates", "Interviews", "Pages", "Job Roles"] as const;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-scrim/40 dark:bg-scrim/70 backdrop-blur-sm data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          className="surface-solid fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-24px)] max-w-[620px] -translate-x-1/2 overflow-hidden rounded-2xl shadow-float data-[state=open]:animate-pop-in focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            if (e.key === "Enter") { e.preventDefault(); go(results[active]); }
          }}
        >
          <DialogPrimitive.Title className="sr-only">Search workspace</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Search candidates, interview IDs, job roles, and pages. Use arrow keys to move and Enter to open.</DialogPrimitive.Description>
          <div className="flex items-center gap-3 border-b border-subtle px-4">
            <Search className="size-5 text-fg-muted" aria-hidden />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search candidates, interview IDs, roles, pages…"
              className="h-14 flex-1 bg-transparent text-[15px] text-fg placeholder:text-fg-disabled focus:outline-none"
              role="combobox"
              aria-expanded
              aria-controls="cmd-results"
              aria-activedescendant={results[active] ? `cmd-${results[active]!.id}` : undefined}
            />
            <Kbd>Esc</Kbd>
          </div>
          {results.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <SearchX className="size-8 text-fg-disabled" aria-hidden />
              <p className="mt-3 text-sm font-medium">No results for &ldquo;{q}&rdquo;</p>
              <p className="mt-1 text-xs text-fg-muted">Try a candidate name, an ID like CND-1004 or INT-1004, or a page name.</p>
            </div>
          ) : (
            <ul id="cmd-results" ref={listRef} role="listbox" className="max-h-[52vh] overflow-y-auto p-2">
              {groups.map((g) => {
                const items = results.filter((r) => r.group === g);
                if (!items.length) return null;
                return (
                  <li key={g} role="presentation">
                    <p className="px-3 pb-1 pt-3 text-[11px] font-medium uppercase tracking-[0.14em] text-fg-disabled">{g}</p>
                    <ul role="presentation">
                      {items.map((r) => {
                        const i = results.indexOf(r);
                        return (
                          <li
                            key={r.id}
                            id={`cmd-${r.id}`}
                            role="option"
                            aria-selected={i === active}
                            data-index={i}
                            onMouseMove={() => setActive(i)}
                            onClick={() => go(r)}
                            className={cn("flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5", i === active ? "bg-brand/15 text-fg" : "text-fg-secondary")}
                          >
                            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-overlay/[0.04] text-brand-cyan">{r.icon}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{r.label}</span>
                              {r.sub && <span className="block truncate text-xs text-fg-muted">{r.sub}</span>}
                            </span>
                            {i === active && <CornerDownLeft className="size-4 text-fg-muted" aria-hidden />}
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex items-center gap-4 border-t border-subtle px-4 py-2.5 text-[11px] text-fg-muted">
            <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
            <span className="flex items-center gap-1"><Kbd>Enter</Kbd> open</span>
            <span className="ml-auto">{results.length} results</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
