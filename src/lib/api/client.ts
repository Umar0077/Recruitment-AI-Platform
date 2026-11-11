/**
 * Typed HTTP client for the InterviewOS backend.
 *  - Attaches the Firebase ID token as `Authorization: Bearer …`. Tokens come from the Firebase SDK
 *    on each request (it caches and refreshes them); this module never stores or logs them.
 *  - On 401 it retries once with a force-refreshed token; if that still fails, auth listeners are told.
 *  - Unwraps the { success, data, meta } envelope; any failure throws ApiError.
 *  - Never falls back to demo data. In demo mode every call throws API_DISABLED.
 */
import { API_BASE_URL, isApiMode } from "@/lib/config/environment";
import type { ApiEnvelope, ApiMeta } from "./types";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
  get isAuth() {
    return this.status === 401;
  }
  get isForbidden() {
    return this.status === 403;
  }
}

/** Returns an ID token for the signed-in user (fresh when forceRefresh), or null when signed out. */
export type TokenProvider = (forceRefresh?: boolean) => Promise<string | null>;
let tokenProvider: TokenProvider = async () => null;
export const setTokenProvider = (fn: TokenProvider) => {
  tokenProvider = fn;
};

/** Notified when the backend rejects the session (401) or the account (403 ACCOUNT_DISABLED). */
type AuthFailureListener = (err: ApiError) => void;
const authFailureListeners = new Set<AuthFailureListener>();
export const onAuthFailure = (fn: AuthFailureListener) => {
  authFailureListeners.add(fn);
  return () => void authFailureListeners.delete(fn);
};

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  /** Default 20s. */
  timeoutMs?: number;
  /** Skip the Authorization header (public endpoints). */
  anonymous?: boolean;
}

async function send(url: URL, opts: RequestOptions, forceRefresh: boolean) {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (!opts.anonymous) {
    const token = await tokenProvider(forceRefresh);
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? 20_000);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  try {
    return await fetch(url, { method: opts.method ?? "GET", headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body), signal, credentials: "omit", cache: "no-store" });
  } catch (e) {
    const aborted = e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new ApiError(aborted ? "TIMEOUT" : "NETWORK_ERROR", aborted ? "The server took too long to respond." : "Could not reach the server. Check your connection.", 0);
  }
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<{ data: T; meta: ApiMeta }> {
  if (!isApiMode) throw new ApiError("API_DISABLED", "The app is running in demo mode; the backend API is not used.", 0);

  const url = new URL(`${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));

  let res = await send(url, opts, false);
  // An ID token can expire between requests; get a fresh one and retry once.
  if (res.status === 401 && !opts.anonymous) res = await send(url, opts, true);

  let body: ApiEnvelope<T> | null = null;
  try {
    body = (await res.json()) as ApiEnvelope<T>;
  } catch {
    /* non-JSON response (e.g. proxy error page) */
  }
  if (!body || typeof body !== "object" || !("success" in body)) {
    throw new ApiError("BAD_RESPONSE", `Unexpected response from the server (HTTP ${res.status}).`, res.status);
  }
  if (!body.success) {
    const err = new ApiError(body.error.code, body.error.message, res.status, body.error.details, body.meta?.requestId);
    if (!opts.anonymous && (res.status === 401 || body.error.code === "ACCOUNT_DISABLED")) authFailureListeners.forEach((fn) => fn(err));
    throw err;
  }
  return { data: body.data, meta: body.meta };
}
