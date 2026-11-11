"use client";
/**
 * InterviewOS AI Intelligence Core — original signature visual.
 * A glass sphere with an internal neural lattice, held in a metallic bezel, wrapped by a
 * radial "voice ring" that responds to conversation state, two tilted orbit rings, and a
 * slowly rotating holographic dial. Built with SVG + CSS (plus a tiny canvas particle
 * field), so it is light, crisp at any size, and needs no WebGL.
 */
import { memo, useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion, useMediaQuery } from "@/hooks/use-demo";

export type CoreState = "idle" | "speaking" | "listening" | "processing" | "complete" | "dim";

const ENERGY: Record<CoreState, number> = { idle: 1, speaking: 1.3, listening: 1.08, processing: 0.9, complete: 0.85, dim: 0.45 };

// Deterministic neural lattice inside the sphere (golden-angle spiral).
const NODES = Array.from({ length: 17 }, (_, i) => {
  const r = 86 * Math.sqrt((i + 0.5) / 17);
  const t = i * 2.39996;
  return { x: 200 + r * Math.cos(t), y: 200 + r * Math.sin(t) * 0.92 };
});
const EDGES = (() => {
  const set = new Set<string>();
  NODES.forEach((a, i) => {
    NODES.map((b, j) => ({ j, d: Math.hypot(a.x - b.x, a.y - b.y) }))
      .filter((n) => n.j !== i)
      .sort((p, q) => p.d - q.d)
      .slice(0, 2)
      .forEach(({ j }) => set.add(i < j ? `${i}-${j}` : `${j}-${i}`));
  });
  return [...set].map((k) => k.split("-").map(Number) as [number, number]);
})();

const BAR_COUNT = 72;

function Particles({ count }: { count: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || count === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let w = 0, h = 0, raf = 0, visible = true;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const ps = Array.from({ length: count }, () => ({ a: rnd() * Math.PI * 2, r: 0.3 + rnd() * 0.22, s: 0.4 + rnd() * 1.3, v: (rnd() - 0.5) * 0.0009, o: 0.25 + rnd() * 0.55, dy: rnd() * 1000 }));
    const draw = (t: number) => {
      if (!visible) return;
      ctx.clearRect(0, 0, w, h);
      for (const p of ps) {
        p.a += p.v;
        const bob = Math.sin(t / 2400 + p.dy) * 6;
        const x = w / 2 + Math.cos(p.a) * p.r * w;
        const y = h / 2 + Math.sin(p.a) * p.r * h * 0.62 + bob;
        const tw = 0.6 + 0.4 * Math.sin(t / 900 + p.dy);
        ctx.beginPath();
        ctx.fillStyle = `rgba(147,197,253,${p.o * tw})`;
        ctx.arc(x, y, p.s, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting && !document.hidden;
      cancelAnimationFrame(raf);
      if (visible) raf = requestAnimationFrame(draw);
    });
    io.observe(canvas);
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(raf); io.disconnect(); window.removeEventListener("resize", resize); };
  }, [count]);
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 size-full" aria-hidden />;
}

