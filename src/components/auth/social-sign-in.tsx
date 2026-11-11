"use client";
/**
 * Continue with Google (API mode) — the only sign-in provider. Firebase handles the OAuth flow;
 * after sign-in, the backend profile decides where the user may go. Signing in never grants
 * staff access or another candidate's interview by itself.
 */
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Info, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { safeNext, useAuth, type SocialProvider } from "@/lib/auth/auth-provider";
import { firebaseMissingKeys, usingAuthEmulator } from "@/lib/firebase/client";
import { cn } from "@/lib/utils";


function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className="!size-[18px]">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function Notice({ tone = "info", plain, children }: { tone?: "info" | "warn"; plain?: boolean; children: React.ReactNode }) {
  const Icon = tone === "warn" ? AlertTriangle : Info;
  return (
    <div
      role={tone === "warn" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-xl border p-3 text-[13px] leading-relaxed",
        tone === "warn" ? "border-amber-400/30 bg-amber-400/[0.07] text-amber-800 dark:text-amber-100" : "border-subtle bg-overlay/[0.03] text-fg-secondary",
      )}
    >
      {!plain && <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <div>{children}</div>
    </div>
  );
}

function Inner({ area, defaultNext }: { area: "candidate" | "admin"; defaultNext: string }) {
  const auth = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"), defaultNext);
  const denied = params.get("denied");
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigated = useRef(false);

  const { status, profile } = auth;
  const wrongArea = status === "signedIn" && !!profile && (area === "admin" ? !profile.isStaff : !profile.roles.includes("CANDIDATE"));

  // Route the signed-in user once their backend profile is known (and any link prompt is answered).
  useEffect(() => {
    if (navigated.current || status !== "signedIn" || !profile || wrongArea) return;
    navigated.current = true;
    if (area === "candidate" && !profile.candidateId) router.replace("/candidate/interview/unavailable?reason=not-linked");
    else router.replace(next);
  }, [status, profile, wrongArea, area, next, router]);

  const start = async (p: SocialProvider) => {
    setError(null);
    setBusy(p);
    const r = await auth.signInWith(p);
    if (!r.ok && !r.redirecting) {
      setBusy(null);
      if (!r.cancelled) setError(r.message);
    }
    // On success the busy state stays until navigation, avoiding a flash of the buttons.
  };

  const resolving = status === "loading" || (status === "signedIn" && !wrongArea);
  const disabled = status === "unconfigured" || !!busy || resolving;

  if (status === "unconfigured") {
    return (
      <Notice tone="warn">
        <span className="font-semibold">Sign-in isn&apos;t configured yet.</span> This build is in API mode but the Firebase settings are missing
        {process.env.NODE_ENV !== "production" && <> ({firebaseMissingKeys.map((k) => `NEXT_PUBLIC_FIREBASE_${k.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`).join(", ")})</>}.
      </Notice>
    );
  }

  if (wrongArea) {
    return (
      <div className="space-y-4">
        <Notice tone="warn">
          {area === "admin" ? (
            <>
              <span className="font-semibold">No workspace access.</span> You&apos;re signed in{auth.user?.email ? ` as ${auth.user.email}` : ""}, but this account hasn&apos;t been given a recruitment role. Ask an administrator to grant access.
            </>
          ) : (
            <>
              <span className="font-semibold">This is a staff account.</span> Candidate interviews can&apos;t be opened from a recruitment account. <Link href="/admin" className="font-medium underline underline-offset-2">Go to the workspace</Link>.
            </>
          )}
        </Notice>
        <Button variant="secondary" size="lg" className="w-full" onClick={() => void auth.signOut()}>
          <LogOut />Sign out and use another account
        </Button>
      </div>
    );
  }

  const shownError = error ?? auth.notice?.message ?? null;
  return (
    <div className="space-y-3">
      {denied === "1" && !shownError && <Notice tone="warn">Your account doesn&apos;t have access to the recruitment workspace.</Notice>}
      {denied === "staff" && !shownError && <Notice tone="warn">Staff accounts can&apos;t open candidate interviews.</Notice>}
      {shownError && <Notice tone="warn">{shownError}</Notice>}

      <Button variant="secondary" size="lg" className="w-full" loading={busy === "google.com"} disabled={disabled && busy !== "google.com"} onClick={() => void start("google.com")}>
        {busy !== "google.com" && <GoogleIcon />}
        Continue with Google
      </Button>

      {resolving && !busy && <p className="text-center text-xs text-fg-muted" aria-live="polite">Checking your session…</p>}

      <div className="pt-2">
        {area === "admin" ? (
          <Notice plain>
            <span className="inline-flex items-center gap-1.5 font-medium text-fg"><ShieldCheck className="size-3.5 text-brand-cyan" aria-hidden />Secure staff access</span>
            <br />
            Signing in verifies who you are. Workspace access is granted separately by an administrator.
          </Notice>
        ) : (
          <Notice>
            Sign in with the Google account that uses the email address your invitation was sent to.
          </Notice>
        )}
      </div>
      {usingAuthEmulator && <p className="text-center text-[11px] text-fg-disabled">Development: Firebase Auth Emulator</p>}
    </div>
  );
}

export function SocialSignIn(props: { area: "candidate" | "admin"; defaultNext: string }) {
  return (
    <Suspense>
      <Inner {...props} />
    </Suspense>
  );
}
