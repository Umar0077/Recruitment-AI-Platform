"use client";
import { RouteError } from "@/components/ui/route-error";
export default function ErrorPage({ reset }: { reset: () => void }) { return <RouteError area="admin" reset={reset} />; }
