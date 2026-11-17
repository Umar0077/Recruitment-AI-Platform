/** Repeatable localhost HTTP/compile measurements; does not automate a browser or contact application APIs. */
import { spawn, spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
const require = createRequire(import.meta.url);
const label = process.argv[2] ?? "baseline";
const includeApiUsage = process.argv.includes("--include-api-usage");
if (!/^[a-z0-9-]+$/.test(label)) throw new Error("Use a simple measurement label.");
const port = 3102;
const startedAt = new Date().toISOString();
const started = performance.now();
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--turbo", "--port", String(port)], {
  cwd: process.cwd(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, NEXT_PUBLIC_APP_MODE: "demo", NEXT_TELEMETRY_DISABLED: "1" },
});
const evidence = {
  label, startedAt, conditions: { node: process.version, next: require("next/package.json").version, react: require("react/package.json").version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, memoryGb: Math.round(os.totalmem() / 1024 ** 3), workspaceOnOneDrive: process.cwd().includes("OneDrive"), mode: "demo", bundler: "Turbopack", port, coldDefinition: "First request for each route in a new dev-server process; existing .next and filesystem caches retained", browser: false },
  startupMs: null, readyReported: null, routes: [], compileLog: [],
};
let readyResolve, readyReject;
const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
const timer = setTimeout(() => readyReject(new Error("Dev server startup timed out")), 120000);
const collect = (buffer) => {
  for (const line of buffer.toString().replace(/\x1b\[[0-9;]*m/g, "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/Ready in /.test(trimmed)) { evidence.startupMs = Math.round(performance.now() - started); evidence.readyReported = trimmed; readyResolve(); }
    if (/Compiled .* in |GET \/.* \d{3} in /.test(trimmed)) evidence.compileLog.push(trimmed);
  }
};
child.stdout.on("data", collect); child.stderr.on("data", collect);
child.on("error", () => readyReject(new Error("Unable to start local dev process")));
child.on("exit", code => { if (evidence.startupMs === null) readyReject(new Error(`Dev server exited before ready (${code})`)); });
async function measure(route, sample) {
  const start = performance.now();
  const response = await fetch(`http://127.0.0.1:${port}${route}`, { signal: AbortSignal.timeout(120000) });
  const headersMs = performance.now() - start;
  const body = await response.text();
  return { sample, status: response.status, headersMs: Math.round(headersMs), completeHtmlMs: Math.round(performance.now() - start), htmlBytes: Buffer.byteLength(body) };
}
try {
  await ready; clearTimeout(timer);
  for (const route of ["/candidate/login", "/candidate/interview", "/admin", "/", ...(includeApiUsage ? ["/admin/api-usage"] : [])]) {
    const samples = [];
    for (let i = 0; i < 4; i++) samples.push(await measure(route, i === 0 ? "first" : `warm-${i}`));
    evidence.routes.push({ route, samples });
    process.stdout.write(JSON.stringify({ route, samples }) + "\n");
  }
  await mkdir("docs/performance", { recursive: true });
  await writeFile(path.join("docs/performance", `${label}.json`), JSON.stringify(evidence, null, 2) + "\n");
  process.stdout.write(JSON.stringify({ label, startupMs: evidence.startupMs, readyReported: evidence.readyReported, result: "recorded", processId: child.pid }) + "\n");
} finally {
  clearTimeout(timer);
  if (process.platform === "win32" && child.pid) spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  else child.kill("SIGTERM");
}
