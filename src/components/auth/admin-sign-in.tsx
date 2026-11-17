"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-provider";
import { Button } from "@/components/ui/button";
export function AdminSignIn() {
  const auth = useAuth(); const router = useRouter(); const busy = useRef(false);
  const [pending, setPending] = useState(false), [show, setShow] = useState(false), [error, setError] = useState("");
  useEffect(() => { if (auth.status === "signedIn" && auth.profile?.isStaff) router.replace(auth.profile.mustChangePassword ? "/admin/settings/security" : "/admin"); }, [auth.status, auth.profile, router]);
  return <form className="space-y-4" onSubmit={async e => { e.preventDefault(); if (busy.current) return; const form = e.currentTarget; const data = new FormData(form); busy.current = true; setPending(true); setError(""); try { const result = await auth.signInWithEmail(String(data.get("email")), String(data.get("password"))); if (!result.ok) setError(result.message); } finally { const field = form.elements.namedItem("password") as HTMLInputElement; field.value = ""; busy.current = false; setPending(false); } }}>
    <label className="block text-sm">Email Address<input className="input mt-2 w-full rounded-xl border border-subtle bg-transparent p-3" name="email" type="email" autoComplete="username" required maxLength={254} /></label>
    <label className="block text-sm">Password<input className="input mt-2 w-full rounded-xl border border-subtle bg-transparent p-3" name="password" type={show ? "text" : "password"} autoComplete="current-password" required maxLength={128} /></label>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} />Show password</label>
    {(error || auth.notice) && <p role="alert" className="text-sm text-danger">{error || auth.notice?.message}</p>}
    <Button type="submit" className="w-full" loading={pending} disabled={auth.status === "loading"}>{pending ? "Signing you in…" : "Sign In"}</Button>
    {auth.status === "error" && <Button type="button" variant="secondary" onClick={() => void auth.refresh()}>Retry connection</Button>}
    <p className="text-xs text-fg-muted">Administrator accounts are provisioned by your organization. Contact the server operator if you need access recovery.</p>
  </form>;
}
