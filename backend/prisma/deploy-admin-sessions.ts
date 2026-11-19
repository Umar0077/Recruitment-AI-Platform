/** Narrow deployment guard: only the additive admin session migration, only existing local databases. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";
import { PrismaClient } from "@prisma/client";

const migration = "202611180002_admin_sessions";
let phase = "configuration";
async function main() {
  const apply = process.argv.includes("--apply"), env = parse(readFileSync(resolve(__dirname, "../.env")));
  const localMigrations = readdirSync(resolve(__dirname, "../../database/prisma/migrations"), { withFileTypes: true }).filter(item => item.isDirectory()).map(item => item.name).sort();
  const reports: { database: string; pending: string[]; applied: boolean }[] = [];
  // Inspect both databases before mutating either one. No pending older work may be swept into deployment.
  for (const [name, target] of [["test", env.TEST_DATABASE_URL], ["development", env.DATABASE_URL]]) {
    assert(target, "Database configuration required.");
    const url = new URL(target);
    assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Only local databases are allowed.");
    assert(name !== "test" || /_test$/.test(url.pathname), "Separate test database required.");
    assert(env.TEST_DATABASE_URL !== env.DATABASE_URL, "Test and development databases must differ.");
    phase = `${name} migration inspection`;
    const db = new PrismaClient({ datasources: { db: { url: target } }, log: [] });
    try {
      const rows = await db.$queryRaw<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]>`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations`;
      assert(!rows.some(row => !row.finished_at && !row.rolled_back_at), "Resolve failed migrations before deployment.");
      const applied = new Set(rows.filter(row => row.finished_at && !row.rolled_back_at).map(row => row.migration_name));
      const pending = localMigrations.filter(name => !applied.has(name));
      reports.push({ database: name, pending, applied: false });
    } finally { await db.$disconnect(); }
  }
  process.stdout.write(JSON.stringify({ status: "inspected", databases: reports }) + "\n");
  if (!apply) return;
  assert(reports.every(report => report.pending.length === 0 || report.pending.length === 1 && report.pending[0] === migration), "Only the admin session migration may be pending.");
  for (const report of reports) {
    if (!report.pending.length) continue;
    phase = `${report.database} additive migration`;
    const target = report.database === "test" ? env.TEST_DATABASE_URL : env.DATABASE_URL;
    execFileSync(process.execPath, [require.resolve("prisma/build/index.js"), "migrate", "deploy", "--schema=../database/prisma/schema.prisma"], { cwd: resolve(__dirname, ".."), env: { ...process.env, DATABASE_URL: target }, stdio: "pipe", timeout: 120000 });
    report.applied = true;
  }
  process.stdout.write(JSON.stringify({ status: "complete", databases: reports, reset: false, seed: false, applicationRecordUpdates: 0 }) + "\n");
}
void main().catch(() => { process.stderr.write(JSON.stringify({ status: "failed", phase, details: "suppressed; no raw SQL, connection strings, or environment values are logged" }) + "\n"); process.exitCode = 1; });
