"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter as useNextRouter } from "next/navigation";
import { InterviewOSInlineLoader } from "@/components/ui/interviewos-loader";

type Navigation = { run: (action: () => void) => void; navigate: (href: string, replace?: boolean, scroll?: boolean) => void };
const NavigationContext = createContext<Navigation | null>(null);
const NavigationStatusContext = createContext({ pending: false, delayed: false, retry: () => {} });
export function useNavigation() { return useContext(NavigationContext); }

/** React retains the live page while the router prepares its replacement. No copied DOM or cached auth UI. */
export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const router = useNextRouter();
  const [pending, startTransition] = useTransition();
  const [delayed, setDelayed] = useState(false);
  const latest = useRef<(() => void) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDelayed(true), 20000);
  }, []);
  const run = useCallback((action: () => void) => {
    latest.current = action;
    setDelayed(false);
    armTimer();
    startTransition(action);
  }, [armTimer]);
  const retry = useCallback(() => { if (latest.current) run(latest.current); }, [run]);
  const navigate = useCallback((href: string, replace?: boolean, scroll?: boolean) => run(() => {
    if (replace) router.replace(href, { scroll }); else router.push(href, { scroll });
  }), [router, run]);
  useEffect(() => {
    if (!pending) {
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      setDelayed(false);
    }
  }, [pending]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  // Link consumers receive stable actions, so a pending change doesn't rerender every table link.
  const value = useMemo(() => ({ run, navigate }), [run, navigate]);
  const status = useMemo(() => ({ pending, delayed, retry }), [pending, delayed, retry]);
  return <NavigationContext.Provider value={value}><NavigationStatusContext.Provider value={status}>{children}</NavigationStatusContext.Provider></NavigationContext.Provider>;
}

/** Optional context keeps isolated component tests and non-app consumers compatible. */
export function useRouter() {
  const router = useNextRouter();
  const navigation = useContext(NavigationContext);
  const run = navigation?.run;
  return useMemo(() => !run ? router : ({
    ...router,
    push: (...args: Parameters<typeof router.push>) => run(() => router.push(...args)),
    replace: (...args: Parameters<typeof router.replace>) => run(() => router.replace(...args)),
    back: () => run(() => router.back()),
    forward: () => run(() => router.forward()),
    refresh: () => run(() => router.refresh()),
  }), [router, run]);
}

export function RouteFeedback() {
  const navigation = useContext(NavigationStatusContext);
  if (!navigation.pending) return null;
  return <div data-navigation-feedback className="absolute right-4 top-1 z-20 max-w-[calc(100%-2rem)] rounded-lg border border-subtle bg-panel px-3 py-2 shadow-sm">
    {navigation.delayed ? <div className="text-xs text-fg-secondary"><p role="status">This page is taking longer to open. Check your connection.</p><button type="button" className="mt-1 min-h-8 font-medium text-brand-cyan underline" onClick={navigation.retry}>Retry page</button></div> : <InterviewOSInlineLoader variant="route" message="Opening page…" />}
  </div>;
}