function AICoreBase({
  state = "idle",
  className,
  parallax = false,
  particles = true,
  excited = false,
  label = "Animated AI interviewer visual",
}: {
  state?: CoreState;
  className?: string;
  parallax?: boolean;
  particles?: boolean;
  excited?: boolean;
  label?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const root = useRef<HTMLDivElement>(null);
  const reduce = usePrefersReducedMotion();
  const isDesktop = useMediaQuery("(min-width: 1024px) and (pointer: fine)");
  const isMobile = useMediaQuery("(max-width: 640px)");
  const energy = ENERGY[state] * (excited ? 1.18 : 1);
  const animate = !reduce;
  const voiceActive = state === "speaking" || state === "listening";

  // Mouse parallax via CSS variables — no React re-render per move.
  useEffect(() => {
    if (!parallax || !isDesktop || reduce) return;
    const el = root.current;
    if (!el) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty("--px", ((e.clientX / window.innerWidth) * 2 - 1).toFixed(3));
        el.style.setProperty("--py", ((e.clientY / window.innerHeight) * 2 - 1).toFixed(3));
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => { window.removeEventListener("pointermove", onMove); cancelAnimationFrame(raf); };
  }, [parallax, isDesktop, reduce]);

  const layer = (depth: number) => ({
    transform: `translate3d(calc(var(--px, 0) * ${depth}px), calc(var(--py, 0) * ${depth}px), 0)`,
    transition: "transform 900ms cubic-bezier(0.22,1,0.36,1)",
  });

  const accent = state === "listening" ? "#38BDF8" : "#60A5FA";
  const particleCount = !particles || !animate ? 0 : isMobile ? 12 : isDesktop ? 38 : 22;

  return (
    <div
      ref={root}
      role="img"
      aria-label={label}
      data-state={state}
      className={cn("relative aspect-square w-full select-none", className)}
      style={{ ["--core-energy" as string]: energy }}
    >
      {/* Ambient halo */}
      <div
        className="absolute inset-[-12%] rounded-full transition-opacity duration-700"
        style={{
          ...layer(-10),
          opacity: Math.min(1, 0.55 * energy),
          background: `radial-gradient(circle at 50% 50%, rgba(37,99,235,calc(0.55*var(--glow-k))) 0%, rgba(37,99,235,calc(0.18*var(--glow-k))) 32%, rgba(56,189,248,calc(0.06*var(--glow-k))) 52%, transparent 68%)`,
        }}
        aria-hidden
      />
      {particleCount > 0 && <Particles count={particleCount} />}

      {/* Back layer: dial + rear halves of the orbits */}
      <div className="absolute inset-0" style={layer(-6)} aria-hidden>
        <svg viewBox="0 0 400 400" className="size-full overflow-visible">
          <defs>
            <linearGradient id={`${uid}-orbit`} x1="0" x2="1">
              <stop offset="0" stopColor="#818CF8" stopOpacity="0" />
              <stop offset="0.5" stopColor="#93C5FD" stopOpacity="0.55" />
              <stop offset="1" stopColor="#38BDF8" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g className={animate ? "core-spin-slow" : undefined} style={{ transformOrigin: "200px 200px" }}>
            <circle cx="200" cy="200" r="190" fill="none" stroke="rgba(148,163,184,0.10)" strokeWidth="1" />
            {Array.from({ length: 90 }).map((_, i) => {
              const a = (i / 90) * Math.PI * 2;
              const long = i % 5 === 0;
              const r1 = long ? 176 : 180;
              return (
                <line
                  key={i}
                  x1={200 + Math.cos(a) * r1}
                  y1={200 + Math.sin(a) * r1}
                  x2={200 + Math.cos(a) * 185}
                  y2={200 + Math.sin(a) * 185}
                  stroke={long ? "rgba(147,197,253,0.45)" : "rgba(148,163,184,0.18)"}
                  strokeWidth={long ? 1.2 : 0.8}
                />
              );
            })}
            <path d="M 200 10 A 190 190 0 0 1 334 66" fill="none" stroke="#38BDF8" strokeOpacity="0.55" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M 66 334 A 190 190 0 0 1 22 262" fill="none" stroke="#818CF8" strokeOpacity="0.5" strokeWidth="1.6" strokeLinecap="round" />
          </g>
          <g transform="rotate(-16 200 200)">
            <ellipse cx="200" cy="200" rx="172" ry="50" fill="none" stroke={`url(#${uid}-orbit)`} strokeWidth="1" opacity="0.6" />
          </g>
          <g transform="rotate(12 200 200)">
            <ellipse cx="200" cy="200" rx="160" ry="38" fill="none" stroke={`url(#${uid}-orbit)`} strokeWidth="0.8" opacity="0.45" />
          </g>
        </svg>
      </div>

      {/* Front layer: the core itself */}
      <div className="absolute inset-0" style={layer(8)}>
        <div className={cn("absolute inset-0", animate && "core-float")}>
          <svg viewBox="0 0 400 400" className="size-full overflow-visible" aria-hidden>
            <defs>
              <radialGradient id={`${uid}-glass`} cx="44%" cy="38%" r="62%">
                <stop offset="0" stopColor="#1E3A8A" stopOpacity="0.55" />
                <stop offset="0.62" stopColor="#1D4ED8" stopOpacity="0.22" />
                <stop offset="0.9" stopColor="#60A5FA" stopOpacity="0.42" />
                <stop offset="1" stopColor="#BFDBFE" stopOpacity="0.75" />
              </radialGradient>
              <radialGradient id={`${uid}-body`} cx="50%" cy="55%" r="55%">
                <stop offset="0" stopColor="#0E1C4A" />
                <stop offset="1" stopColor="#070E27" />
              </radialGradient>
              <radialGradient id={`${uid}-nucleus`}>
                <stop offset="0" stopColor="#FFFFFF" />
                <stop offset="0.25" stopColor="#E0F2FE" />
                <stop offset="0.55" stopColor="#38BDF8" stopOpacity="0.75" />
                <stop offset="1" stopColor="#2563EB" stopOpacity="0" />
              </radialGradient>
              <linearGradient id={`${uid}-bezel`} x1="0.1" y1="0" x2="0.9" y2="1">
                <stop offset="0" stopColor="#F1F5F9" />
                <stop offset="0.22" stopColor="#94A3B8" />
                <stop offset="0.48" stopColor="#1E293B" />
                <stop offset="0.72" stopColor="#3B82F6" />
                <stop offset="1" stopColor="#E2E8F0" />
              </linearGradient>
              <linearGradient id={`${uid}-spec`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.55" />
                <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
              </linearGradient>
              <linearGradient id={`${uid}-front`} x1="0" x2="1">
                <stop offset="0" stopColor="#38BDF8" stopOpacity="0" />
                <stop offset="0.5" stopColor="#BAE6FD" stopOpacity="0.9" />
                <stop offset="1" stopColor="#818CF8" stopOpacity="0" />
              </linearGradient>
              <clipPath id={`${uid}-clip`}>
                <circle cx="200" cy="200" r="110" />
              </clipPath>
            </defs>

            {/* Voice ring */}
            <g style={{ opacity: voiceActive ? 0.95 : state === "dim" ? 0.25 : 0.5, transition: "opacity 600ms" }}>
              {Array.from({ length: BAR_COUNT }).map((_, i) => {
                const deg = (i / BAR_COUNT) * 360;
                const delay = ((i * 37) % 17) / 10;
                const dur = state === "speaking" ? 0.9 + ((i * 13) % 7) / 10 : 1.6 + ((i * 11) % 9) / 10;
                return (
                  <g key={i} transform={`rotate(${deg} 200 200)`}>
                    <rect
                      x="198.8"
                      y={voiceActive ? 52 : 60}
                      width="2.4"
                      height={voiceActive ? 22 : 12}
                      rx="1.2"
                      fill={i % 6 === 0 ? "#BAE6FD" : accent}
                      opacity={0.35 + ((i * 7) % 10) / 20}
                      className={animate && state !== "dim" && state !== "complete" ? "core-bar" : undefined}
                      style={animate ? { animationDelay: `-${delay}s`, animationDuration: `${dur}s`, transition: "y 500ms, height 500ms" } : undefined}
                    />
                  </g>
                );
              })}
            </g>

            {/* Holographic segments */}
            <g className={animate ? "core-spin-rev" : undefined} style={{ transformOrigin: "200px 200px" }}>
              <circle cx="200" cy="200" r="134" fill="none" stroke="rgba(148,163,184,0.14)" strokeWidth="1" strokeDasharray="2 6" />
              <path d="M 200 66 A 134 134 0 0 1 316 133" fill="none" stroke="#38BDF8" strokeWidth="2" strokeLinecap="round" opacity="0.75" />
              <path d="M 84 267 A 134 134 0 0 1 70 220" fill="none" stroke="#818CF8" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
            </g>

            {/* Metallic bezel */}
            <circle cx="200" cy="200" r="121" fill="none" stroke={`url(#${uid}-bezel)`} strokeWidth="5" />
            <circle cx="200" cy="200" r="126" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
            <circle cx="200" cy="200" r="116" fill="none" stroke="rgba(2,6,23,0.8)" strokeWidth="3" />

            {/* Glass sphere */}
            <circle cx="200" cy="200" r="112" fill={`url(#${uid}-body)`} />
            <g clipPath={`url(#${uid}-clip)`}>
              {/* Neural lattice */}
              <g opacity={0.35 + 0.35 * Math.min(1.2, energy)} style={{ transition: "opacity 600ms" }}>
                {EDGES.map(([a, b], i) => (
                  <line key={`e${i}`} x1={NODES[a]!.x} y1={NODES[a]!.y} x2={NODES[b]!.x} y2={NODES[b]!.y} stroke="#60A5FA" strokeOpacity="0.28" strokeWidth="0.9" />
                ))}
                {EDGES.map(([a, b], i) => (
                  <line
                    key={`f${i}`}
                    x1={NODES[a]!.x}
                    y1={NODES[a]!.y}
                    x2={NODES[b]!.x}
                    y2={NODES[b]!.y}
                    stroke="#BAE6FD"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    className={animate ? "core-flow" : undefined}
                    style={animate ? { animationDelay: `-${(i * 0.7) % 9}s`, animationDuration: state === "speaking" ? "4.5s" : "9s" } : { opacity: 0 }}
                  />
                ))}
                {NODES.map((n, i) => (
                  <circle key={`n${i}`} cx={n.x} cy={n.y} r={i % 4 === 0 ? 2.6 : 1.6} fill={i % 3 === 0 ? "#E0F2FE" : "#93C5FD"} opacity={0.5 + (i % 5) / 10} />
                ))}
              </g>
              {/* Inner waveform across the equator */}
              <path
                d="M 92 200 C 120 200, 130 178, 152 178 S 180 222, 200 222 S 232 168, 252 172 S 284 206, 308 200"
                fill="none"
                stroke="#7DD3FC"
                strokeOpacity={voiceActive ? 0.6 : 0.22}
                strokeWidth="1.4"
                style={{ transition: "stroke-opacity 600ms" }}
              />
            </g>
            <circle cx="200" cy="200" r="112" fill={`url(#${uid}-glass)`} />

            {/* Nucleus */}
            <circle cx="200" cy="200" r={34} fill={`url(#${uid}-nucleus)`} className={animate ? "core-pulse" : undefined} style={{ opacity: Math.min(1, 0.85 * energy) }} />
            <circle cx="200" cy="200" r="7" fill="#F8FAFC" opacity={0.6 + 0.3 * Math.min(1, energy)} />

            {/* Specular highlights */}
            <ellipse cx="166" cy="136" rx="48" ry="20" fill={`url(#${uid}-spec)`} transform="rotate(-28 166 136)" opacity="0.7" />
            <path d="M 268 270 A 104 104 0 0 1 214 304" fill="none" stroke="#BAE6FD" strokeOpacity="0.45" strokeWidth="2.5" strokeLinecap="round" />

            {/* Front halves of the orbits */}
            <g transform="rotate(-16 200 200)">
              <path d="M 28 200 A 172 50 0 0 0 372 200" fill="none" stroke={`url(#${uid}-front)`} strokeWidth="1.4" opacity="0.8" />
              <path d="M 28 200 A 172 50 0 0 0 372 200" fill="none" stroke="#E0F2FE" strokeWidth="2.2" strokeLinecap="round" className={animate ? "core-flow" : undefined} style={animate ? { strokeDasharray: "18 222", animationDuration: "7s" } : { opacity: 0 }} />
            </g>
            <g transform="rotate(12 200 200)">
              <path d="M 40 200 A 160 38 0 0 0 360 200" fill="none" stroke={`url(#${uid}-front)`} strokeWidth="1" opacity="0.55" />
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}

export const AICore = memo(AICoreBase);
