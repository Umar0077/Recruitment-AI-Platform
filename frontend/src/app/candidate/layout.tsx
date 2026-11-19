import type { Metadata } from "next";
import { CandidateLayoutFrame } from "@/components/candidate/shell";

export const metadata: Metadata = { title: "Candidate Interview", robots: { index: false, follow: false } };

export default function CandidateLayout({ children }: { children: React.ReactNode }) {
  return <CandidateLayoutFrame>{children}</CandidateLayoutFrame>;
}
