"use client";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-provider";
import { useUserProfile } from "@/lib/auth/user-profile";
import { isApiMode } from "@/lib/config/environment";
import { CalendarX2, CloudOff, ServerCrash, WifiOff } from "lucide-react";
import { ErrorScreen } from "@/components/ui/error-screen";
import { BRAND } from "@/lib/brand";

const REASONS = {
  expired: { icon: CalendarX2, title: "Invitation Expired", body: "The completion window for this interview has closed. If you believe this is a mistake or need more time, contact the recruitment team — they can review your invitation." },
  session: { icon: CloudOff, title: "Interview Session Unavailable", body: "We couldn't open this interview session. It may have been completed already or replaced by a newer invitation. Try signing in again, or contact support." },
  connection: { icon: WifiOff, title: "Connection Problem", body: "We lost connection to the interview service. Check your internet connection and try again. Answers you've already completed are kept." },
  "not-linked": { icon: CloudOff, title: "Prepare Your Interview", body: "Complete role selection to prepare your initial interview, or return to your existing invitation." },
  service: { icon: ServerCrash, title: "Demo Service Unavailable", body: "The demo interview service isn't responding right now. Nothing you've completed has been lost. Please try again in a moment." },
} as const;

function Inner() {
  const params = useSearchParams();
  const key = (params.get("reason") ?? "session") as keyof typeof REASONS;
  const r = REASONS[key] ?? REASONS.session;
  const auth = useAuth();
  const account = useUserProfile("candidate");
  const router = useRouter();
  const canSwitch = isApiMode && auth.status === "signedIn";
  return (
    <ErrorScreen
      icon={<r.icon />}
      title={r.title}
      body={r.body}
      primary={{ label: key === "not-linked" ? "Continue Onboarding" : key === "expired" ? "Contact Recruitment Team" : "Try Again", href: key === "not-linked" ? "/candidate/onboarding" : key === "expired" ? `mailto:${BRAND.supportEmail}` : "/candidate/interview" }}
      secondary={{ label: "Back to Interview Home", href: "/" }}
      extra={
        canSwitch ? (
          <div><p className="mb-2 text-sm text-fg-secondary">Signed in as <span className="font-medium">{account.fullName}</span></p><Button size="lg" variant="ghost" onClick={() => void auth.signOut().then(() => router.replace("/candidate/login"))}>
            <LogOut />Sign out and use another account
          </Button></div>
        ) : undefined
      }
    />
  );
}

export default function UnavailablePage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
