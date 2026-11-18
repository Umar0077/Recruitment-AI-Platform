"use client";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
/** Recording delivery is separate from the confirmed interview submission. Read-only. */
export function CompletionMediaStatus({ sessionId }: { sessionId: string }) {
  const query = useQuery({ queryKey: ["recordings", sessionId], queryFn: ({ signal }) => apiRequest<{ recordings: { status: string }[] }>("/recordings", { query: { sessionId }, signal }), retry: false });
  if (query.isPending) return <p role="status" className="mt-4 text-sm text-fg-muted">Interview submitted. Checking separate recording status…</p>;
  if (query.isError) return <p role="status" className="mt-4 text-sm text-fg-muted">Your interview is submitted. Recording status could not be checked. <button className="underline" onClick={() => void query.refetch()}>Retry recording status</button></p>;
  const rows = query.data.data.recordings;
  if (!rows.length) return null;
  const incomplete = rows.some(row => !["UPLOADED", "DELETED", "CANCELLED"].includes(row.status));
  return <p role="status" className="mt-4 text-sm text-fg-muted">{incomplete ? "Your answers are submitted. One or more recording segments are incomplete; contact the recruitment team if you need help." : rows.some(row => row.status === "UPLOADED") ? "Recording upload confirmed separately from your submitted answers." : "No recording is retained. Your submitted answers remain available for review."}</p>;
}
