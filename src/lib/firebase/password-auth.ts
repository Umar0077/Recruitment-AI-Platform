"use client";
import { sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import { isApiMode } from "@/lib/config/environment";
import { getFirebaseAuth } from "./client";
import { authErrorCode, authErrorMessage, type SignInOutcome } from "./errors";

export const PASSWORD_RESET_MESSAGE = "If an account can receive a password reset, an email will arrive shortly. Check your inbox and spam folder.";
const disabled: SignInOutcome = { ok: false, code: "auth/api-disabled", message: "Real sign-in is unavailable in Demo Mode." };
const failure = (e: unknown): SignInOutcome => {
  const code = authErrorCode(e);
  return { ok: false, code, message: authErrorMessage(code) };
};

/** Passwords go directly to Firebase, never through the API or application storage. */
export async function signInWithPassword(email: string, password: string): Promise<SignInOutcome> {
  if (!isApiMode) return disabled;
  try {
    await signInWithEmailAndPassword(await getFirebaseAuth(), email.trim(), password);
    return { ok: true };
  } catch (e) { return failure(e); }
}

export async function requestPasswordReset(email: string): Promise<SignInOutcome> {
  if (!isApiMode) return disabled;
  try {
    await sendPasswordResetEmail(await getFirebaseAuth(), email.trim());
    return { ok: true };
  } catch (e) {
    // Older projects may return these errors when enumeration protection is off.
    // Never disclose whether the submitted address exists or is disabled.
    if (["auth/user-not-found", "auth/user-disabled", "auth/invalid-credential", "auth/invalid-login-credentials"].includes(authErrorCode(e))) return { ok: true };
    return failure(e);
  }
}

export async function requestEmailVerification(): Promise<SignInOutcome> {
  if (!isApiMode) return disabled;
  try {
    const user = (await getFirebaseAuth()).currentUser;
    if (!user) return { ok: false, code: "auth/signed-out", message: "Sign in again to verify your email." };
    if (user.emailVerified) return { ok: false, code: "auth/already-verified", message: "Your email is already verified. Check your verification status to return to Login." };
    await sendEmailVerification(user);
    return { ok: true };
  } catch (e) { return failure(e); }
}
