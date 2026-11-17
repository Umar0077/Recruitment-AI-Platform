/** Dedicated local recording lab. Never resets a database or reads real candidate records. */
import "reflect-metadata";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { parse } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { S3Client, CreateBucketCommand, HeadBucketCommand, PutBucketLifecycleConfigurationCommand, GetBucketPolicyCommand } from "@aws-sdk/client-s3";
import { ConfigService } from "@nestjs/config";
import { initializeAdmin } from "../src/modules/auth/admin-bootstrap";
import { passwordHash } from "../src/modules/auth/admin-auth.service";
import { validateEnv } from "../src/config/env.validation";
import { RecordingStorage } from "../src/integrations/storage/recording-storage";
const backend = resolve(__dirname, ".."), root = resolve(backend, ".."), lab = resolve(root, "interviewos-infrastructure/recording-lab"), runtime = resolve(lab, "runtime"), envPath = resolve(runtime, "backend.env");
const labDatabase = "interviewos_recording_lab", project = "demo-interviewos-recording";
let phase = "configuration";
function fileEnv(values: Record<string, string>) { return Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n") + "\n"; }
function checkedEnv() {
  const values = parse(readFileSync(envPath)); validateEnv(values);
  assert.equal(values.RECORDING_MODE, "local_test"); assert.equal(new URL(values.DATABASE_URL).pathname, `/${labDatabase}`);
  return values;
}
async function setup() {
  mkdirSync(runtime, { recursive: true });
  const storageEnv = parse(readFileSync(resolve(lab, ".env")));
  const original = parse(readFileSync(resolve(backend, ".env")));
  const database = new URL(original.DATABASE_URL); assert(["localhost", "127.0.0.1", "[::1]"].includes(database.hostname));
  database.pathname = `/${labDatabase}`;
  phase = "create isolated database if missing";
  const admin = new PrismaClient({ datasources: { db: { url: original.DATABASE_URL } }, log: [] });
  try {
    const present = await admin.$queryRaw<{ exists: boolean }[]>`SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = ${labDatabase}) AS exists`;
    if (!present[0].exists) await admin.$executeRawUnsafe('CREATE DATABASE "interviewos_recording_lab"');
  } finally { await admin.$disconnect(); }
  const values: Record<string, string> = {
    NODE_ENV: "development", HOST: "127.0.0.1", PORT: "4100", DATABASE_URL: database.href, FRONTEND_ORIGINS: "http://127.0.0.1:3100", AUTH_MODE: "firebase", FIREBASE_PROJECT_ID: project, FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9199", GOOGLE_APPLICATION_CREDENTIALS: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", AUTH_ALLOWED_PROVIDERS: "google.com,password", JOBS_IN_PROCESS: "false", REDIS_ENABLED: "false", OPENROUTER_API_KEY: "", AI_ASSESSMENT_ENABLED: "false", AI_ASSESSMENT_MODE: "disabled", LOG_LEVEL: "warn", RECORDING_MODE: "local_test", RECORDING_ENABLED: "true", RECORDING_UPLOAD_ENABLED: "true", RECORDING_MONITORING_ENABLED: "true", RECORDING_CAMERA_ENABLED: "true", RECORDING_SCREEN_REQUIREMENT: "selected_surface", RECORDING_RETENTION_DAYS: "1", RECORDING_POLICY_REFERENCE: "LOCAL-FICTIONAL-TEST-v1 (not an organization-approved applicant policy)", RECORDING_SUPPORT_EMAIL: "operator@example.test", RECORDING_MAX_MB: "128", RECORDING_S3_ENDPOINT: "http://127.0.0.1:9100", RECORDING_S3_REGION: "us-east-1", RECORDING_S3_BUCKET: "interviewos-recording-lab", RECORDING_S3_ACCESS_KEY: storageEnv.RECORDING_LAB_ACCESS_KEY, RECORDING_S3_SECRET_KEY: storageEnv.RECORDING_LAB_SECRET_KEY, RECORDING_S3_PATH_STYLE: "true", RECORDING_S3_CORS_MODE: "probe",
  };
  validateEnv(values); writeFileSync(envPath, fileEnv(values), { mode: 0o600 });
  writeFileSync(resolve(runtime, "frontend.env"), fileEnv({ INTERVIEWOS_RECORDING_LAB: "1", NEXT_PUBLIC_APP_MODE: "api", NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:4100/api/v1", NEXT_PUBLIC_FIREBASE_PROJECT_ID: project, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: `${project}.firebaseapp.com`, NEXT_PUBLIC_FIREBASE_API_KEY: "fictional-emulator-key", NEXT_PUBLIC_FIREBASE_APP_ID: "1:000000000000:web:recordinglab", NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "000000000000", NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9199" }), { mode: 0o600 });
  phase = "migrate and seed only the isolated database";
  const childEnv = { ...process.env, ...values, SEED_DEV_DATA: "false" };
  execFileSync(process.execPath, [require.resolve("prisma/build/index.js"), "migrate", "deploy"], { cwd: backend, env: childEnv, stdio: "pipe", timeout: 120000 });
  execFileSync(process.execPath, ["--import", "tsx", "prisma/seed.ts"], { cwd: backend, env: childEnv, stdio: "pipe", timeout: 60000 });
  phase = "fictional local credentials";
  const credentialsPath = resolve(runtime, "test-accounts.json");
  if (!existsSync(credentialsPath)) writeFileSync(credentialsPath, JSON.stringify({ candidateEmail: "candidate@example.test", candidatePassword: `Test-${randomBytes(24).toString("base64url")}Aa1!`, adminEmail: "reviewer@example.test", adminPassword: `Test-${randomBytes(24).toString("base64url")}Aa1!`, adminNextPassword: `Next-${randomBytes(24).toString("base64url")}Bb2!` }, null, 2), { mode: 0o600 });
  const credentials = JSON.parse(readFileSync(credentialsPath, "utf8")) as Record<string, string>;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = values.FIREBASE_AUTH_EMULATOR_HOST;
  const auth = getAuth(initializeApp({ projectId: project }, "recording-lab-setup"));
  try { await auth.getUser("recording-lab-candidate"); } catch (e) { if ((e as { code?: string }).code !== "auth/user-not-found") throw e; await auth.createUser({ uid: "recording-lab-candidate", email: credentials.candidateEmail, password: credentials.candidatePassword, emailVerified: true, displayName: "Fictional Recording Candidate" }); }
  const db = new PrismaClient({ datasources: { db: { url: values.DATABASE_URL } }, log: [] });
  try { await initializeAdmin(db, await passwordHash(credentials.adminPassword), credentials.adminEmail); } finally { await db.$disconnect(); }
  phase = "private bucket and cleanup policy";
  const client = new S3Client({ endpoint: values.RECORDING_S3_ENDPOINT, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: values.RECORDING_S3_ACCESS_KEY, secretAccessKey: values.RECORDING_S3_SECRET_KEY }, requestChecksumCalculation: "WHEN_REQUIRED" });
  const Bucket = values.RECORDING_S3_BUCKET;
  try { await client.send(new HeadBucketCommand({ Bucket })); } catch (e) { if (!["NotFound", "NoSuchBucket"].includes((e as Error).name)) throw e; await client.send(new CreateBucketCommand({ Bucket })); }
  // Refuse to repurpose any existing public policy. Never silently strip other access configuration.
  try { const policy = await client.send(new GetBucketPolicyCommand({ Bucket })); assert(!policy.Policy || policy.Policy === "{}"); } catch (e) { if ((e as Error).name !== "NoSuchBucketPolicy") throw e; }
  await client.send(new PutBucketLifecycleConfigurationCommand({ Bucket, LifecycleConfiguration: { Rules: [{ ID: "fictional-recording-cleanup", Status: "Enabled", Filter: { Prefix: "interviews/" }, Expiration: { Days: 1 }, AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 } }] } }));
  client.destroy();
  const storage = new RecordingStorage(new ConfigService(validateEnv(values)));
  const storageReady = await storage.ready();
  if (!storageReady) phase = `private storage: ${storage.readinessIssue}`;
  assert(storageReady);
  process.stdout.write(JSON.stringify({ status: "ready", frontend: "http://127.0.0.1:3100", backend: "http://127.0.0.1:4100", firebase: project, database: labDatabase, privateStorage: true, retention: "one-day fictional test cleanup only", realApplicantConfigurationChanged: false, credentials: "runtime/test-accounts.json (values withheld)" }) + "\n");
}
function run(kind: "backend" | "frontend") {
  const values = checkedEnv();
  const extra = kind === "backend" ? values : parse(readFileSync(resolve(runtime, "frontend.env")));
  const args = kind === "backend" ? ["dist/main.js"] : ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3100"];
  const child = spawn(process.execPath, args, { cwd: kind === "backend" ? backend : root, env: { ...process.env, ...extra }, windowsHide: true, stdio: "inherit" });
  process.on("SIGINT", () => child.kill()); process.on("SIGTERM", () => child.kill()); child.on("exit", code => { process.exitCode = code ?? 1; });
}
const command = process.argv[2];
if (command === "init") {
  const path = resolve(lab, ".env");
  if (!existsSync(path)) writeFileSync(path, fileEnv({ RECORDING_LAB_ACCESS_KEY: randomBytes(16).toString("hex"), RECORDING_LAB_SECRET_KEY: randomBytes(32).toString("hex") }), { mode: 0o600 });
  process.stdout.write("Local storage credentials ready in ignored .env; values withheld.\n");
}
else if (command === "backend" || command === "frontend") run(command);
else if (command === "setup") void setup().catch(e => { process.stderr.write(JSON.stringify({ status: "failed", phase, category: e instanceof Error ? e.name : "UnknownError", details: "Credentials and raw errors withheld." }) + "\n"); process.exitCode = 1; });
else { process.stderr.write("Use init, setup, backend or frontend.\n"); process.exitCode = 1; }
