"use client";
/** API mode: team (users & roles), interview setup (published question sets) and settings. */
import { useState } from "react";
import { BookOpenCheck, Lock, ShieldCheck, UserCog, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, CandidateAvatar, CardHeader, Checkbox, Field, GlassCard, Pill, SkeletonTable, Switch } from "@/components/ui/primitives";
import { ConfirmationDialog, Dialog, DialogContent, DialogFooter, Notice, Tabs, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { EmptyState, PageHeader } from "@/components/ui/states";
import { ThemeSegmented } from "@/components/ui/theme-toggle";
import { ApiErrorPanel, errorText } from "@/components/api/query-state";
import { useQuestionSets, useUpdateUser, useUsers } from "@/lib/data/queries";
import { useAuth } from "@/lib/auth/auth-provider";
import { useDemoStore } from "@/lib/demo/store";
import { TRACK_LABEL } from "@/lib/api/labels";
import type { RoleCode, StaffUser } from "@/lib/api/types";
import { formatDate, formatDateTime, timeAgo } from "@/lib/utils";

const ROLE_LABEL: Record<RoleCode, string> = { SUPER_ADMIN: "Super Admin", HR_MANAGER: "HR Manager", RECRUITER: "Recruiter", REVIEWER: "Reviewer", CANDIDATE: "Candidate" };
const STAFF_ROLES: RoleCode[] = ["SUPER_ADMIN", "HR_MANAGER", "RECRUITER", "REVIEWER"];

// ───────────────────────── Team ─────────────────────────

export function ApiTeam() {
  const { profile } = useAuth();
  const canManage = !!profile?.permissions.includes("users:manage");
  const users = useUsers(canManage);
  const update = useUpdateUser();
  const [view, setView] = useState<"staff" | "all">("staff");
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [roles, setRoles] = useState<RoleCode[]>([]);
  const [toggling, setToggling] = useState<StaffUser | null>(null);

  if (!canManage) {
    return (
      <div>
        <PageHeader title="HR Team" description="Users, roles and access." />
        <GlassCard><EmptyState icon={<Lock />} title="Super Admin access required" description="Only Super Admins can view and manage user accounts and roles. Your role is managed by an administrator." /></GlassCard>
      </div>
    );
  }
  const all = users.data?.items ?? [];
  const rows = view === "staff" ? all.filter((u) => u.roles.some((r) => r !== "CANDIDATE")) : all;
  const save = () =>
    editing &&
    update.mutate({ userId: editing.id, roles: roles.length ? roles : ["CANDIDATE"] }, {
      onSuccess: () => { toast.success("Roles updated.", { description: `${editing.displayName ?? editing.email}: ${roles.map((r) => ROLE_LABEL[r]).join(", ")}` }); setEditing(null); },
    });

  return (
    <div>
      <PageHeader title="HR Team" description="Users who have signed in with Google, their roles and account status. Roles grant access; signing in alone grants none." />
      <Notice className="mb-4" title="Adding someone">The person signs in once with Google (they start as a Candidate with no workspace access). Then grant them a staff role here.</Notice>
      <GlassCard className="overflow-hidden">
        <div className="px-4 pt-2">
          <Tabs value={view} onValueChange={(v) => setView(v as "staff" | "all")}>
            <TabsList className="border-b-0"><TabsTrigger value="staff">Staff</TabsTrigger><TabsTrigger value="all">All accounts</TabsTrigger></TabsList>
          </Tabs>
        </div>
        <div className="border-t border-subtle" />
        {users.isError ? <ApiErrorPanel error={users.error} onRetry={() => void users.refetch()} /> : users.isPending ? <SkeletonTable rows={6} /> : rows.length === 0 ? (
          <EmptyState icon={<UsersRound />} title="No accounts" description="No users match this view." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead><tr><th>User</th><th>Roles</th><th>Status</th><th>Last sign-in</th><th className="w-48"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id}>
                    <td><span className="flex items-center gap-3"><CandidateAvatar name={u.displayName ?? u.email ?? "User"} size="sm" /><span className="min-w-0"><span className="block max-w-[240px] truncate font-medium">{u.displayName ?? "—"}{u.id === profile?.id && <span className="ml-1.5 text-xs text-fg-muted">(you)</span>}</span><span className="block max-w-[240px] truncate text-xs text-fg-muted">{u.email ?? "—"}</span></span></span></td>
                    <td><span className="flex flex-wrap gap-1">{u.roles.map((r) => <Pill key={r}>{ROLE_LABEL[r]}</Pill>)}</span></td>
                    <td><Badge tone={u.status === "ACTIVE" ? "success" : u.status === "DISABLED" ? "danger" : "warning"}>{u.status === "ACTIVE" ? "Active" : u.status === "DISABLED" ? "Disabled" : "Invited"}</Badge></td>
                    <td className="whitespace-nowrap text-fg-muted">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : "Never"}</td>
                    <td>
                      <span className="flex justify-end gap-2">
                        <Button size="sm" variant="secondary" disabled={u.roles.includes("CANDIDATE") && !!u.candidate} title={u.candidate ? "Linked to a candidate record" : undefined} onClick={() => { setEditing(u); setRoles(u.roles.filter((r) => r !== "CANDIDATE")); update.reset(); }}><UserCog />Roles</Button>
                        <Button size="sm" variant="ghost" disabled={u.id === profile?.id} onClick={() => setToggling(u)}>{u.status === "DISABLED" ? "Enable" : "Disable"}</Button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      <Dialog open={!!editing} onOpenChange={(o) => !update.isPending && !o && setEditing(null)}>
        <DialogContent title="Staff roles" description={editing ? `${editing.displayName ?? editing.email ?? ""} — choose the roles this person should have.` : ""} size="sm">
          <ul className="space-y-2">
            {STAFF_ROLES.map((r) => (
              <li key={r}>
                <label className="flex items-center gap-3 rounded-lg border border-subtle p-3 text-sm">
                  <Checkbox checked={roles.includes(r)} onCheckedChange={(c) => setRoles((cur) => (c ? [...cur, r] : cur.filter((x) => x !== r)))} />
                  {ROLE_LABEL[r]}
                </label>
              </li>
            ))}
          </ul>
          {roles.length === 0 && <p className="mt-3 text-xs text-fg-muted">With no staff role, the account becomes a candidate account with no workspace access.</p>}
          {update.isError && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-200">{errorText(update.error)}</p>}
          <DialogFooter>
            <Button variant="secondary" disabled={update.isPending} onClick={() => setEditing(null)}>Cancel</Button>
            <Button loading={update.isPending} onClick={save}>Save Roles</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmationDialog
        open={!!toggling}
        onOpenChange={(o) => !o && setToggling(null)}
        tone={toggling?.status === "DISABLED" ? "default" : "danger"}
        title={toggling?.status === "DISABLED" ? "Enable account?" : "Disable account?"}
        description={toggling?.status === "DISABLED" ? "The person will be able to sign in again with their existing roles." : "The person will be signed out of InterviewOS on their next request. Their records are kept."}
        confirmLabel={toggling?.status === "DISABLED" ? "Enable" : "Disable"}
        onConfirm={() => toggling && update.mutate({ userId: toggling.id, status: toggling.status === "DISABLED" ? "ACTIVE" : "DISABLED" }, { onSuccess: () => toast.success("Account updated."), onError: (e) => toast.error("Couldn't update the account.", { description: errorText(e) }) })}
      />
    </div>
  );
}

// ───────────────────────── Interview setup ─────────────────────────

export function ApiInterviewSetup() {
  const sets = useQuestionSets();
  const [code, setCode] = useState<string | null>(null);
  if (sets.isPending) return <div><PageHeader title="Jobs & Interview Setup" /><GlassCard><SkeletonTable rows={5} /></GlassCard></div>;
  if (sets.isError) return <div><PageHeader title="Jobs & Interview Setup" /><ApiErrorPanel error={sets.error} onRetry={() => void sets.refetch()} /></div>;
  const list = sets.data;
  const current = list.find((s) => s.code === code) ?? list[0];
  return (
    <div>
      <PageHeader title="Jobs & Interview Setup" description="Official HR question sets. Interviews always use the active published version; published versions never change." />
      {!current ? <GlassCard><EmptyState icon={<BookOpenCheck />} title="No question sets" description="Run the database seed to load the official HR question sets." /></GlassCard> : (
        <>
          <Tabs value={current.code} onValueChange={setCode}>
            <TabsList>{list.map((s) => <TabsTrigger key={s.code} value={s.code}>{s.title}</TabsTrigger>)}</TabsList>
          </Tabs>
          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <GlassCard className="p-6">
              <CardHeader title={current.activeVersion ? `Active version ${current.activeVersion.versionCode}` : "No published version"} description={current.activeVersion?.source ?? undefined} action={<Pill>{TRACK_LABEL[current.track]}</Pill>} />
              {current.activeVersion ? (
                <ol className="mt-5 space-y-3">
                  {current.activeVersion.questions.map((q) => (
                    <li key={q.id} className="rounded-xl border border-subtle bg-overlay/[0.02] p-4">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-display font-semibold text-brand-cyan">Question {q.position} — {q.category}</span>
                        <span className="font-mono text-fg-disabled">{q.code}</span>
                        <span className="ml-auto text-fg-muted">{q.responseSeconds}s to answer</span>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-fg">{q.text}</p>
                    </li>
                  ))}
                </ol>
              ) : <p className="mt-4 text-sm text-fg-muted">Publish a version before issuing interviews for this role.</p>}
            </GlassCard>
            <GlassCard className="p-5">
              <CardHeader title="Versions" />
              <ul className="mt-4 space-y-2">
                {current.versions.map((v) => (
                  <li key={v.versionCode} className="flex items-center justify-between gap-2 rounded-lg border border-subtle p-3 text-sm">
                    <span className="font-mono text-xs">{v.versionCode}</span>
                    <span className="flex items-center gap-2">
                      <Badge tone={v.status === "PUBLISHED" ? "success" : v.status === "DRAFT" ? "warning" : "neutral"}>{v.status === "PUBLISHED" ? "Published" : v.status === "DRAFT" ? "Draft" : "Retired"}</Badge>
                      <span className="text-xs text-fg-muted">{v.publishedAt ? formatDate(v.publishedAt) : ""}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs leading-relaxed text-fg-muted">New versions are created as drafts and published by an HR Manager through the API (<span className="font-mono">/question-sets</span>); a draft editor in this screen is not built yet. Issued interviews keep the version they started with.</p>
            </GlassCard>
          </div>
        </>
      )}
    </div>
  );
}

// ───────────────────────── Settings ─────────────────────────

/** Only real, local preferences. Organisation settings have no server endpoint yet, so they are not offered. */
export function ApiSettings() {
  const { profile, user } = useAuth();
  const settings = useDemoStore((s) => s.settings);
  const updateSettings = useDemoStore((s) => s.updateSettings);
  return (
    <div>
      <PageHeader title="Settings" description="Your account and display preferences." />
      <div className="grid gap-6 xl:grid-cols-2">
        <GlassCard className="p-6">
          <CardHeader title="Your account" icon={<ShieldCheck />} />
          <dl className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field label="Name" value={profile?.displayName ?? user?.displayName ?? "—"} />
            <Field label="Email" value={profile?.email ?? "—"} />
            <Field label="Roles" value={profile?.roles.map((r) => ROLE_LABEL[r]).join(", ") ?? "—"} />
            <Field label="Sign-in" value="Google (Firebase Authentication)" />
          </dl>
          <p className="mt-4 text-xs text-fg-muted">Roles are assigned by a Super Admin. Last checked {formatDateTime(new Date().toISOString())}.</p>
        </GlassCard>
        <GlassCard className="p-6">
          <CardHeader title="Display" description="Saved in this browser only." />
          <div className="mt-5 space-y-5">
            <div><p className="mb-2 text-sm font-medium">Theme</p><ThemeSegmented /></div>
            <label className="flex items-center justify-between gap-4 text-sm"><span>Reduce motion</span><Switch checked={settings.reduceMotion} onCheckedChange={(v) => updateSettings({ reduceMotion: v })} /></label>
            <label className="flex items-center justify-between gap-4 text-sm"><span>Compact tables</span><Switch checked={settings.compactTables} onCheckedChange={(v) => updateSettings({ compactTables: v })} /></label>
          </div>
        </GlassCard>
      </div>
      <Notice className="mt-6" title="Organisation settings">Organisation-wide settings (branding text, notification policy, reviewer defaults) are not stored on the server yet, so they aren&apos;t editable in API mode.</Notice>
    </div>
  );
}
