"use client";
import { isApiMode } from "@/lib/config/environment";
import { ApiTeam } from "@/components/api/admin/management";
import { useState } from "react";
import { Check, Eye, MoreHorizontal, Power, ShieldCheck, UserPlus, UserCog, Minus } from "lucide-react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Recruiter, TeamRole } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge, CandidateAvatar, Field, FieldError, GlassCard, CardHeader, Input, Label } from "@/components/ui/primitives";
import { ConfirmationDialog, Dialog, DialogContent, DialogFooter, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Notice, Select, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlays";
import { PageHeader } from "@/components/ui/states";
import { useDemoStore } from "@/lib/demo/store";
import { TEAM_ROLE_LABEL } from "@/lib/demo/statuses";
import { CURRENT_ADMIN_ID } from "@/lib/demo/seed";
import { cn, timeAgo } from "@/lib/utils";

const ROLE_OPTS = (Object.keys(TEAM_ROLE_LABEL) as TeamRole[]).map((r) => ({ value: r, label: TEAM_ROLE_LABEL[r] }));
const MODULES = ["Dashboard", "Candidates", "Interviews", "Assessments", "Recruitment Pipeline", "Reports", "Team Management", "Settings"];
const PERMS = ["View", "Create", "Update", "Review", "Manage"] as const;
// Proposed matrix — final permissions are defined in the functional phase.
const MATRIX: Record<TeamRole, (m: string, p: string) => boolean> = {
  super_admin: () => true,
  hr_manager: (m, p) => !(m === "Settings" && p === "Manage"),
  recruiter: (m, p) => (["Team Management", "Settings"].includes(m) ? p === "View" && m !== "Settings" : p !== "Manage"),
  reviewer: (m, p) => (["Interviews", "Assessments"].includes(m) ? p === "View" || p === "Review" : ["Dashboard", "Candidates"].includes(m) && p === "View"),
};

const inviteSchema = z.object({ name: z.string().trim().min(2, "Enter a name."), email: z.string().trim().email("Enter a valid email address."), role: z.enum(["super_admin", "hr_manager", "recruiter", "reviewer"]) });
type InviteValues = z.infer<typeof inviteSchema>;

function DemoTeamPage() {
  const team = useDemoStore((s) => s.team);
  const interviews = useDemoStore((s) => s.interviews);
  const candidates = useDemoStore((s) => s.candidates);
  const setTeamRole = useDemoStore((s) => s.setTeamRole);
  const toggleActive = useDemoStore((s) => s.toggleTeamActive);
  const invite = useDemoStore((s) => s.inviteTeamMember);
  const [viewing, setViewing] = useState<Recruiter | null>(null);
  const [editing, setEditing] = useState<Recruiter | null>(null);
  const [newRole, setNewRole] = useState<TeamRole>("recruiter");
  const [toggling, setToggling] = useState<Recruiter | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [matrixRole, setMatrixRole] = useState<TeamRole>("recruiter");
  const form = useForm<InviteValues>({ resolver: zodResolver(inviteSchema), defaultValues: { name: "", email: "", role: "recruiter" } });

  const assigned = (id: string) => candidates.filter((c) => c.recruiterId === id && c.interviewId && interviews.find((i) => i.id === c.interviewId)?.reviewStatus === "awaiting_review").length;

  return (
    <div>
      <PageHeader title="HR Team" description="Manage team members, roles, and review assignments." actions={<Button onClick={() => setInviteOpen(true)}><UserPlus />Invite User</Button>} />
      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members"><UserCog />Members</TabsTrigger>
          <TabsTrigger value="permissions"><ShieldCheck />Permissions</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-6">
          <GlassCard className="overflow-hidden">
            <div className="relative hidden overflow-x-auto md:block">
              <table className="data-table w-full">
                <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Assigned Reviews</th><th>Last Activity</th><th className="w-12"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {team.map((t) => (
                    <tr key={t.id}>
                      <td><span className="flex items-center gap-3"><CandidateAvatar name={t.name} size="sm" /><span><span className="block font-medium text-fg">{t.name}{t.id === CURRENT_ADMIN_ID && <span className="ml-2 text-xs text-fg-muted">(you)</span>}</span><span className="block text-xs text-fg-muted">{t.title}</span></span></span></td>
                      <td>{t.email}</td>
                      <td><Badge tone={t.role === "super_admin" ? "indigo" : t.role === "hr_manager" ? "blue" : "neutral"} dot={false}>{TEAM_ROLE_LABEL[t.role]}</Badge></td>
                      <td>{t.title === "Invitation pending" ? <Badge tone="warning">Invited</Badge> : t.active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}</td>
                      <td className="tabular-nums">{assigned(t.id)}</td>
                      <td>{timeAgo(t.lastActive)}</td>
                      <td>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for ${t.name}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onSelect={() => setViewing(t)}><Eye />View user</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => { setNewRole(t.role); setEditing(t); }}><UserCog />Edit role</DropdownMenuItem>
                            <DropdownMenuItem disabled={t.id === CURRENT_ADMIN_ID} destructive={t.active} onSelect={() => setToggling(t)}><Power />{t.active ? "Deactivate" : "Activate"}</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-[rgba(148,163,184,0.12)] md:hidden">
              {team.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3.5">
                  <CandidateAvatar name={t.name} size="sm" />
                  <button className="min-w-0 flex-1 text-left" onClick={() => setViewing(t)}>
                    <span className="block truncate text-sm font-medium">{t.name}</span>
                    <span className="block text-xs text-fg-muted">{TEAM_ROLE_LABEL[t.role]} · {t.active ? "Active" : "Inactive"}</span>
                  </button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit role for ${t.name}`} onClick={() => { setNewRole(t.role); setEditing(t); }}><UserCog /></Button>
                </li>
              ))}
            </ul>
          </GlassCard>
        </TabsContent>

        <TabsContent value="permissions" className="mt-6">
          <GlassCard className="p-6">
            <CardHeader title="Permissions Matrix" description="Proposed access by role — preview only" action={<Select label="Role" className="w-44" value={matrixRole} onValueChange={(v) => setMatrixRole(v as TeamRole)} options={ROLE_OPTS} />} />
            <Notice tone="warning" className="mt-5" title="UI mockup for future access control">Hiding controls in the frontend is not security. Real authorisation will be enforced by the backend in the functional phase.</Notice>
            <div className="relative mt-5 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead><tr><th className="py-3 text-left text-xs font-medium text-fg-muted">Module</th>{PERMS.map((p) => <th key={p} className="py-3 text-center text-xs font-medium text-fg-muted">{p}</th>)}</tr></thead>
                <tbody>
                  {MODULES.map((m) => (
                    <tr key={m} className="border-t border-subtle">
                      <td className="py-3 text-fg-secondary">{m}</td>
                      {PERMS.map((p) => {
                        const on = MATRIX[matrixRole](m, p);
                        return (
                          <td key={p} className="py-3 text-center">
                            <span className={cn("inline-grid size-6 place-items-center rounded-md", on ? "bg-brand/20 text-brand-cyan" : "bg-overlay/[0.03] text-fg-disabled")} aria-label={`${m} ${p}: ${on ? "allowed" : "not allowed"}`}>
                              {on ? <Check className="size-3.5" strokeWidth={3} /> : <Minus className="size-3.5" />}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </TabsContent>
      </Tabs>

      {/* View user */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        {viewing && (
          <DialogContent title={viewing.name} description={viewing.title}>
            <dl className="grid grid-cols-2 gap-5">
              <Field label="Email" value={viewing.email} />
              <Field label="Role" value={TEAM_ROLE_LABEL[viewing.role]} />
              <Field label="Status" value={viewing.active ? "Active" : "Inactive"} />
              <Field label="Last activity" value={timeAgo(viewing.lastActive)} />
              <Field label="Assigned reviews" value={assigned(viewing.id)} />
              <Field label="Candidates owned" value={candidates.filter((c) => c.recruiterId === viewing.id).length} />
            </dl>
          </DialogContent>
        )}
      </Dialog>

      {/* Edit role */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <DialogContent title="Edit Role" description={`Change the role for ${editing.name}.`} size="sm">
            <Label>Role</Label>
            <Select label="Role" value={newRole} onValueChange={(v) => setNewRole(v as TeamRole)} options={ROLE_OPTS} />
            <DialogFooter>
              <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={() => { setTeamRole(editing.id, newRole); toast.success("Role updated.", { description: `${editing.name} is now ${TEAM_ROLE_LABEL[newRole]}.` }); setEditing(null); }}>Save Role</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <ConfirmationDialog
        open={!!toggling}
        onOpenChange={(o) => !o && setToggling(null)}
        tone={toggling?.active ? "danger" : "default"}
        title={toggling?.active ? `Deactivate ${toggling?.name}?` : `Activate ${toggling?.name}?`}
        description={toggling?.active ? "They will lose access to the recruitment workspace. Their review history is kept." : "They will regain access to the recruitment workspace."}
        confirmLabel={toggling?.active ? "Deactivate" : "Activate"}
        onConfirm={() => { if (toggling) { toggleActive(toggling.id); toast.success(toggling.active ? "User deactivated." : "User activated."); } }}
      />

      {/* Invite */}
      <Dialog open={inviteOpen} onOpenChange={(o) => { setInviteOpen(o); if (!o) form.reset(); }}>
        <DialogContent title="Invite HR User" description="Demo only — no invitation email is sent.">
          <form
            noValidate
            onSubmit={form.handleSubmit((v) => { invite(v.name, v.email, v.role); toast.success("Demo invitation created.", { description: `${v.name} was added as ${TEAM_ROLE_LABEL[v.role]}.` }); setInviteOpen(false); form.reset(); })}
            className="space-y-4"
          >
            <div><Label htmlFor="inv-name">Full name</Label><Input id="inv-name" aria-invalid={!!form.formState.errors.name} {...form.register("name")} /><FieldError>{form.formState.errors.name?.message}</FieldError></div>
            <div><Label htmlFor="inv-email">Work email</Label><Input id="inv-email" type="email" aria-invalid={!!form.formState.errors.email} {...form.register("email")} /><FieldError>{form.formState.errors.email?.message}</FieldError></div>
            <div><Label>Role</Label><Select label="Role" value={form.watch("role")} onValueChange={(v) => form.setValue("role", v as TeamRole)} options={ROLE_OPTS} /></div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setInviteOpen(false)}>Cancel</Button>
              <Button type="submit"><UserPlus />Send Demo Invite</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** API mode renders the PostgreSQL-backed screen; demo mode keeps the original demo screen unchanged. */
export default function TeamPage() {
  return isApiMode ? <ApiTeam /> : <DemoTeamPage />;
}
