"use client";
import { TriangleAlert } from "lucide-react";
import { ErrorScreen } from "@/components/ui/error-screen";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorScreen
      icon={<TriangleAlert />}
      title="Something Went Wrong"
      body="An unexpected problem stopped this page from loading. Your demo data is safe — try again, or return home."
      onRetry={reset}
      primary={{ label: "Back to Home", href: "/" }}
    />
  );
}
