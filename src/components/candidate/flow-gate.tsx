"use client";
/** Common loading / error / unavailable handling for candidate pages, shared by demo and API mode. */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/primitives";
import { ApiErrorPanel } from "@/components/api/query-state";
import { useQueryClient } from "@tanstack/react-query";
import type { CandidateFlowView } from "@/lib/data/candidate-flow";

export function FlowSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading your interview">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-56 w-full rounded-2xl" />
    </div>
  );
}

/**
 * Returns an element to render instead of the page (loading, error, redirecting), or null when the page may render.
 * Expired / cancelled / missing interviews go to the existing "unavailable" screen — never to demo data.
 */
export function useFlowGate(f: CandidateFlowView): React.ReactNode | null {
  const router = useRouter();
  const qc = useQueryClient();
  const target =
    f.mode !== "api" || f.loading || f.error ? null
      : f.noInterview ? "/candidate/interview/unavailable?reason=not-linked"
      : f.interviewStatus === "EXPIRED" ? "/candidate/interview/unavailable?reason=expired"
      : f.interviewStatus === "CANCELLED" ? "/candidate/interview/unavailable?reason=session"
      : null;
  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  if (f.loading || target) return <FlowSkeleton />;
  if (f.error) return <ApiErrorPanel error={f.error} onRetry={() => void qc.invalidateQueries({ queryKey: ["portal"] })} />;
  return null;
}
