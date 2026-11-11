import { plainToInstance, Transform } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength, validateSync } from "class-validator";

const toBool = ({ value }: { value: unknown }) => value === true || value === "true" || value === "1";

/** Every environment variable the backend reads. Validated once at startup; invalid config fails fast. */
export class EnvironmentVariables {
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

  /**
   * Firebase sign-in providers the API accepts (comma-separated). InterviewOS supports Google only.
   * Tokens from any other provider (e.g. apple.com, password) are refused even if enabled in Firebase.
   */
  @IsString()
  AUTH_ALLOWED_PROVIDERS = "google.com";

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
    if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
      throw new Error("Firebase Admin credentials (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) are required in production.");
    }
    if (env.FRONTEND_ORIGINS.split(",").some((o) => o.trim() === "*")) throw new Error("Wildcard CORS origin is not allowed in production.");
  }
  return env;
}
