"use client";
import Link from "next/link";
import { AuthFrame } from "@/components/auth/auth-frame";
import { DemoLoginForm } from "@/components/candidate/demo-login-form";
import { isApiMode } from "@/lib/config/environment";
import { SocialSignIn } from "@/components/auth/social-sign-in";

export default function CandidateLoginPage() {
  return <AuthFrame title="Welcome Back." description="Continue your interview journey.">
    {isApiMode ? <SocialSignIn area="candidate" defaultNext="/candidate/interview" /> : <DemoLoginForm role="candidate" submitLabel="Continue" redirectTo="/candidate/interview" />}
    <p className="mt-6 text-center text-sm text-fg-muted">Don&apos;t have an account? <Link href="/candidate/signup" className="font-semibold text-fg underline decoration-brand/50 underline-offset-4 hover:text-brand-cyan">Sign Up</Link></p>
  </AuthFrame>;
}
