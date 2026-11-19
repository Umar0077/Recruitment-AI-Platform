"use client";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, PasswordInput } from "@/components/ui/primitives";
import { useAuth } from "@/lib/auth/auth-provider";
import { PASSWORD_RESET_MESSAGE, requestPasswordReset } from "@/lib/firebase/password-auth";


const schema = z.object({ email: z.string().trim().email("Enter a valid email address."), password: z.string().min(1, "Enter your password.") });
type Values = z.infer<typeof schema>;

export function EmailSignIn({ area, disabled, onPending }: { area: "candidate" | "admin"; disabled: boolean; onPending: (pending: boolean) => void }) {
  const auth = useAuth();
  const busy = useRef(false);
  const [resetMode, setResetMode] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, setValue, getValues, trigger, clearErrors, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  const submit = async ({ email, password }: Values) => {
    if (disabled || busy.current) return;
    busy.current = true;
    setError(null); setPending(true); onPending(true);
    // Drop the field value immediately; only Firebase receives this temporary argument.
    setValue("password", "");
    try {
      const result = await auth.signInWithEmail(email, password);
      if (!result.ok) setError(result.message);
    } finally { busy.current = false; setPending(false); onPending(false); }
  };
  const resetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (disabled || busy.current || sent) return;
    busy.current = true;
    if (!await trigger("email")) { busy.current = false; return; }
    setError(null); setPending(true); onPending(true);
    try {
      const result = await requestPasswordReset(getValues("email"));
      if (result.ok) setSent(true); else setError(result.message);
    } finally { busy.current = false; setPending(false); onPending(false); }
  };
  const changeMode = (reset: boolean) => {
    setValue("password", ""); clearErrors(); setError(null); setSent(false); setResetMode(reset); auth.clearNotice();
  };

  return (
    <form noValidate onSubmit={resetMode ? resetPassword : handleSubmit(submit)} className="space-y-4" aria-label={resetMode ? "Reset password" : "Email sign-in"}>
      {resetMode && <div><h2 className="text-lg font-semibold">Reset your password</h2><p className="mt-1 text-sm text-fg-muted">We&apos;ll email instructions to reset your password.</p></div>}
      {error && <p role="alert" className="rounded-xl border border-amber-400/30 bg-amber-400/[0.07] p-3 text-sm text-amber-800 dark:text-amber-100">{error}</p>}
      {sent ? <p role="status" className="rounded-xl border border-subtle bg-overlay/[0.03] p-3 text-sm text-fg-secondary">{PASSWORD_RESET_MESSAGE}</p> : <>
        <div>
          <Label htmlFor={`${area}-auth-email`}>Email address</Label>
          <Input id={`${area}-auth-email`} type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="you@example.com" disabled={disabled || pending} aria-invalid={!!errors.email} aria-describedby={errors.email ? `${area}-auth-email-error` : undefined} {...register("email")} />
          <FieldError id={`${area}-auth-email-error`}>{errors.email?.message}</FieldError>
        </div>
        {!resetMode && <div>
          <Label htmlFor={`${area}-auth-password`}>Password</Label>
          <PasswordInput id={`${area}-auth-password`} autoComplete="current-password" placeholder="Enter your password" disabled={disabled || pending} aria-invalid={!!errors.password} aria-describedby={errors.password ? `${area}-auth-password-error` : undefined} {...register("password")} />
          <FieldError id={`${area}-auth-password-error`}>{errors.password?.message}</FieldError>
          <div className="mt-2 flex justify-end"><button type="button" disabled={disabled || pending} onClick={() => changeMode(true)} className="rounded-md py-1 text-xs font-medium text-fg-secondary transition-colors hover:text-fg disabled:opacity-50">Forgot password?</button></div>
        </div>}
        <Button type="submit" size="lg" className="w-full" loading={pending} disabled={disabled || pending}>
          {pending ? resetMode ? "Sending reset email…" : "Signing you in…" : resetMode ? "Send reset email" : "Sign In"}{!pending && <ArrowRight />}
        </Button>
      </>}
      {resetMode && <button type="button" disabled={pending} onClick={() => changeMode(false)} className="inline-flex items-center gap-1.5 rounded-md py-1 text-sm text-fg-secondary hover:text-fg"><ArrowLeft className="size-4" />Back to sign in</button>}
    </form>
  );
}

