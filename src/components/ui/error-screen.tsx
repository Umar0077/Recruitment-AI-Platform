import Link from "next/link";
import { AppLogo } from "./brand";
import { Button } from "./button";
import { ThemeToggle } from "./theme-toggle";

export function ErrorScreen({
  icon,
  code,
  title,
  body,
  primary,
  secondary,
  onRetry,
  extra,
}: {
  icon: React.ReactNode;
  code?: string;
  title: string;
  body: string;
  primary?: { label: string; href: string };
  secondary?: { label: string; href: string };
  onRetry?: () => void;
  /** Optional extra action rendered after the links (e.g. a sign-out button). */
  extra?: React.ReactNode;
}) {
  return (
    <div className="app-backdrop relative flex min-h-dvh flex-col">
      <div className="bg-grid bg-grid-fade pointer-events-none absolute inset-0 opacity-50" aria-hidden />
      <header className="container relative z-10 flex h-20 items-center">
        <AppLogo size="sm" />
        <ThemeToggle className="ml-auto" />
      </header>
      <main className="container relative z-10 flex flex-1 flex-col items-center justify-center pb-24 text-center">
        <div className="relative mb-8">
          <div className="absolute -inset-8 rounded-full bg-brand/20 blur-3xl" aria-hidden />
          <div className="relative grid size-20 place-items-center rounded-3xl border border-glow/50 bg-gradient-to-b from-overlay/[0.08] to-overlay/[0.02] text-brand-cyan [&_svg]:size-9">{icon}</div>
        </div>
        {code && <p className="font-display text-sm font-bold tracking-[0.3em] text-brand-electric">{code}</p>}
        <h1 className="mt-3 max-w-xl text-[30px] font-bold leading-tight sm:text-[40px]">{title}</h1>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-fg-muted">{body}</p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row">
          {onRetry && <Button size="lg" onClick={onRetry}>Try Again</Button>}
          {primary && (
            <Button size="lg" asChild variant={onRetry ? "secondary" : "primary"}>
              {primary.href.startsWith("mailto:") ? <a href={primary.href}>{primary.label}</a> : <Link href={primary.href}>{primary.label}</Link>}
            </Button>
          )}
          {secondary && (
            <Button size="lg" variant="secondary" asChild>
              <Link href={secondary.href}>{secondary.label}</Link>
            </Button>
          )}
          {extra}
        </div>
      </main>
    </div>
  );
}
