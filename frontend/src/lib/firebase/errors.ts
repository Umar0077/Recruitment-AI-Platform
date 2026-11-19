/** Friendly copy for Firebase Auth error codes. Never shows raw error objects or tokens. */
export type SignInOutcome = { ok: true } | { ok: false; cancelled?: boolean; redirecting?: boolean; code: string; message: string };

const MESSAGES: Record<string, string> = {
  "auth/email-already-in-use": "An account already uses this email. Sign in or reset your password instead.",
  "auth/weak-password": "Choose a stronger password that meets the account security requirements.",
  "auth/password-does-not-meet-requirements": "Your password does not meet the account security requirements.",
  "auth/expired-action-code": "This link has expired. Request a new verification email or password reset.",
  "auth/invalid-action-code": "This link may have expired or already been used. Check your verification status or request a new link.",
  "auth/user-token-expired": "Your session has expired. Please sign in again.",
  "auth/requires-recent-login": "Please sign in again before continuing.",
  "auth/popup-blocked": "Your browser blocked the sign-in window. Continuing in this tab instead…",
  "auth/popup-closed-by-user": "Sign-in was cancelled.",
  "auth/cancelled-popup-request": "Sign-in was cancelled.",
  "auth/user-cancelled": "Sign-in was cancelled.",
  "auth/network-request-failed": "We couldn't reach the sign-in service. Check your connection and try again.",
  "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
  "auth/user-disabled": "This account has been disabled. Contact the recruitment team.",
  "auth/operation-not-allowed": "This sign-in method isn't enabled yet. Contact the recruitment team.",
  "auth/unauthorized-domain": "Sign-in isn't enabled for this website address yet.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/invalid-credential": "The email or password is incorrect. Try again or reset your password.",
  "auth/invalid-login-credentials": "The email or password is incorrect. Try again or reset your password.",
  "auth/wrong-password": "The email or password is incorrect. Try again or reset your password.",
  "auth/user-not-found": "The email or password is incorrect. Try again or reset your password.",
  "auth/internal-error": "The sign-in service is temporarily unavailable. Please try again shortly.",
  "auth/service-unavailable": "The sign-in service is temporarily unavailable. Please try again shortly.",
  "auth/account-exists-with-different-credential":
    "Use the sign-in method you previously used for this account. Contact the recruitment team if you need help.",
  "auth/credential-already-in-use": "This sign-in method is already linked to another account.",
  "auth/web-storage-unsupported": "Your browser is blocking storage needed for sign-in. Allow cookies/site data and try again.",
  "auth/operation-not-supported-in-this-environment": "This browser can't open a sign-in window. Continuing in this tab instead…",
};

export const CANCEL_CODES = new Set(["auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/user-cancelled"]);
export const REDIRECT_FALLBACK_CODES = new Set(["auth/popup-blocked", "auth/operation-not-supported-in-this-environment"]);

export function authErrorCode(e: unknown): string {
  return typeof e === "object" && e && "code" in e && typeof (e as { code: unknown }).code === "string" ? (e as { code: string }).code : "auth/unknown";
}

export function authErrorMessage(code: string): string {
  return MESSAGES[code] ?? "Sign-in couldn't be completed. Please try again.";
}
