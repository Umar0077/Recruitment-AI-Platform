import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPrivateKey } from "node:crypto";
import type { ServiceAccount } from "firebase-admin/app";
import type { EnvironmentVariables } from "./env.validation";

type FirebaseSettings = Pick<EnvironmentVariables, "NODE_ENV" | "AUTH_MODE" | "FIREBASE_PROJECT_ID" | "FIREBASE_CLIENT_EMAIL" | "FIREBASE_PRIVATE_KEY" | "GOOGLE_APPLICATION_CREDENTIALS" | "FIREBASE_AUTH_EMULATOR_HOST">;

function validatePrivateKey(key: string): void {
  try {
    if (createPrivateKey(key).asymmetricKeyType !== "rsa") throw new Error();
  } catch {
    // OpenSSL/JSON/filesystem errors can include credential fragments. Never propagate them.
    throw new Error("Firebase service-account private key is invalid; credential contents withheld.");
  }
}

/** Relative paths are anchored to the backend directory in both src/config and dist/config. */
export function readFirebaseServiceAccount(file: string, projectId: string): ServiceAccount {
  let data: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(readFileSync(resolve(__dirname, "../..", file), "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    data = parsed as Record<string, unknown>;
  } catch {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS must reference a readable service-account JSON file; contents withheld.");
  }
  if (data.type !== "service_account" || typeof data.project_id !== "string" || typeof data.client_email !== "string" || !data.client_email || typeof data.private_key !== "string" || !data.private_key) {
    throw new Error("Firebase service-account JSON is missing required fields; contents withheld.");
  }
  if (data.project_id !== projectId) throw new Error("Firebase service-account project does not match FIREBASE_PROJECT_ID.");
  validatePrivateKey(data.private_key);
  return { projectId, clientEmail: data.client_email, privateKey: data.private_key };
}

/** Fail closed on conflicting real/emulator configuration, in every environment. */
export function validateFirebaseConfig(env: FirebaseSettings): void {
  const rawHost = env.FIREBASE_AUTH_EMULATOR_HOST ?? "";
  const host = rawHost.trim();
  if (rawHost !== host) throw new Error("FIREBASE_AUTH_EMULATOR_HOST must not contain surrounding whitespace.");
  if (host && env.NODE_ENV === "production") throw new Error("FIREBASE_AUTH_EMULATOR_HOST is forbidden in production.");
  if (env.AUTH_MODE !== "firebase") return;
  if (host) {
    if (!/^(?:[a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\]):\d{1,5}$/.test(host) || Number(host.split(":").at(-1)) < 1 || Number(host.split(":").at(-1)) > 65535) {
      throw new Error("FIREBASE_AUTH_EMULATOR_HOST must be host:port without a URL scheme.");
    }
    if (!env.FIREBASE_PROJECT_ID?.startsWith("demo-")) throw new Error("Firebase Auth Emulator requires a demo- project ID; real projects cannot use emulator verification.");
    if (env.GOOGLE_APPLICATION_CREDENTIALS || env.FIREBASE_CLIENT_EMAIL || env.FIREBASE_PRIVATE_KEY) throw new Error("Remove real Firebase credentials when using the Auth Emulator.");
    return;
  }
  const file = env.GOOGLE_APPLICATION_CREDENTIALS;
  const email = env.FIREBASE_CLIENT_EMAIL;
  const key = env.FIREBASE_PRIVATE_KEY;
  if (file && (email || key)) throw new Error("Choose GOOGLE_APPLICATION_CREDENTIALS or inline Firebase credentials, not both.");
  if ((file || email || key) && !env.FIREBASE_PROJECT_ID) throw new Error("FIREBASE_PROJECT_ID is required for Firebase credentials.");
  if (!!email !== !!key) throw new Error("Inline Firebase credentials require both FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.");
  if (file) readFirebaseServiceAccount(file, env.FIREBASE_PROJECT_ID!);
  else if (key) validatePrivateKey(key.replace(/\\n/g, "\n"));
  else if (env.NODE_ENV === "production") throw new Error("Production requires GOOGLE_APPLICATION_CREDENTIALS or complete inline Firebase credentials.");
}
