/**
 * Frontend runtime mode — chosen explicitly at build time, never inferred.
 *
 *  - "demo" (default): the app runs entirely on the in-browser demo store (src/lib/demo). No network calls.
 *  - "api": the app talks to the InterviewOS backend. Requests that fail show an error;
 *    they NEVER fall back to demo data.
 *
 * Set in .env.local:
 *   NEXT_PUBLIC_APP_MODE=api
 *   NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1
 */
export type AppMode = "demo" | "api";

const rawMode = process.env.NEXT_PUBLIC_APP_MODE;
if (rawMode && rawMode !== "demo" && rawMode !== "api") {
  throw new Error(`NEXT_PUBLIC_APP_MODE must be "demo" or "api" (got "${rawMode}").`);
}

export const APP_MODE: AppMode = rawMode === "api" ? "api" : "demo";
export const isDemoMode = APP_MODE === "demo";
export const isApiMode = APP_MODE === "api";

const rawBase = process.env.NEXT_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, "") ?? "";
if (isApiMode && !rawBase) {
  throw new Error("NEXT_PUBLIC_API_BASE_URL is required when NEXT_PUBLIC_APP_MODE=api.");
}
if (isApiMode && process.env.NODE_ENV === "production" && !rawBase.startsWith("https://")) {
  throw new Error("NEXT_PUBLIC_API_BASE_URL must use https:// in production builds.");
}

export const API_BASE_URL = rawBase;
