"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, PasswordInput } from "@/components/ui/primitives";
import { useAuth } from "@/lib/auth/auth-provider";
import { isApiMode } from "@/lib/config/environment";

const schema = z.object({ fullName: z.string().trim().min(1, "Enter your full name.").max(120, "Use 120 characters or fewer."), email: z.string().trim().email("Enter a valid email address."), password: z.string().min(1, "Choose a password.").max(4096, "Your password is too long."), confirmation: z.string().min(1, "Confirm your password.") }).refine(v => v.password === v.confirmation, { path: ["confirmation"], message: "Passwords do not match." });
type Values = z.infer<typeof schema>;

export function SignupForm() {
  const auth = useAuth(), router = useRouter();
  const lock = useRef(false);
  const [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { fullName: "", email: "", password: "", confirmation: "" } });
  useEffect(() => {
    if (!isApiMode || lock.current) return;
    if (auth.status === "verificationRequired") router.replace("/candidate/verify-email");
    if (auth.status === "profileRequired") router.replace("/candidate/complete-profile");
  }, [auth.status, router]);
  if (!isApiMode) return <div className="space-y-5"><p className="rounded-xl border border-subtle bg-overlay/[0.03] p-4 text-sm text-fg-secondary">Demo Mode uses fictional accounts. No registration or verification email is needed, and no real Firebase account will be created.</p><Button asChild className="w-full" size="lg"><Link href="/candidate/login">Continue to Demo Login<ArrowRight /></Link></Button></div>;
  if (auth.status === "signedIn") return <div className="space-y-4"><p className="text-sm text-fg-secondary">You&apos;re already signed in. Use your existing account to continue.</p><Button asChild className="w-full"><Link href="/candidate/login">Continue with this account</Link></Button></div>;
  const disabled = pending || auth.status === "loading" || auth.status === "unconfigured";
  const submit = async ({ fullName, email, password }: Values) => {
    if (lock.current || disabled) return;
    lock.current = true; setPending(true); setError(null);
    try {
      const result = await auth.register(fullName, email, password);
      setValue("password", ""); setValue("confirmation", "");
      if (result.ok) { router.replace(`/candidate/verify-email?sent=${result.emailSent ? "1" : "0"}`); return; }
      setError(result.message); lock.current = false; setPending(false);
    } catch { setError("Account creation could not finish. Check your connection and try again."); lock.current = false; setPending(false); }
  };
  return <form onSubmit={handleSubmit(submit)} noValidate className="space-y-4" aria-label="Create candidate account">
    {auth.status === "unconfigured" && <p role="alert" className="text-sm text-fg-muted">Account creation is not available yet. Contact the recruitment team.</p>}
    {error && <p role="alert" className="rounded-xl border border-amber-400/30 bg-amber-400/[0.07] p-3 text-sm text-amber-800 dark:text-amber-100">{error}</p>}
    <div><Label htmlFor="signup-name">Full name</Label><Input id="signup-name" autoComplete="name" placeholder="Your full name" disabled={disabled} aria-invalid={!!errors.fullName} aria-describedby={errors.fullName ? "signup-name-error" : undefined} {...register("fullName")} /><FieldError id="signup-name-error">{errors.fullName?.message}</FieldError></div>
    <div><Label htmlFor="signup-email">Email address</Label><Input id="signup-email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="you@example.com" disabled={disabled} aria-invalid={!!errors.email} aria-describedby={errors.email ? "signup-email-error" : undefined} {...register("email")} /><FieldError id="signup-email-error">{errors.email?.message}</FieldError></div>
    <div><Label htmlFor="signup-password">Password</Label><PasswordInput id="signup-password" autoComplete="new-password" placeholder="Create a strong password" disabled={disabled} aria-invalid={!!errors.password} aria-describedby="signup-password-hint signup-password-error" {...register("password")} /><p id="signup-password-hint" className="mt-1.5 text-xs text-fg-muted">Your password must meet the account security requirements.</p><FieldError id="signup-password-error">{errors.password?.message}</FieldError></div>
    <div><Label htmlFor="signup-confirmation">Confirm password</Label><PasswordInput id="signup-confirmation" autoComplete="new-password" placeholder="Enter your password again" disabled={disabled} aria-invalid={!!errors.confirmation} aria-describedby={errors.confirmation ? "signup-confirmation-error" : undefined} {...register("confirmation")} /><FieldError id="signup-confirmation-error">{errors.confirmation?.message}</FieldError></div>
    <Button type="submit" size="lg" className="w-full" loading={pending} disabled={disabled}>Create Account{!pending && <ArrowRight />}</Button>
    <p className="flex items-start gap-2 rounded-xl border border-subtle bg-overlay/[0.03] p-3 text-xs leading-relaxed text-fg-muted"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-cyan" />Creating an account verifies your identity. Interview access still requires an authorized invitation.</p>
    <p className="text-center text-sm text-fg-muted">Already have an account? <Link href="/candidate/login" className="font-semibold text-fg underline decoration-brand/50 underline-offset-4">Sign In</Link></p>
  </form>;
}
