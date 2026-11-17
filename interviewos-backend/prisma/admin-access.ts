/** Operator-only bootstrap/recovery. No HTTP registration and no plaintext credential output. */
import "reflect-metadata";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { initializeAdmin } from "../src/modules/auth/admin-bootstrap";
import { checkPassword, passwordHash } from "../src/modules/auth/admin-auth.service";

async function readPassword(): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("Run in an interactive terminal.");
  process.stdout.write("Temporary password (14–128 characters, mixed case, number, symbol; hidden): ");
  process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = () => { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off("data", onData); process.stdout.write("\n"); };
    const onData = (input: string) => {
      for (const c of input) {
        if (c === "\u0003") { finish(); reject(new Error("Cancelled")); return; }
        if (c === "\r" || c === "\n") { finish(); resolve(value); return; }
        if (c === "\u007f" || c === "\b") value = value.slice(0, -1);
        else if (c >= " " && value.length < 129) value += c;
      }
    };
    process.stdin.on("data", onData);
  });
}
async function main() {
  const env = parse(readFileSync(resolve(__dirname, "../.env")));
  const db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } }, log: [] });
  try {
    const recovery = process.argv.indexOf("--recover");
    const email = recovery >= 0 ? process.argv[recovery + 1]?.trim().toLowerCase() : "admin@balitech.com";
    if (!email || (recovery >= 0 && !process.argv.includes("--confirm-recovery"))) throw new Error("Recovery requires an explicit email and --confirm-recovery.");
    if (recovery < 0 && await db.systemSetting.findUnique({ where: { key: "admin.bootstrap.completed" } })) { process.stdout.write("Administrator bootstrap already completed; no changes.\n"); return; }
    const password = await readPassword();
    checkPassword(password);
    const hash = await passwordHash(password);
    const changed = await initializeAdmin(db, hash, email, recovery >= 0);
    if (!changed) { process.stdout.write("Administrator bootstrap already completed; no changes.\n"); return; }
    process.stdout.write(JSON.stringify({ initialized: true, email, mustChangePassword: true, delivery: "Operator-supplied temporary password; only Argon2id hash stored" }) + "\n");
  } finally { await db.$disconnect(); }
}
void main().catch(() => { process.stderr.write("Administrator initialization/recovery failed; sensitive details suppressed.\n"); process.exitCode = 1; });
