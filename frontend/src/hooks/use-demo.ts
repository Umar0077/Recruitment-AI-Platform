"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useDemoStore } from "@/lib/demo/store";

/**
 * True once the persisted demo store has been restored from localStorage.
 * Always false during server rendering (there is no localStorage there), so
 * store-backed screens render a skeleton first and never mismatch on hydration.
 */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const api = useDemoStore.persist;
    if (!api) return;
    const unsub = api.onFinishHydration(() => setHydrated(true));
    if (api.hasHydrated()) setHydrated(true);
    else void api.rehydrate();
    return unsub;
  }, []);
  return hydrated;
}

export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** OS-level reduced motion, or the in-app Settings › Appearance › Reduce motion preference. */
export function usePrefersReducedMotion() {
  const media = useMediaQuery("(prefers-reduced-motion: reduce)");
  const setting = useDemoStore((s) => s.settings.reduceMotion);
  return media || setting;
}
