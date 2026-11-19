import { plainToInstance, Transform } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, validateSync } from "class-validator";
import { validateFirebaseConfig } from "./firebase.config";

const toBool = ({ value }: { value: unknown }) => value === true || value === "true" || value === "1";

/** Every environment variable the backend reads. Validated once at startup; invalid config fails fast. */
export class EnvironmentVariables {
  @IsIn(["approved", "local_test"]) RECORDING_MODE = "approved";
  @IsIn(["bucket", "probe"]) RECORDING_S3_CORS_MODE = "bucket";
  @IsBoolean() @Transform(toBool) RECORDING_ENABLED = false;
  @IsBoolean() @Transform(toBool) RECORDING_UPLOAD_ENABLED = false;
  @IsBoolean() @Transform(toBool) RECORDING_MONITORING_ENABLED = false;
  @IsBoolean() @Transform(toBool) RECORDING_CAMERA_ENABLED = true;
  @IsIn(["selected_surface", "full_display"]) RECORDING_SCREEN_REQUIREMENT = "selected_surface";
  @IsInt() @Min(0) @Max(3650) @Transform(({ value }) => Number(value)) RECORDING_RETENTION_DAYS = 0;
  @IsString() @MaxLength(200) RECORDING_POLICY_REFERENCE = "";
  @IsString() RECORDING_SUPPORT_EMAIL = "";
  @IsInt() @Min(10) @Max(2047) @Transform(({ value }) => Number(value)) RECORDING_MAX_MB = 256;
  @IsInt() @Min(640) @Max(1920) @Transform(({ value }) => Number(value)) RECORDING_WIDTH = 1280;
  @IsInt() @Min(360) @Max(1080) @Transform(({ value }) => Number(value)) RECORDING_HEIGHT = 720;
  @IsInt() @Min(15) @Max(24) @Transform(({ value }) => Number(value)) RECORDING_FPS = 20;
  @IsInt() @Min(500000) @Max(4000000) @Transform(({ value }) => Number(value)) RECORDING_VIDEO_BITRATE = 1800000;
  @IsString() RECORDING_S3_ENDPOINT = "";
  @IsString() RECORDING_S3_REGION = "us-east-1";
  @IsString() RECORDING_S3_BUCKET = "";
  @IsString() RECORDING_S3_ACCESS_KEY = "";
  @IsString() RECORDING_S3_SECRET_KEY = "";
  @IsBoolean() @Transform(toBool) RECORDING_S3_PATH_STYLE = true;

  @IsString() OPENROUTER_API_KEY = "";
  @IsIn(["https://openrouter.ai/api/v1"]) OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
  @IsString() @MinLength(3) OPENROUTER_MODEL = "nvidia/nemotron-3.5-super-vl:free";
  @IsString() OPENROUTER_SITE_URL = "http://localhost:3000";
  @IsString() OPENROUTER_APP_NAME = "InterviewOS";
  @IsBoolean() @Transform(toBool) AI_ASSESSMENT_ENABLED = true;
  @IsIn(["synthetic_test_only", "approved_production", "disabled"]) AI_ASSESSMENT_MODE = "synthetic_test_only";
  /** Approval must name the exact model, plus an external review reference. Free endpoints remain synthetic-only. */
  @IsString() AI_APPROVED_MODEL = "";
  @IsString() AI_PROVIDER_APPROVAL_REFERENCE = "";
  @IsInt() @Min(1) @Max(10000) @Transform(({ value }) => Number(value)) AI_MAX_REQUESTS_PER_DAY = 40;
  @IsInt() @Min(1) @Max(100) @Transform(({ value }) => Number(value)) AI_MAX_REQUESTS_PER_MINUTE = 15;
  @IsInt() @Min(0) @Max(2) @Transform(({ value }) => Number(value)) AI_MAX_RETRIES = 2;
  @IsInt() @Min(100) @Max(120000) @Transform(({ value }) => Number(value)) AI_REQUEST_TIMEOUT_MS = 60000;
  @IsInt() @Min(1) @Max(4) @Transform(({ value }) => Number(value)) AI_MAX_CONCURRENT_REQUESTS = 1;
  @IsIn([true]) @Transform(toBool) AI_REQUIRE_HR_APPROVED_RUBRIC = true;
  @IsIn(["development", "test", "production"])
  NODE_ENV: "development" | "test" | "production" = "development";

  @IsInt() @Min(1) @Max(65535)
  @Transform(({ value }) => Number(value))
  PORT = 4000;

  @IsString()
  API_PREFIX = "api/v1";

  @IsString() @MinLength(10)
  DATABASE_URL!: string;

  /** Comma-separated allowlist of browser origins. Never "*". */
  @IsString()
  FRONTEND_ORIGINS = "http://localhost:3000";

  /** firebase = verify Firebase ID tokens (required in production). test = fixed test tokens (dev/test only). */
  @IsIn(["firebase", "test"])
  AUTH_MODE: "firebase" | "test" = "firebase";

  @IsOptional() @IsString() FIREBASE_PROJECT_ID?: string;
  @IsOptional() @IsString() FIREBASE_CLIENT_EMAIL?: string;
  @IsOptional() @IsString() FIREBASE_PRIVATE_KEY?: string;
  /** Path only; never paste the JSON or expose this variable to the frontend. */
  @IsOptional() @IsString() GOOGLE_APPLICATION_CREDENTIALS?: string;
  /** Development/test only, and only with a demo- project ID. */
  @IsOptional() @IsString() FIREBASE_AUTH_EMULATOR_HOST?: string;

  /**
   * Firebase sign-in providers the API accepts (comma-separated): Google and email/password only.
   * Other providers are refused even if enabled in Firebase.
   */
  @IsString()
  AUTH_ALLOWED_PROVIDERS = "google.com,password";

