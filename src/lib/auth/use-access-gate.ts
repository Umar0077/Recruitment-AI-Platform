"use client";
/**
 * Client-side route gate for the candidate and admin areas. It only decides what to RENDER;
 * the backend independently authorises every API call.
 *  - Demo mode: the isolated demo session (no real authentication, sample data only).
 *  - API mode: Firebase sign-in + backend profile. Nothing renders until both are known.
 */
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isApiMode } from "@/lib/config/environment";
import { useHydrated } from "@/hooks/use-demo";
import { useDemoStore } from "@/lib/demo/store";
import { useAuth } from "./auth-provider";

export type Area = "candidate" | "admin";

export function useAccessGate(area: Area): boolean {
  const hydrated = useHydrated();
  const demoSession = useDemoStore((s) => (area === "admin" ? s.adminSession : s.candidateSession));
  const { status, profile } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  let allowed = false;
  let redirect: string | null = null;
  const login = `/${area}/login?next=${encodeURIComponent(pathname)}`;

  if (!isApiMode) {
    allowed = hydrated && !!demoSession;
    if (hydrated && !demoSession) redirect = `/${area}/login`;
  } else if (status === "signedOut" || status === "unconfigured") {
    redirect = login;
  } else if (status === "signedIn" && profile) {
    if (area === "admin") {
      allowed = profile.isStaff;
      if (!allowed) redirect = "/admin/login?denied=1";
    } else if (!profile.roles.includes("CANDIDATE")) {
      redirect = "/candidate/login?denied=staff";
    } else if (!profile.candidateId) {
      // Signed in, but no invitation/application is linked to this account.
      redirect = "/candidate/interview/unavailable?reason=not-linked";
    } else {
      allowed = true;
    }
  } else if (status === "error") {
    redirect = login;
  }

  useEffect(() => {
    if (redirect) router.replace(redirect);
  }, [redirect, router]);

  return allowed;
}
