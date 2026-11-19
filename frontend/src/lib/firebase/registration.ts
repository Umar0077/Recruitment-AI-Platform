"use client";
import { createUserWithEmailAndPassword, sendEmailVerification, updateProfile, validatePassword, type PasswordValidationStatus } from "firebase/auth";
import { isApiMode } from "@/lib/config/environment";
import { getFirebaseAuth } from "./client";
import { authErrorCode, authErrorMessage, type SignInOutcome } from "./errors";
import { requireFreshLogin } from "./onboarding-session";

export type RegistrationOutcome = { ok: true; emailSent: boolean; notice?: string } | Extract<SignInOutcome, { ok: false }>;
export function passwordRequirements(status: PasswordValidationStatus): string {
  const missing: string[] = [];
  if (status.meetsMinPasswordLength === false) missing.push(`at least ${status.passwordPolicy.customStrengthOptions.minPasswordLength ?? 6} characters`);
  if (status.meetsMaxPasswordLength === false) missing.push(`at most ${status.passwordPolicy.customStrengthOptions.maxPasswordLength ?? 4096} characters`);
  if (status.containsLowercaseLetter === false) missing.push("a lowercase letter");
  if (status.containsUppercaseLetter === false) missing.push("an uppercase letter");
  if (status.containsNumericCharacter === false) missing.push("a number");
  if (status.containsNonAlphanumericCharacter === false) missing.push("a special character");
  return missing.length ? `Your password needs ${missing.join(", ")}.` : "Choose a password that meets the account security requirements.";
}

export async function registerCandidate(fullName: string, email: string, password: string): Promise<RegistrationOutcome> {
  if (!isApiMode) return { ok: false, code: "auth/api-disabled", message: "Demo Mode does not create real accounts." };
  const name = fullName.trim();
  if (!name || name.length > 120) return { ok: false, code: "auth/invalid-name", message: "Enter your full name using 120 characters or fewer." };
  try {
    const auth = await getFirebaseAuth();
    if (auth.currentUser) return { ok: false, code: "auth/already-signed-in", message: "Sign out before creating another account." };
    // The Auth Emulator has no getPasswordPolicy endpoint. This fallback is restricted
    // to an actual emulator connection for a non-production demo project.
    const isolatedEmulator = process.env.NODE_ENV !== "production" && !!auth.emulatorConfig && auth.app.options.projectId?.startsWith("demo-");
    if (isolatedEmulator) {
      if (password.length < 6 || password.length > 4096) return { ok: false, code: "auth/weak-password", message: "Use between 6 and 4096 characters for this emulator account." };
    } else {
      const policy = await validatePassword(auth, password);
      if (!policy.isValid) return { ok: false, code: "auth/weak-password", message: passwordRequirements(policy) };
    }
    const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
    requireFreshLogin(user.uid);
    let notice: string | undefined;
    try { await updateProfile(user, { displayName: name }); }
    catch { notice = "Your account was created. You can complete your name after signing in."; }
    try { await sendEmailVerification(user); return { ok: true, emailSent: true, notice }; }
    catch (e) { return { ok: true, emailSent: false, notice: `Your account was created, but the verification email could not be sent. ${authErrorMessage(authErrorCode(e))}` }; }
  } catch (e) {
    const code = authErrorCode(e);
    return { ok: false, code, message: authErrorMessage(code) };
  }
}

export async function completeFirebaseName(fullName: string): Promise<SignInOutcome> {
  if (!isApiMode) return { ok: false, code: "auth/api-disabled", message: "Real profiles are unavailable in Demo Mode." };
  const name = fullName.trim();
  if (!name || name.length > 120) return { ok: false, code: "auth/invalid-name", message: "Enter your full name using 120 characters or fewer." };
  try {
    const user = (await getFirebaseAuth()).currentUser;
    if (!user || !user.emailVerified) return { ok: false, code: "auth/unverified", message: "Verify your email and sign in before completing your profile." };
    await updateProfile(user, { displayName: name });
    await user.getIdToken(true);
    return { ok: true };
  } catch (e) { const code = authErrorCode(e); return { ok: false, code, message: authErrorMessage(code) }; }
}
