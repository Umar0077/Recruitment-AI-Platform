"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/auth-provider";
import { isApiMode } from "@/lib/config/environment";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/primitives";
type Account = { id: string; email: string; mustChangePassword: boolean; user: { id: string; displayName: string; status: string; roles: { role: { code: string } }[] } };
const roles = ["HR_MANAGER", "RECRUITER", "REVIEWER"];
export default function Accounts() {
  const auth = useAuth(), qc = useQueryClient(); const [message, setMessage] = useState("");
  const allowed = isApiMode && auth.status === "signedIn" && !!auth.profile?.roles.includes("SUPER_ADMIN") && !auth.profile.mustChangePassword;
  const accounts = useQuery({ queryKey: ["admin-accounts"], queryFn: () => apiRequest<Account[]>("/admin-auth/accounts", { admin: true }).then(r => r.data), enabled: allowed });
  const history = useQuery({ queryKey: ["admin-access-audit"], queryFn: () => apiRequest<{ id: string; action: string; createdAt: string }[]>("/admin-auth/audit", { admin: true }).then(r => r.data), enabled: allowed });
  const update = useMutation({ mutationFn: ({ id, body }: { id: string; body: object }) => apiRequest(`/admin-auth/accounts/${id}`, { admin: true, method: "PATCH", body }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ["admin-accounts"] }); void qc.invalidateQueries({ queryKey: ["admin-access-audit"] }); }, onError: e => setMessage(e.message) });
  const create = useMutation({ mutationFn: (body: object) => apiRequest("/admin-auth/accounts", { admin: true, method: "POST", body }), onSuccess: () => { setMessage("Administrator created. They must change their temporary password on first sign-in."); void qc.invalidateQueries({ queryKey: ["admin-accounts"] }); }, onError: e => setMessage(e.message) });
  if (!allowed) return <p>Administrator account management requires a Super Admin session. Demo mode does not modify real accounts.</p>;
  return <div className="space-y-6"><h1 className="text-3xl font-bold">Administrator Accounts</h1><p className="text-fg-muted">Create staff access and manage roles. Recovery is performed by an authorized server operator using the audited recovery command; passwords cannot be retrieved.</p>
    <GlassCard className="p-6"><h2 className="text-lg font-semibold">Create Admin</h2><form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); if (create.isPending) return; const form = e.currentTarget; const d = new FormData(form); create.mutate(Object.fromEntries(d.entries()), { onSuccess: () => form.reset(), onSettled: () => { (form.elements.namedItem("password") as HTMLInputElement).value = ""; } }); }}>
      {[["Full name", "fullName", "text"],["Email", "email", "email"],["Temporary password", "password", "password"]].map(([label,name,type]) => <label key={name}>{label}<input className="mt-1 w-full rounded-xl border border-subtle bg-transparent p-3" name={name} type={type} required autoComplete={type === "password" ? "new-password" : "off"} minLength={type === "password" ? 14 : 2} maxLength={name === "email" ? 254 : 120} /></label>)}
      <label>HR role<select name="role" className="mt-1 w-full rounded-xl border border-subtle bg-surface p-3">{roles.map(r => <option key={r}>{r}</option>)}</select></label><p className="text-xs text-fg-muted">Use a unique 14+ character temporary password with uppercase, lowercase, numbers and a symbol. Share it through your organization’s secure credential channel.</p><Button type="submit" loading={create.isPending}>Create Admin</Button>
    </form></GlassCard>
    {(message || accounts.error) && <p role="status">{message || accounts.error?.message}</p>}
    {accounts.isPending && <p>Loading administrator accounts…</p>}
    <div className="space-y-3">{accounts.data?.map(a => { const protectedAccount = a.user.roles.some(r => r.role.code === "SUPER_ADMIN"); return <GlassCard key={a.id} className="flex flex-wrap items-center gap-4 p-5"><div className="mr-auto"><h2 className="font-semibold">{a.user.displayName}</h2><p>{a.email}</p><p className="text-sm text-fg-muted">{a.user.status} · {a.mustChangePassword ? "Password change required" : "Password configured"}</p></div>{protectedAccount ? <span>SUPER_ADMIN</span> : <><select aria-label={`Role for ${a.email}`} value={a.user.roles[0]?.role.code ?? "REVIEWER"} disabled={update.isPending} onChange={e => update.mutate({ id: a.id, body: { role: e.target.value } })}>{roles.map(r => <option key={r}>{r}</option>)}</select><Button variant="secondary" disabled={update.isPending} onClick={() => update.mutate({ id: a.id, body: { active: a.user.status !== "ACTIVE" } })}>{a.user.status === "ACTIVE" ? "Deactivate" : "Activate"}</Button><Button variant="secondary" disabled={update.isPending} onClick={() => update.mutate({ id: a.id, body: { revoke: true } })}>Revoke Sessions</Button></>}</GlassCard>; })}</div>
    <GlassCard className="p-6"><h2 className="font-semibold">Recent Access Audit</h2>{history.error && <p>Audit history could not be loaded.</p>}<ul className="mt-3 space-y-2 text-sm">{history.data?.map(e => <li key={e.id}>{new Date(e.createdAt).toLocaleString()} · {e.action}</li>)}</ul></GlassCard>
  </div>;
}
