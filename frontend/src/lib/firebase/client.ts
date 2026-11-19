"use client";
/**
 * Firebase Web SDK bootstrap (browser only). Values come from NEXT_PUBLIC_FIREBASE_* at build time.
 * These identify the Firebase project and are public by design; they are NOT secrets.
 * Server credentials (service-account keys) never appear in the frontend.
 */
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { browserLocalPersistence, connectAuthEmulator, getAuth, setPersistence, type Auth } from "firebase/auth";

// Each variable is referenced literally so Next.js can inline it at build time.
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
};
/** Development only: e.g. 127.0.0.1:9099. Ignored in production builds. */
const EMULATOR_HOST = process.env.NODE_ENV !== "production" ? process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST?.trim() : undefined;

export const firebaseMissingKeys = (["apiKey", "authDomain", "projectId", "appId"] as const).filter((k) => !config[k]);
export const isFirebaseConfigured = firebaseMissingKeys.length === 0;
export const usingAuthEmulator = !!EMULATOR_HOST;

let auth: Auth | null = null;
let ready: Promise<Auth> | null = null;

/** Returns the singleton Auth instance with local (IndexedDB) persistence managed by the SDK. */
export function getFirebaseAuth(): Promise<Auth> {
  if (!isFirebaseConfigured) return Promise.reject(new Error(`Firebase is not configured (missing ${firebaseMissingKeys.join(", ")}).`));
  if (typeof window === "undefined") return Promise.reject(new Error("Firebase Auth is only available in the browser."));
  ready ??= (async () => {
    const app: FirebaseApp = getApps().length ? getApp() : initializeApp(config);
    auth = getAuth(app);
    if (EMULATOR_HOST && !(auth as Auth & { emulatorConfig?: unknown }).emulatorConfig) {
      connectAuthEmulator(auth, `http://${EMULATOR_HOST}`, { disableWarnings: true });
    }
    await setPersistence(auth, browserLocalPersistence);
    auth.useDeviceLanguage();
    return auth;
  })();
  return ready;
}

export const currentFirebaseAuth = () => auth;