  /** Link a new login to an existing candidate only when Firebase reports a verified email that matches exactly one unlinked candidate. */
  @IsBoolean() @Transform(toBool)
  AUTO_LINK_CANDIDATE_BY_VERIFIED_EMAIL = true;

  /** all = recruiters see every application; assigned = only applications assigned to them. */
  @IsIn(["all", "assigned"])
  RECRUITER_SCOPE: "all" | "assigned" = "all";

  @IsBoolean() @Transform(toBool)
  REDIS_ENABLED = false;
  @IsString() REDIS_HOST = "127.0.0.1";
  @IsInt() @Transform(({ value }) => Number(value)) REDIS_PORT = 6379;
  @IsOptional() @IsString() REDIS_PASSWORD?: string;

  /** Set true only behind a reverse proxy (Nginx) so rate limiting sees the real client IP. */
  @IsBoolean() @Transform(toBool)
  TRUST_PROXY = false;

  /** Run expiry/reminder housekeeping inside the API process (use when there is no Redis worker). */
  @IsBoolean() @Transform(toBool)
  JOBS_IN_PROCESS = true;

  @IsBoolean() @Transform(toBool)
  SWAGGER_ENABLED = false;

  @IsIn(["fatal", "error", "warn", "info", "debug", "trace"])
  LOG_LEVEL = "info";

  @IsString()
  APP_TIMEZONE = "Asia/Karachi";

  @IsInt() @Min(1) @Max(720) @Transform(({ value }) => Number(value))
  INTERVIEW_COMPLETION_WINDOW_HOURS = 48;

  @IsInt() @Min(1) @Max(720) @Transform(({ value }) => Number(value))
  INTERVIEW_REMINDER_AFTER_HOURS = 24;

  /** Shared secret for the Careers Website server-to-server integration (min 32 chars). */
  @IsOptional() @IsString() @MinLength(32)
  CAREERS_INTEGRATION_KEY?: string;

  @IsBoolean() @Transform(toBool)
  MEDIA_STORAGE_ENABLED = false;

  @IsInt() @Min(1) @Max(10000) @Transform(({ value }) => Number(value))
  RATE_LIMIT_PER_MINUTE = 300;
}

export function validateEnv(config: Record<string, unknown>) {
  const env = plainToInstance(EnvironmentVariables, config, { enableImplicitConversion: false, exposeDefaultValues: true });
  const errors = validateSync(env, { skipMissingProperties: false });
  if (errors.length) {
    throw new Error(`Invalid environment configuration:\n${errors.map((e) => ` - ${e.property}: ${Object.values(e.constraints ?? {}).join(", ")}`).join("\n")}`);
  }
  // Fail closed: production must verify real Firebase tokens.
  if (env.NODE_ENV === "production") {
    if (env.AUTH_MODE !== "firebase") throw new Error("AUTH_MODE=test is not allowed in production.");
    if (env.FRONTEND_ORIGINS.split(",").some((o) => o.trim() === "*")) throw new Error("Wildcard CORS origin is not allowed in production.");
  }
  validateFirebaseConfig(env);
  if (env.RECORDING_MODE === "local_test") {
    const local = (host: string) => ["localhost", "127.0.0.1", "[::1]"].includes(host);
    let database: URL, storage: URL;
    try { database = new URL(env.DATABASE_URL); storage = new URL(env.RECORDING_S3_ENDPOINT); } catch { throw new Error("Local recording tests require dedicated local database and storage URLs."); }
    if (env.NODE_ENV === "production" || !local(database.hostname) || database.pathname !== "/interviewos_recording_lab" || !local(storage.hostname) || env.RECORDING_S3_BUCKET !== "interviewos-recording-lab" || env.AUTH_MODE !== "firebase" || env.FIREBASE_PROJECT_ID !== "demo-interviewos-recording" || env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9199" || env.FRONTEND_ORIGINS !== "http://127.0.0.1:3100" || env.RECORDING_RETENTION_DAYS !== 1 || env.AI_ASSESSMENT_MODE !== "disabled" || env.AI_ASSESSMENT_ENABLED || env.OPENROUTER_API_KEY) throw new Error("Local recording tests must use the isolated lab database, bucket, Firebase emulator, origin and one-day test cleanup, with AI disabled.");
  }
  if (env.RECORDING_S3_CORS_MODE === "probe" && env.RECORDING_MODE !== "local_test") throw new Error("CORS probing is restricted to the isolated local recording lab.");
  if (env.RECORDING_S3_ENDPOINT) {
    let endpoint: URL;
    try { endpoint = new URL(env.RECORDING_S3_ENDPOINT); } catch { throw new Error("RECORDING_S3_ENDPOINT must be an HTTP(S) origin."); }
    if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !["https:", "http:"].includes(endpoint.protocol) || endpoint.pathname !== "/") throw new Error("RECORDING_S3_ENDPOINT must be an HTTP(S) origin without credentials.");
    if (endpoint.protocol !== "https:" && (env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname))) throw new Error("Recording storage requires HTTPS outside local development.");
  }
  if (env.RECORDING_ENABLED && env.RECORDING_UPLOAD_ENABLED && (env.RECORDING_RETENTION_DAYS < 1 || !env.RECORDING_POLICY_REFERENCE.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.RECORDING_SUPPORT_EMAIL))) throw new Error("Enable recording only with approved retention, policy reference and support email.");
  const providers = env.AUTH_ALLOWED_PROVIDERS.split(",").map(p => p.trim());
  if (providers.some(p => !["google.com", "password"].includes(p))) {
    throw new Error("AUTH_ALLOWED_PROVIDERS must contain only google.com and/or password.");
  }
  return env;
}
