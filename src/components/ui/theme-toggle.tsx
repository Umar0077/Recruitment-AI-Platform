"use client";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { Button } from "./button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "./overlays";
import { cn } from "@/lib/utils";

export const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

/** Theme setter that cross-fades colours briefly instead of flashing. */
export function useThemeSwitch() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const change = (next: string) => {
    const root = document.documentElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches || root.classList.contains("reduce-motion");
    if (!reduce) {
      root.classList.add("theme-transition");
      window.setTimeout(() => root.classList.remove("theme-transition"), 320);
    }
    setTheme(next);
  };
  return { theme: mounted ? theme : undefined, resolvedTheme: mounted ? resolvedTheme : undefined, setTheme: change, mounted };
}

/** Compact icon button with a Light / Dark / System menu. */
export function ThemeToggle({ className, size = "icon" }: { className?: string; size?: "icon" | "icon-sm" }) {
  const { theme, resolvedTheme, setTheme, mounted } = useThemeSwitch();
  const Icon = !mounted ? Moon : theme === "system" ? Monitor : resolvedTheme === "light" ? Sun : Moon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size={size} className={className} aria-label="Change theme">
          <Icon className="transition-transform duration-300 ease-premium" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-[168px]">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        {THEME_OPTIONS.map((o) => (
          <DropdownMenuItem key={o.value} onSelect={() => setTheme(o.value)}>
            <o.icon />
            {o.label}
            {theme === o.value && <Check className="ml-auto !text-brand-cyan" aria-label="Selected" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Segmented control for the Settings › Appearance page. */
export function ThemeSegmented() {
  const { theme, setTheme, mounted } = useThemeSwitch();
  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-xl border border-subtle bg-overlay/[0.03] p-1">
      {THEME_OPTIONS.map((o) => {
        const active = mounted && theme === o.value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(o.value)}
            className={cn(
              "flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-[background-color,color,box-shadow] duration-200",
              active ? "bg-ink-900 text-fg shadow-glass ring-1 ring-[color:var(--border-subtle)]" : "text-fg-muted hover:text-fg",
            )}
          >
            <o.icon className="size-4" aria-hidden />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
