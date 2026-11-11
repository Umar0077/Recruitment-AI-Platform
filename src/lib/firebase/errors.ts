/** Friendly copy for Firebase Auth error codes. Never shows raw error objects or tokens. */
export type SignInOutcome = { ok: true } | { ok: false; cancelled?: boolean; redirecting?: boolean; code: string; message: string };

const MESSAGES: Record<string, string> = {
  "auth/popup-blocked": "Your browser blocked the sign-in window. Continuing in this tab instead…",
  "auth/popup-closed-by-user": "Sign-in was cancelled.",
  "auth/cancelled-popup-request": "Sign-in was cancelled.",
  "auth/user-cancelled": "Sign-in was cancelled.",
  "auth/network-request-failed": "We couldn't reach the sign-in service. Check your connection and try again.",
  "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
  "auth/user-disabled": "This account has been disabled. Contact the recruitment team.",
  "auth/operation-not-allowed": "This sign-in method isn't enabled yet. Contact the recruitment team.",
  "auth/unauthorized-domain": "Sign-in isn't enabled for this website address yet.",
  "auth/invalid-credential": "Sign-in couldn't be completed. Please try again.",
  "auth/account-exists-with-different-credential":
    "An account with this email already uses a different sign-in method. Sign in with that method first; you can then choose to link this one.",
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
