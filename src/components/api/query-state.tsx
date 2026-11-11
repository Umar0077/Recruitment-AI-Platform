"use client";
/** Shared loading / error / empty presentation for API-mode screens. Never shows raw server errors. */
import { AlertTriangle, CloudOff, Lock, RefreshCw, SearchX, ServerCrash, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { ApiError } from "@/lib/api/client";

/** Human-readable text for any API failure. Server validation/conflict messages are already user-safe. */
export function errorText(err: unknown): string {
  if (!(err instanceof ApiError)) return "Something went wrong. Please try again.";
  if (err.code === "NETWORK_ERROR") return "Can't reach the InterviewOS server. Check your connection and try again.";
  if (err.code === "TIMEOUT") return "The server took too long to respond. Please try again.";
  if (err.status === 401) return "Your session has ended. Please sign in again.";
  if (err.status === 403) return err.code === "ACCOUNT_DISABLED" ? "This account is disabled." : "You don't have permission to do this.";
  if (err.status === 404) return "This record wasn't found, or you don't have access to it.";
  if (err.status === 429) return "Too many requests. Please wait a moment and try again.";
  if (err.status === 503) return "The service is temporarily unavailable. Please try again shortly.";
  if (err.status >= 500) return "The server had a problem. Nothing was changed — please try again.";
  return err.message || "The request couldn't be completed.";
}

export function ApiErrorPanel({ error, onRetry, className, compact }: { error: unknown; onRetry?: () => void; className?: string; compact?: boolean }) {
  const e = error instanceof ApiError ? error : null;
  const Icon = !e ? AlertTriangle : e.status === 0 ? (e.code === "TIMEOUT" ? Timer : CloudOff) : e.status === 403 ? Lock : e.status === 404 ? SearchX : e.status >= 500 ? ServerCrash : AlertTriangle;
  if (compact) {
    return (
      <div role="alert" className={`flex flex-wrap items-center gap-3 rounded-xl border border-danger/30 bg-danger/[0.06] p-3 text-sm text-red-700 dark:text-red-200 ${className ?? ""}`}>
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">{errorText(error)}</span>
        {onRetry && <Button size="sm" variant="secondary" onClick={onRetry}><RefreshCw />Retry</Button>}
      </div>
    );
  }
  return (
    <EmptyState
      className={className}
      icon={<Icon />}
      title={e?.status === 403 ? "Access restricted" : e?.status === 404 ? "Not found" : "Couldn't load this"}
      description={errorText(error)}
      action={onRetry ? <Button variant="secondary" onClick={onRetry}><RefreshCw />Try Again</Button> : undefined}
    />
  );
}
