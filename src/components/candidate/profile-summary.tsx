import { Field, GlassCard } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/utils";
export function CandidateProfileSummary({ name, email, role, appliedAt, completedAt, status }: {
  name?: string | null; email?: string | null; role?: string | null; appliedAt?: string | null; completedAt?: string | null; status: string;
}) {
  return <GlassCard className="mt-6 p-5 sm:p-6"><h2 className="text-lg font-semibold">Your profile</h2><dl className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Full name" value={name?.trim() || "Not provided"} /><Field label="Email" value={email?.trim() || "Not provided"} /><Field label="Applied role" value={role || "Not selected"} /><Field label="Application date" value={appliedAt ? formatDateTime(appliedAt) : "Not available"} /><Field label="Interview status" value={status} />{completedAt && <Field label="Interview completed" value={formatDateTime(completedAt)} />}</dl><p className="mt-4 text-xs text-fg-muted">Contact the recruitment team if your verified application details need correcting.</p></GlassCard>;
}
