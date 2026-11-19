"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "@/components/navigation/link";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/components/navigation/provider";
import { CheckCircle2, MailCheck } from "lucide-react";
import { AuthFrame } from "./auth-frame";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-provider";
import { isApiMode } from "@/lib/config/environment";
import { requestEmailVerification } from "@/lib/firebase/password-auth";
import { authErrorCode, authErrorMessage } from "@/lib/firebase/errors";

const INTERVAL = 15_000;
const TIMEOUT = 10 * 60_000;
function VerificationContent() {
  const auth = useAuth(), router = useRouter(), params = useSearchParams();
  const checkVerification = auth.checkVerification;
  const login = params.get("area") === "admin" ? "/admin/login" : "/candidate/login";
  const [success, setSuccess] = useState(false), [timedOut, setTimedOut] = useState(false);
  const [pending, setPending] = useState<"check" | "send" | "out" | null>(null);
  const [error, setError] = useState<string | null>(null), [message, setMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(params.get("sent") === "1" ? 60 : 0);
  const busy = useRef(false), leaving = useRef(false), mounted = useRef(false);
  const deadline = useRef(0), lastCheck = useRef(0);
  useEffect(() => { mounted.current = true; deadline.current = Date.now() + TIMEOUT; return () => { mounted.current = false; }; }, []);
  const check = useCallback(async (manual = false) => {
    if (!isApiMode || busy.current || leaving.current) return;
    if (!manual && Date.now() >= deadline.current) { setTimedOut(true); return; }
    if (!manual && (document.hidden || Date.now() - lastCheck.current < INTERVAL)) return;
    busy.current = true; lastCheck.current = Date.now();
    if (manual) { setPending("check"); setError(null); setMessage(null); }
    try {
      const verified = await checkVerification();
      if (!mounted.current) return;
      if (verified) { leaving.current = true; setSuccess(true); setError(null); }
      else if (manual) setMessage("Verification is still pending. Open the link in your email, then check again.");
    } catch (e) { if (mounted.current) setError(authErrorMessage(authErrorCode(e))); }
    finally { busy.current = false; if (mounted.current) setPending(null); }
  }, [checkVerification]);
  useEffect(() => {
    if (!isApiMode || auth.status !== "verificationRequired" || success || timedOut) return;
    void check();
    const timer = setInterval(() => void check(), INTERVAL);
    const resume = () => void check();
    document.addEventListener("visibilitychange", resume); window.addEventListener("focus", resume);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", resume); window.removeEventListener("focus", resume); };
  }, [auth.status, check, success, timedOut]);
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => router.replace(`${login}?verified=1`), 1500);
    return () => clearTimeout(timer);
  }, [success, login, router]);
  useEffect(() => {
    if (!isApiMode || busy.current || leaving.current || success) return;
    if (["signedOut", "signedIn", "profileRequired"].includes(auth.status)) router.replace(login);
  }, [auth.status, login, router, success]);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(v => Math.max(0, v - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  const resend = async () => {
    if (busy.current || cooldown || leaving.current) return;
    busy.current = true; setPending("send"); setError(null); setMessage(null);
    try {
      const result = await requestEmailVerification();
      if (!mounted.current) return;
      if (result.ok) { setCooldown(60); setMessage("Verification email sent. Check your inbox and spam folder."); }
      else setError(result.message);
    } catch (e) { if (mounted.current) setError(authErrorMessage(authErrorCode(e))); }
    finally { busy.current = false; if (mounted.current) setPending(null); }
  };
  const back = async () => {
    if (busy.current || leaving.current) return;
    busy.current = true; setPending("out"); setError(null);
    try { await auth.signOut(); leaving.current = true; router.replace(login); }
    catch (e) { if (mounted.current) setError(authErrorMessage(authErrorCode(e))); }
    finally { busy.current = false; if (mounted.current) setPending(null); }
  };
  if (!isApiMode) return <p className="text-sm text-fg-secondary">Demo Mode needs no email verification. <Link className="underline" href="/candidate/login">Continue to Demo Login</Link>.</p>;
  if (success) return <div role="status" className="space-y-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-6 text-center"><CheckCircle2 className="mx-auto size-10 text-emerald-600 dark:text-emerald-400" /><h2 className="text-lg font-semibold">Email verified successfully</h2><p className="text-sm text-fg-secondary">Please sign in. Taking you back to Login…</p></div>;
  const disabled = !!pending || auth.status !== "verificationRequired";
  return <div className="space-y-4">
    <div className="rounded-2xl border border-subtle bg-overlay/[0.03] p-5"><MailCheck className="mb-3 size-7 text-brand-cyan" /><p className="text-sm leading-relaxed text-fg-secondary">{params.get("sent") === "1" ? "We've sent a verification link to your email address. Open the link to verify your account and continue." : "Open the verification link in your email to confirm your account. You can request a new link below."}</p><p className="mt-3 break-words text-sm font-semibold">{auth.user?.email}</p><span className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-fg-muted"><span className="size-1.5 rounded-full bg-amber-500" />Verification pending</span></div>
    {(error || auth.notice?.message) && <p role="alert" className="text-sm text-amber-800 dark:text-amber-100">{error ?? auth.notice?.message}</p>}
    {message && <p role="status" className="text-sm text-fg-secondary">{message}</p>}
    {timedOut && <p role="status" className="text-sm text-fg-muted">Automatic checking has paused. Use the button below after verifying your email.</p>}
    <Button className="w-full" size="lg" disabled={disabled} loading={pending === "check"} onClick={() => void check(true)}>I&apos;ve Verified My Email</Button>
    <Button className="w-full" size="lg" variant="secondary" disabled={disabled || cooldown > 0} loading={pending === "send"} onClick={() => void resend()}>{cooldown ? `Resend in ${cooldown}s` : "Resend Verification Email"}</Button>
    <p className="text-xs leading-relaxed text-fg-muted">If a link expired or was already used, check your status first, then request a new link if needed. Verification on another device works too.</p>
    <div className="flex flex-wrap justify-between gap-2 text-sm"><button type="button" disabled={disabled} onClick={() => void back()} className="rounded-md py-2 text-fg-secondary hover:text-fg disabled:opacity-50">Back to Login</button><button type="button" disabled={disabled} onClick={() => void back()} className="rounded-md py-2 text-fg-secondary hover:text-fg disabled:opacity-50">Use a different email</button></div>
    <p className="text-center text-xs text-fg-muted">Signing out keeps your account. You can sign in again or register with another email.</p>
  </div>;
}
export function VerificationScreen() {
  return <AuthFrame title="Verify Your Email Address" description="One last step to confirm it's you."><Suspense fallback={<p className="text-sm text-fg-muted">Loading your account…</p>}><VerificationContent /></Suspense></AuthFrame>;
}
