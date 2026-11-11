"use client";
/**
 * UI DEMO MODE ONLY.
 * Accepts any non-empty email and password, makes no network request, and discards the
 * password immediately after local validation. It is isolated here so production
 * authentication can replace this component without redesigning the screens.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, PasswordInput } from "@/components/ui/primitives";
import { useDemoStore } from "@/lib/demo/store";

const schema = z.object({
  email: z.string().trim().min(1, "Enter your email address."),
  password: z.string().min(1, "Enter your password."),
});
type Values = z.infer<typeof schema>;

export function DemoLoginForm({ role, redirectTo, submitLabel }: { role: "candidate" | "admin"; redirectTo: string | (() => string); submitLabel: string }) {
  const router = useRouter();
  const startSession = useDemoStore((s) => s.startSession);
  const [pending, setPending] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  const onSubmit = ({ email }: Values) => {
    // The password is validated as non-empty and then dropped: never stored, logged, or sent.
    reset({ email, password: "" });
    setPending(true);
    startSession(role, email);
    toast.success("Signed in to the demo.", { description: "UI Preview Mode — no real authentication took place." });
    setTimeout(() => router.push(typeof redirectTo === "function" ? redirectTo() : redirectTo), 350);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <div>
        <Label htmlFor={`${role}-email`}>Email address</Label>
        <Input id={`${role}-email`} type="email" autoComplete="off" placeholder="you@example.com" aria-invalid={!!errors.email} aria-describedby={errors.email ? `${role}-email-err` : undefined} {...register("email")} />
        <FieldError id={`${role}-email-err`}>{errors.email?.message}</FieldError>
      </div>
      <div>
        <Label htmlFor={`${role}-password`}>Password</Label>
        <PasswordInput id={`${role}-password`} autoComplete="off" placeholder="••••••••" aria-invalid={!!errors.password} aria-describedby={errors.password ? `${role}-pw-err` : undefined} {...register("password")} />
        <FieldError id={`${role}-pw-err`}>{errors.password?.message}</FieldError>
      </div>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        {submitLabel}
        {!pending && <ArrowRight />}
      </Button>
      <div className="flex items-start gap-2.5 rounded-xl border border-indigo-400/25 bg-indigo-400/[0.06] p-3 text-xs leading-relaxed text-indigo-700 dark:text-indigo-100">
        <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          <span className="font-semibold">UI Demo Mode.</span> Any email and password will work. Nothing is sent to a server and your password is not stored.
        </p>
      </div>
    </form>
  );
}
