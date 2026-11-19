"use client";
import Link from "@/components/navigation/link";
import { useRef, useState } from "react";
import { useRouter } from "@/components/navigation/provider";
import { useAuth } from "@/lib/auth/auth-provider";
import { useAccessGate } from "@/lib/auth/use-access-gate";
import { apiRequest } from "@/lib/api/client";
import { isApiMode } from "@/lib/config/environment";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/primitives";
import { PoweredByConnectivo } from "@/components/ui/powered-by";
export default function AdminSecurity() {
  const ready = useAccessGate("admin"), auth = useAuth(), router = useRouter(), lock = useRef(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  if (!ready) return <p role="status" className="p-10">Loading account security…</p>;
  return <main className="mx-auto max-w-xl px-5 py-14"><GlassCard className="p-8">
    <h1 className="text-3xl font-bold">Account Security</h1>
    <p className="mt-3 text-fg-muted">{auth.profile?.mustChangePassword ? "Change your temporary password before opening the administrator workspace." : "Update your password or sign out all active sessions."}</p>
    <p className="mt-4 text-sm text-fg-muted">Use 14–128 characters with uppercase and lowercase letters, a number and a symbol. A unique passphrase is easier to remember. All sessions will be signed out after a successful change.</p>
    <form className="mt-6 space-y-4" onSubmit={async e => { e.preventDefault(); if (lock.current || !isApiMode) return; const form = e.currentTarget, data = new FormData(form); if (data.get("newPassword") !== data.get("confirm")) { setMessage("New passwords do not match."); return; } lock.current = true; setBusy(true); setMessage(""); try { await apiRequest("/admin-auth/change-password", { admin: true, method: "POST", body: { currentPassword: data.get("currentPassword"), newPassword: data.get("newPassword") } }); form.reset(); setMessage("Password changed successfully. Sign in with your new password."); await auth.refresh(); router.replace("/admin/login?passwordChanged=1"); } catch (err) { setMessage(err instanceof Error ? err.message : "Password change failed."); } finally { lock.current = false; setBusy(false); } }}>
      {[['Current Password','currentPassword'],['New Password','newPassword'],['Confirm New Password','confirm']].map(([label,name]) => <label key={name} className="block text-sm">{label}<input className="mt-2 w-full rounded-xl border border-subtle bg-transparent p-3" type="password" name={name} required maxLength={128} minLength={name === "currentPassword" ? 1 : 14} autoComplete={name === "currentPassword" ? "current-password" : "new-password"} /></label>)}
      {message && <p role="status" className="text-sm">{message}</p>}
      <Button type="submit" loading={busy} disabled={!isApiMode}>Change Password</Button>
    </form>
    {!auth.profile?.mustChangePassword && <div className="mt-5 flex gap-4"><Button variant="secondary" disabled={!isApiMode || busy} onClick={async () => { setBusy(true); try { await apiRequest("/admin-auth/revoke-sessions", { admin: true, method: "POST" }); await auth.refresh(); router.replace("/admin/login"); } catch { setMessage("Could not revoke sessions. Please retry."); } finally { setBusy(false); } }}>Sign Out All Sessions</Button><Link href="/admin">Back to workspace</Link></div>}
    {!isApiMode && <p className="mt-4">Demo mode does not change real credentials.</p>}
    <div className="mt-8"><PoweredByConnectivo /></div>
  </GlassCard></main>;
}
