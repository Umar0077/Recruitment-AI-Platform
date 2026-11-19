/** Static, dependency-free stand-in for the AI core while it loads (or without JS). */
export function CoreFallback({ className }: { className?: string }) {
  return (
    <div className={`relative aspect-square w-full ${className ?? ""}`} aria-hidden>
      <div className="absolute inset-[-10%] rounded-full bg-[radial-gradient(circle,rgba(37,99,235,calc(0.45*var(--glow-k)))_0%,rgba(37,99,235,calc(0.12*var(--glow-k)))_35%,transparent_65%)]" />
      <div className="absolute inset-[4%] rounded-full border border-slate-400/10" />
      <div className="absolute inset-[19%] rounded-full border-[3px] border-slate-300/40 bg-[radial-gradient(circle_at_44%_38%,#1e3a8a_0%,#0b1640_70%,#3b82f6_100%)] shadow-[0_0_80px_rgba(37,99,235,calc(0.45*var(--glow-k)))]" />
      <div className="absolute inset-[41%] rounded-full bg-[radial-gradient(circle,#fff_0%,#38bdf8_45%,transparent_75%)]" />
    </div>
  );
}
