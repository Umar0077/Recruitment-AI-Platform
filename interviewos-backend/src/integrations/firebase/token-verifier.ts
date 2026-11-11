import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { App, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { EnvironmentVariables } from "../../config/env.validation";

/** Identity facts taken ONLY from a cryptographically verified token. */
export interface VerifiedIdentity {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  signInProvider: string | null;
}

export type RejectReason = "invalid" | "expired" | "revoked" | "disabled";
export type VerifyResult = { ok: true; identity: VerifiedIdentity } | { ok: false; reason: RejectReason };

export abstract class TokenVerifier {
  abstract readonly configured: boolean;
  /** Verifies signature, issuer, audience (this Firebase project), expiry, revocation and disabled state. */
  abstract verify(token: string): Promise<VerifyResult>;
}

/** Maps Firebase Admin error codes to a rejection reason. Never includes the token. */
export function reasonFromFirebaseError(code: string | undefined): RejectReason {
  if (code === "auth/id-token-expired") return "expired";
  if (code === "auth/id-token-revoked") return "revoked";
  if (code === "auth/user-disabled") return "disabled";
  return "invalid";
}

/**
 * Verifies Firebase ID tokens with the Firebase Admin SDK (signature, issuer, audience, expiry, revocation).
 * Supports the Firebase Auth Emulator when FIREBASE_AUTH_EMULATOR_HOST is set (development only).
 */
@Injectable()
export class FirebaseTokenVerifier extends TokenVerifier {
  private readonly logger = new Logger(FirebaseTokenVerifier.name);
  private app: App | null = null;
  readonly configured: boolean;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    super();
    const projectId = config.get("FIREBASE_PROJECT_ID", { infer: true });
    const clientEmail = config.get("FIREBASE_CLIENT_EMAIL", { infer: true });
    const privateKey = config.get("FIREBASE_PRIVATE_KEY", { infer: true })?.replace(/\\n/g, "\n");
    const emulator = !!process.env.FIREBASE_AUTH_EMULATOR_HOST && config.get("NODE_ENV", { infer: true }) !== "production";
    this.configured = !!projectId && (emulator || (!!clientEmail && !!privateKey));
    if (!this.configured) {
      this.logger.warn("Firebase Admin is not configured — authenticated requests will be rejected (fail closed).");
      return;
    }
    this.app =
      getApps().find((a) => a.name === "interviewos") ??
      initializeApp(emulator ? { projectId } : { projectId, credential: cert({ projectId, clientEmail, privateKey }) }, "interviewos");
  }

  async verify(token: string): Promise<VerifyResult> {
    if (!this.app) return { ok: false, reason: "invalid" };
    try {
      // checkRevoked=true also rejects tokens of disabled users.
      const d = await getAuth(this.app).verifyIdToken(token, true);
      return {
        ok: true,
        identity: {
          uid: d.uid,
          email: d.email ?? null,
          emailVerified: d.email_verified === true,
          name: (d.name as string | undefined) ?? null,
          signInProvider: d.firebase?.sign_in_provider ?? null,
        },
      };
    } catch (e) {
      const code = (e as { code?: string }).code;
      this.logger.debug(`Token rejected: ${code ?? "invalid"}`);
      return { ok: false, reason: reasonFromFirebaseError(code) };
    }
  }
}

/**
 * DEVELOPMENT / AUTOMATED-TEST ONLY. Accepts "test:<uid>", "test:<uid>:<email>" or "test:<uid>:<email>:<provider>".
 * Refuses to operate when NODE_ENV=production (startup also rejects AUTH_MODE=test there).
 * It never grants roles: roles always come from the database.
 */
@Injectable()
export class TestTokenVerifier extends TokenVerifier {
  readonly configured: boolean;
  constructor(config: ConfigService<EnvironmentVariables, true>) {
    super();
    this.configured = config.get("NODE_ENV", { infer: true }) !== "production";
  }
  async verify(token: string): Promise<VerifyResult> {
    if (!this.configured || !token.startsWith("test:")) return { ok: false, reason: "invalid" };
    const [, uid, email, provider] = token.split(":");
    if (!uid || !/^[\w-]{3,64}$/.test(uid)) return { ok: false, reason: "invalid" };
    return { ok: true, identity: { uid, email: email || null, emailVerified: !!email, name: null, signInProvider: provider || "test" } };
  }
}
