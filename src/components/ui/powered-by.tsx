import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * "Powered by GO Connectivo" partner attribution.
 * Uses the official supplied transparent logo unchanged (public/brand/go-connectivo-logo.png, 470×194).
 * Light mode: the logo sits directly on the page. Dark mode: its black wordmark would disappear
 * on navy, so it sits on a small white tile — the logo's own colours are never altered.
 */
const LOGO = { src: "/brand/go-connectivo-logo.png", width: 470, height: 194 };

const SIZES = {
  sm: { logoH: 24, label: "text-[9px] tracking-[0.18em]", chip: "dark:rounded-md dark:px-1.5 dark:py-1", gap: "gap-2" },
  md: { logoH: 30, label: "text-[10px] tracking-[0.2em]", chip: "dark:rounded-lg dark:px-2 dark:py-1", gap: "gap-2.5" },
  footer: { logoH: 38, label: "text-[11px] tracking-[0.22em]", chip: "dark:rounded-lg dark:px-2.5 dark:py-1.5", gap: "gap-3" },
} as const;

export function PoweredByConnectivo({ size = "md", className, stacked }: { size?: keyof typeof SIZES; className?: string; stacked?: boolean }) {
  const s = SIZES[size];
  const logoW = Math.round((s.logoH * LOGO.width) / LOGO.height);
  return (
    <div className={cn("inline-flex items-center", stacked ? "flex-col gap-1.5" : s.gap, className)}>
      <span className={cn("whitespace-nowrap font-semibold uppercase text-fg-muted", s.label)}>Powered by</span>
      <span className={cn("inline-flex shrink-0 items-center dark:bg-white dark:ring-1 dark:ring-white/10", s.chip)}>
        <Image src={LOGO.src} alt="GO Connectivo" unoptimized width={logoW} height={s.logoH} className="block object-contain" style={{ width: logoW, height: s.logoH }} />
      </span>
    </div>
  );
}
