import type { Metadata } from "next";

export const metadata: Metadata = { title: "Candidate Interview", robots: { index: false, follow: false } };

export default function CandidateLayout({ children }: { children: React.ReactNode }) {
  return children;
}
