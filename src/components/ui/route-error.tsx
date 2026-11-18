"use client";
import Link from "next/link";
import { Button } from "./button";
export function RouteError({ reset, area }: { reset: () => void; area: "admin" | "candidate" }) {
  return <section role="alert" className="mx-auto max-w-xl space-y-4 px-5 py-12"><h1 className="text-2xl font-bold">This page couldn’t load</h1><p className="text-sm text-fg-secondary">Retry this page or return to your workspace to check the latest saved state.</p><div className="flex flex-wrap gap-3"><Button onClick={reset}>Try again</Button><Button asChild variant="secondary"><Link href={area === "admin" ? "/admin" : "/candidate/status"}>Return to {area === "admin" ? "dashboard" : "your status"}</Link></Button></div></section>;
}
