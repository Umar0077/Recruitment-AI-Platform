/** Runs before every test file: point the app at the isolated TEST database, never the dev one. */
import { config } from "dotenv";

config({ quiet: true } as never);
const url = process.env.TEST_DATABASE_URL;
if (!url || !/\/[\w-]*test[\w-]*(\?|$)/.test(url)) {
  throw new Error("TEST_DATABASE_URL must be set and point at a database whose name contains 'test'.");
}
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: url,
  AUTH_MODE: "test",
  SWAGGER_ENABLED: "false",
  LOG_LEVEL: "error",
  RATE_LIMIT_PER_MINUTE: "10000",
  JOBS_IN_PROCESS: "false",
  REDIS_ENABLED: "false",
  RECRUITER_SCOPE: "all",
  CAREERS_INTEGRATION_KEY: "e2e-integration-key-0123456789abcdef0123",
});
