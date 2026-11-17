"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthFrame } from "./auth-frame";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/primitives";
import { useAuth } from "@/lib/auth/auth-provider";
import { isApiMode } from "@/lib/config/environment";

export function CompleteProfile({ area }: { area: "candidate" | "admin" }) {
  const auth = useAuth(), router = useRouter();
  const [name, setName] = useState(auth.user?.displayName ?? ""), [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  useEffect(() => {
    if (!isApiMode) return;
    if (auth.status === "signedOut" || auth.status === "signedIn") router.replace(`/${area}/login`);
    if (auth.status === "verificationRequired") router.replace(`/candidate/verify-email?area=${area}`);
  }, [auth.status, area, router]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy.current) return;
    if (!name.trim() || name.trim().length > 120) { setError("Enter your full name using 120 characters or fewer."); return; }
    busy.current = true; setPending(true); setError(null);
    try { const result = await auth.completeProfile(name); if (!result.ok) setError(result.message); }
    catch { setError("Your profile could not be saved. Please try again."); }
    finally { busy.current = false; setPending(false); }
  };
  return <AuthFrame title="Complete Your Profile" description="Tell us how you'd like to be addressed." eyebrow={area === "admin" ? "Recruiter access" : "Candidate access"}>
    {!isApiMode ? <p className="text-sm text-fg-secondary">Demo Mode uses fictional profiles. <Link className="underline" href={`/${area}/login`}>Continue to Demo Login</Link>.</p> : <form onSubmit={submit} className="space-y-5" noValidate>
      <p className="text-sm text-fg-muted">Add your full name to your account. Official application details stay with your recruitment record.</p>
      {(error || auth.notice?.message) && <p role="alert" className="text-sm text-amber-800 dark:text-amber-100">{error ?? auth.notice?.message}</p>}
      <div><Label htmlFor="profile-name">Full name</Label><Input id="profile-name" autoComplete="name" value={name} onChange={e => setName(e.target.value)} disabled={pending} maxLength={120} placeholder="Your full name" aria-invalid={!!error} /></div>
      <Button type="submit" size="lg" className="w-full" loading={pending} disabled={pending || !["profileRequired", "error"].includes(auth.status)}>Save and Continue</Button>
      <button type="button" className="w-full rounded-md py-2 text-sm text-fg-muted" disabled={pending} onClick={() => void auth.signOut().catch(() => setError("Sign-out could not finish. Please try again."))}>Sign out</button>
    </form>}
  </AuthFrame>;
}
