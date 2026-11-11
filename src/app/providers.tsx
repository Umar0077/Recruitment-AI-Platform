"use client";
import { useEffect } from "react";
import { ThemeProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";
import { MotionConfig } from "motion/react";
import { TooltipProvider } from "@/components/ui/overlays";
import { useHydrated } from "@/hooks/use-demo";
import { useDemoStore } from "@/lib/demo/store";
import { AuthProvider } from "@/lib/auth/auth-provider";
import { QueryProvider } from "@/lib/query/provider";

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="bottom-right"
      theme={resolvedTheme === "light" ? "light" : "dark"}
      duration={3200}
      toastOptions={{
        classNames: {
          toast: "!rounded-xl !border !border-[color:var(--border-subtle)] !bg-[var(--toast-bg)] !backdrop-blur-md !text-fg !shadow-float !font-sans",
          description: "!text-fg-muted",
          success: "[&_[data-icon]]:!text-emerald-500",
          error: "[&_[data-icon]]:!text-red-500",
          warning: "[&_[data-icon]]:!text-amber-500",
          info: "[&_[data-icon]]:!text-sky-500",
        },
      }}
    />
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  // Starts restoring demo state on first client render.
  const hydrated = useHydrated();
  const reduceMotion = useDemoStore((s) => s.settings.reduceMotion);
  const compact = useDemoStore((s) => s.settings.compactTables);

  // Appearance preferences from Settings apply app-wide.
  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.classList.toggle("reduce-motion", reduceMotion);
    document.documentElement.classList.toggle("compact-tables", compact);
  }, [hydrated, reduceMotion, compact]);

  return (
    // next-themes injects a blocking script, so the saved theme applies before first paint (no flash).
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem themes={["light", "dark"]} storageKey="interviewos-theme" disableTransitionOnChange>
      <MotionConfig reducedMotion={hydrated && reduceMotion ? "always" : "user"}>
        <TooltipProvider delayDuration={250}>
          <QueryProvider>
            <AuthProvider>{children}</AuthProvider>
          </QueryProvider>
          <ThemedToaster />
        </TooltipProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
