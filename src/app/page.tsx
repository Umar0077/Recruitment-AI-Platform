import { GlassNavbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { FAQ, FinalCTA, Footer, HowItWorks, InterviewPreview, Preparation, Privacy, TrustStrip } from "@/components/landing/sections";

export default function LandingPage() {
  return (
    <div className="relative overflow-x-clip">
      <a href="#main" className="sr-only z-50 rounded-lg bg-brand px-4 py-2 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to content
      </a>
      <GlassNavbar />
      <main id="main">
        <Hero />
        <TrustStrip />
        <HowItWorks />
        <InterviewPreview />
        <Preparation />
        <Privacy />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
