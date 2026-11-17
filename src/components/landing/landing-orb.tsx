"use client";
import dynamic from "next/dynamic";
import { CoreFallback } from "@/components/visuals/core-fallback";

// Only the decorative SVG is client-only. Copy, navigation and CTAs remain server rendered.
// Reuse the original interview visual rather than a replacement 3D model.
const AICore = dynamic(() => import("@/components/visuals/ai-core").then(m => m.AICore), {
  ssr: false,
  loading: () => <CoreFallback />,
});

export function LandingOrb({ parallax = false, excited = false }: { parallax?: boolean; excited?: boolean }) {
  return <div className="landing-orb"><AICore state="idle" parallax={parallax} excited={excited} particles={false} label="InterviewOS AI orb" /></div>;
}
