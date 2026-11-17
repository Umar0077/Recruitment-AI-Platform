/** Real production-build startup, read-only health and anonymous authorization checks. */
import "reflect-metadata";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { parse } from "dotenv";
import { validateEnv } from "../src/config/env.validation";

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
let phase = "configuration";
async function main() {
  const cwd = resolve(__dirname, ".."), port = 3197;
  const childEnv = { ...parse(readFileSync(resolve(cwd, ".env"))), ...process.env, NODE_ENV: "production", JOBS_IN_PROCESS: "false", PORT: String(port), HOST: "127.0.0.1", LOG_LEVEL: "error" };
  const config = validateEnv(childEnv);
  assert(config.AUTH_MODE === "firebase" && !config.FIREBASE_AUTH_EMULATOR_HOST, "Real Firebase mode required.");
  phase = "port availability";
  await new Promise<void>((yes, no) => { const server = createServer(); server.once("error", no); server.listen(port, "127.0.0.1", () => server.close(error => error ? no(error) : yes())); });
  phase = "production startup";
  const began = Date.now();
  const child = spawn(process.execPath, [resolve(cwd, "dist/main.js")], { cwd, env: childEnv, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  // Bound diagnostic capture to memory. Raw output is never written, returned, or rethrown.
  let captured = "", exited = false;
  const capture = (chunk: Buffer) => { if (captured.length < 131072) captured += chunk.toString().slice(0, 131072 - captured.length); };
  child.stdout.on("data", capture); child.stderr.on("data", capture);
  child.on("error", () => { exited = true; }); child.on("exit", () => { exited = true; });
  const prefix = config.API_PREFIX.replace(/^\/+|\/+$/g, ""), base = `http://127.0.0.1:${port}/${prefix}`;
  try {
    let live = false;
    while (!exited && Date.now() - began < 45000) {
      try { const response = await fetch(`${base}/health/live`, { signal: AbortSignal.timeout(1000), redirect: "error" }); live = response.status === 200; } catch { /* Startup is still in progress. */ }
      if (live) break;
      await pause(250);
    }
    assert(live && !exited, "Production startup failed.");
    const startupMs = Date.now() - began;
    phase = "read-only health";
    const healthStarted = Date.now(), response = await fetch(`${base}/health/ready`, { signal: AbortSignal.timeout(8000), redirect: "error" });
    const body: unknown = await response.json();
    const data = body && typeof body === "object" && "data" in body ? (body as { data: { status?: unknown; checks?: { database?: unknown; redis?: unknown } } }).data : undefined;
    assert(response.status === 200 && data?.status === "ok" && data.checks?.database === "up", "Readiness check failed.");
    const health = { httpStatus: response.status, status: "ok", database: "up", redis: ["up", "disabled"].includes(String(data.checks.redis)) ? String(data.checks.redis) : "unknown", elapsedMs: Date.now() - healthStarted };
    phase = "anonymous usage authorization";
    const authorization = [];
    for (const endpoint of ["api-usage/overview", "api-usage/history", "api-usage/provider", "ai/usage"]) {
      const started = Date.now(), result = await fetch(`${base}/${endpoint}`, { signal: AbortSignal.timeout(8000), redirect: "error" });
      assert.equal(result.status, 401, "Anonymous billing access must be rejected.");
      authorization.push({ endpoint, httpStatus: result.status, elapsedMs: Date.now() - started });
    }
    process.stdout.write(JSON.stringify({ status: "passed", productionMode: true, startupMs, health, authorization, firebaseProjectId: config.FIREBASE_PROJECT_ID, firebaseRealMode: true, workersStarted: false, applicationRecordWrites: 0, rawLogsSuppressed: true }, null, 2) + "\n");
  } finally {
    captured = "";
    if (!exited) { child.kill(); for (let i = 0; i < 20 && !exited; i++) await pause(100); }
    if (!exited) child.kill("SIGKILL");
  }
}
void main().catch(() => { process.stderr.write(JSON.stringify({ status: "failed", phase, details: "suppressed; no raw logs, credential values, or connection URLs are returned" }) + "\n"); process.exitCode = 1; });
