"use client";
import Link from "next/link";
import { useId } from "react";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

// One ribbon loop (the top petal); the mark is four copies rotated around the centre.
const LOOP = "M19.5 33 C15.5 18, 23 6, 33 6 C43 6, 48.5 15.5, 42 28.5";

/**
 * Brand mark: four interlocking ribbon loops in a cyan → royal-blue gradient.
 * SVG recreation of the supplied logo. To use the original raster file instead,
 * put it in /public and set BRAND.logoSrc (e.g. "/brand/logo.png").
 */
export function BrandMark({ className, title }: { className?: string; title?: string }) {
  const id = useId().replace(/:/g, "");
  if (BRAND.logoSrc) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={BRAND.logoSrc} alt={title ?? ""} aria-hidden={title ? undefined : true} className={cn("size-8 object-contain", className)} />;
  }
  return (
    <svg viewBox="0 0 64 64" className={cn("size-8", className)} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <defs>
        <linearGradient id={`${id}-r`} x1="19" y1="33" x2="42" y2="6" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1D3FD8" />
          <stop offset="0.45" stopColor="#2F7BF5" />
          <stop offset="1" stopColor="#3EE0F7" />
        </linearGradient>
      </defs>
      {[0, 90, 180, 270].map((deg) => (
        <g key={deg} transform={`rotate(${deg} 32 32)`}>
          <path d={LOOP} fill="none" stroke="#0B1A5C" strokeOpacity="0.5" strokeWidth="10.5" strokeLinecap="round" transform="translate(0.5 0.7)" />
          <path d={LOOP} fill="none" stroke={`url(#${id}-r)`} strokeWidth="9.5" strokeLinecap="round" />
        </g>
      ))}
    </svg>
  );
}

export function AppLogo({ href = "/", descriptor = false, className, size = "md" }: { href?: string; descriptor?: boolean; className?: string; size?: "sm" | "md" }) {
  return (
    <Link href={href} className={cn("group inline-flex items-center gap-2.5 rounded-lg", className)} aria-label={`${BRAND.name} home`}>
      <BrandMark className={cn(size === "sm" ? "size-7" : "size-8", "transition-transform duration-500 ease-premium group-hover:rotate-[-8deg]")} />
      <span className="flex flex-col leading-none">
        <span className={cn("font-display font-bold tracking-tight text-fg", size === "sm" ? "text-[15px]" : "text-[17px]")}>{BRAND.name}</span>
        {descriptor && <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.18em] text-fg-muted">{BRAND.descriptor}</span>}
      </span>
    </Link>
  );
}
