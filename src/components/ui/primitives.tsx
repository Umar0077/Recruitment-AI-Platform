"use client";
/** Small shared primitives: cards, badges, inputs, labels, avatar, progress, skeletons. */
import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { Check, Eye, EyeOff, Search } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import type { Tone } from "@/lib/demo/statuses";

/* ---------- Cards ---------- */
export function GlassCard({ className, glow, as: As = "div", ...props }: React.HTMLAttributes<HTMLDivElement> & { glow?: boolean; as?: "div" | "section" | "article" | "aside" }) {
  return <As className={cn("surface rounded-xl", glow && "surface-glow", className)} {...props} />;
}

export function CardHeader({ title, description, action, className, icon }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string; icon?: React.ReactNode }) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg border border-subtle bg-overlay/[0.04] text-brand-cyan [&_svg]:size-4">{icon}</div>}
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-fg">{title}</h3>
          {description && <p className="mt-0.5 text-[13px] text-fg-muted">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ---------- Badges ---------- */
const toneClass: Record<Tone, string> = {
  neutral: "border-slate-400/20 bg-slate-400/10 text-slate-700 dark:text-slate-300",
  blue: "border-blue-400/25 bg-blue-500/10 text-blue-700 dark:text-blue-200",
  cyan: "border-sky-400/25 bg-sky-400/10 text-sky-700 dark:text-sky-200",
  indigo: "border-indigo-400/25 bg-indigo-400/10 text-indigo-700 dark:text-indigo-200",
  success: "border-emerald-400/25 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200",
  warning: "border-amber-400/25 bg-amber-400/10 text-amber-700 dark:text-amber-200",
  danger: "border-red-400/25 bg-red-400/10 text-red-700 dark:text-red-200",
};
const dotClass: Record<Tone, string> = {
  neutral: "bg-slate-400",
  blue: "bg-blue-400",
  cyan: "bg-sky-400",
  indigo: "bg-indigo-400",
  success: "bg-emerald-400",
  warning: "bg-amber-400",
  danger: "bg-red-400",
};

export function Badge({ tone = "neutral", dot = true, className, children }: { tone?: Tone; dot?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-medium", toneClass[tone], className)}>
      {dot && <span className={cn("size-1.5 rounded-full", dotClass[tone])} aria-hidden />}
      {children}
    </span>
  );
}

export function Pill({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex h-6 items-center rounded-md border border-subtle bg-overlay/[0.04] px-2 text-xs text-fg-secondary", className)}>{children}</span>;
}

/* ---------- Form controls ---------- */
export const Label = ({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={cn("mb-1.5 block text-[13px] font-medium text-fg-secondary", className)} {...props} />
);

const fieldBase =
  "w-full rounded-xl border border-subtle bg-white px-3.5 dark:bg-ink-950/60 text-sm text-fg placeholder:text-fg-disabled transition-colors duration-micro hover:border-slate-400/25 focus:border-brand-electric/70 focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:opacity-50 aria-[invalid=true]:border-danger/60";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(fieldBase, "h-11", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(fieldBase, "min-h-[96px] py-3 leading-relaxed", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const PasswordInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => {
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <input ref={ref} type={show ? "text" : "password"} className={cn(fieldBase, "h-11 pr-11", className)} {...props} />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-overlay/5 hover:text-fg"
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";

export function SearchInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" aria-hidden />
      <input type="search" className={cn(fieldBase, "h-10 pl-9")} {...props} />
    </div>
  );
}

export const FieldError = ({ id, children }: { id?: string; children?: React.ReactNode }) =>
  children ? (
    <p id={id} role="alert" className="mt-1.5 text-xs text-red-700 dark:text-red-300">
      {children}
    </p>
  ) : null;

export function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "peer grid size-5 shrink-0 place-items-center rounded-md border border-slate-400/40 bg-ink-950/60 transition-colors duration-micro hover:border-brand-electric focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan/70 data-[state=checked]:border-brand data-[state=checked]:bg-brand",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <Check className="size-3.5 text-white" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-subtle bg-overlay/10 transition-colors duration-button focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan/70 data-[state=checked]:border-brand/60 data-[state=checked]:bg-brand",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-[18px] translate-x-[3px] rounded-full bg-white shadow transition-transform duration-button ease-premium data-[state=checked]:translate-x-[21px]" />
    </SwitchPrimitive.Root>
  );
}

/* ---------- Avatar ---------- */
const avatarHues = ["from-blue-500 to-indigo-500", "from-sky-500 to-blue-600", "from-indigo-500 to-blue-500", "from-blue-600 to-sky-400", "from-indigo-400 to-sky-500"];
export function CandidateAvatar({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const hue = avatarHues[name.length % avatarHues.length];
  const sz = { sm: "size-7 text-[11px]", md: "size-9 text-xs", lg: "size-12 text-sm", xl: "size-16 text-lg" }[size];
  return (
    <span className={cn("relative inline-grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-semibold text-white ring-1 ring-overlay/15", hue, sz, className)} aria-hidden>
      {initials(name)}
    </span>
  );
}

/* ---------- Progress ---------- */
export function ProgressBar({ value, className, tone = "brand", label }: { value: number; className?: string; tone?: "brand" | "success"; label?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-overlay/[0.07]", className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-700 ease-premium", tone === "brand" ? "bg-gradient-to-r from-brand to-brand-cyan" : "bg-success")}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

/* ---------- Skeletons ---------- */
export const Skeleton = ({ className }: { className?: string }) => <div className={cn("skeleton", className)} aria-hidden />;

export function SkeletonTable({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="size-9 rounded-full" />
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="ml-auto h-6 w-24 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonPage() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading content">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}

/* ---------- Key / value ---------- */
export function Field({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm text-fg">{value}</dd>
    </div>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-subtle bg-overlay/[0.05] px-1 font-sans text-[10px] text-fg-muted">{children}</kbd>;
}
