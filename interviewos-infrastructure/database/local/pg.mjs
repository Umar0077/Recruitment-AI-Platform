/**
 * Local development PostgreSQL manager (no Docker required).
 *
 * Runs the official PostgreSQL 17 server binaries (shipped by @embedded-postgres) as a normal,
 * independent background server via pg_ctl. The data directory lives outside the repository.
 *
 *   npm run start   — initialise (first run), start the server, ensure databases + app role
 *   npm run stop    — stop the server cleanly
 *   npm run status  — show server status
 *
 * Creates:
 *   database  interviewos       (development)
 *   database  interviewos_test  (automated tests only)
 *   role      interviewos_app   (owner of both; NOT a superuser)
 *
 * For servers, use interviewos-infrastructure/docker or a managed PostgreSQL instead.
 */
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, ".env") });

const bin = await import(`@embedded-postgres/${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`);
const env = (k, d) => process.env[k] || d;
const PORT = Number(env("PG_PORT", "5432"));
const SUPERUSER = env("PG_SUPERUSER", "postgres");
const SUPERPASS = env("PG_SUPERUSER_PASSWORD");
const APP_USER = env("APP_DB_USER", "interviewos_app");
const APP_PASS = env("APP_DB_PASSWORD");
const DATA_DIR =
  env("PG_DATA_DIR") ||
  (process.platform === "win32" ? path.join(process.env.LOCALAPPDATA ?? homedir(), "InterviewOS", "pgdata") : path.join(homedir(), ".interviewos", "pgdata"));
const LOG_FILE = path.join(path.dirname(DATA_DIR), "postgres.log");

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
}

function requireSecrets() {
  if (!SUPERPASS || !APP_PASS) {
    console.error("Set PG_SUPERUSER_PASSWORD and APP_DB_PASSWORD in database/local/.env (copy .env.example).");
    process.exit(1);
  }
}

async function canConnect() {
  const c = new pg.Client({ host: "127.0.0.1", port: PORT, user: SUPERUSER, password: SUPERPASS, database: "postgres", connectionTimeoutMillis: 1500 });
  try { await c.connect(); await c.end(); return true; } catch { return false; }
}

async function ensureDatabases() {
  const client = new pg.Client({ host: "127.0.0.1", port: PORT, user: SUPERUSER, password: SUPERPASS, database: "postgres" });
  await client.connect();
  const ident = (s) => `"${s.replace(/"/g, '""')}"`;
  const role = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [APP_USER]);
  if (!role.rowCount) {
    // Least privilege: can log in and create databases for Prisma's shadow DB, nothing more.
    await client.query(`CREATE ROLE ${ident(APP_USER)} LOGIN CREATEDB NOSUPERUSER NOCREATEROLE PASSWORD ${client.escapeLiteral(APP_PASS)}`);
    console.log(`Created role ${APP_USER}`);
  }
  for (const db of ["interviewos", "interviewos_test"]) {
    const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [db]);
    if (!exists.rowCount) {
      await client.query(`CREATE DATABASE ${ident(db)} OWNER ${ident(APP_USER)} ENCODING 'UTF8' TEMPLATE template0`);
      console.log(`Created database ${db}`);
    }
  }
  await client.end();
}

async function start() {
  requireSecrets();
  if (!existsSync(path.join(DATA_DIR, "PG_VERSION"))) {
    mkdirSync(DATA_DIR, { recursive: true });
    const pwfile = path.join(tmpdir(), `ios-pw-${process.pid}`);
    writeFileSync(pwfile, SUPERPASS, { mode: 0o600 });
    const r = run(bin.initdb, ["-D", DATA_DIR, "-U", SUPERUSER, "--pwfile", pwfile, "--auth=scram-sha-256", "--encoding=UTF8", "--locale=C"]);
    rmSync(pwfile, { force: true });
    if (r.code !== 0) { console.error(r.out); process.exit(1); }
    console.log(`Initialised cluster at ${DATA_DIR}`);
  }
  const status = run(bin.pg_ctl, ["status", "-D", DATA_DIR]);
  if (status.code !== 0) {
    // Listen on loopback only: the local database is never reachable from the network.
    // Launch fully detached with its own hidden console. On Windows a server attached to this
    // terminal dies (0xC0000142) when the terminal closes; detached, it outlives this script.
    const child = spawn(bin.pg_ctl, ["start", "-D", DATA_DIR, "-l", LOG_FILE, "-o", `-p ${PORT} -c listen_addresses=127.0.0.1 -c timezone=UTC -c log_timezone=UTC`], { detached: true, stdio: "ignore", windowsHide: true });
    child.unref();
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      await new Promise((r) => setTimeout(r, 500));
      up = await canConnect();
    }
    if (!up) { console.error(`PostgreSQL did not start. See log: ${LOG_FILE}`); process.exit(1); }
    console.log(`PostgreSQL started on 127.0.0.1:${PORT}`);
  } else console.log("PostgreSQL already running.");
  await ensureDatabases();
  console.log(`Ready. Data: ${DATA_DIR}  Log: ${LOG_FILE}`);
}

function stop() {
  const r = run(bin.pg_ctl, ["stop", "-D", DATA_DIR, "-m", "fast", "-w"]);
  console.log(r.code === 0 ? "PostgreSQL stopped." : r.out);
}

function status() {
  const r = run(bin.pg_ctl, ["status", "-D", DATA_DIR]);
  console.log(r.code === 0 ? `Running (port ${PORT})\n${r.out}` : "Not running.");
}

function initIfNeeded() {
  if (existsSync(path.join(DATA_DIR, "PG_VERSION"))) return;
  mkdirSync(DATA_DIR, { recursive: true });
  const pwfile = path.join(tmpdir(), `ios-pw-${process.pid}`);
  writeFileSync(pwfile, SUPERPASS, { mode: 0o600 });
  const r = run(bin.initdb, ["-D", DATA_DIR, "-U", SUPERUSER, "--pwfile", pwfile, "--auth=scram-sha-256", "--encoding=UTF8", "--locale=C"]);
  rmSync(pwfile, { force: true });
  if (r.code !== 0) { console.error(r.out); process.exit(1); }
  console.log(`Initialised cluster at ${DATA_DIR}`);
}

/** Foreground mode: PostgreSQL runs attached to this terminal; Ctrl+C shuts it down cleanly. */
async function serve() {
  requireSecrets();
  initIfNeeded();
  const server = spawn(bin.postgres, ["-D", DATA_DIR, "-p", String(PORT), "-c", "listen_addresses=127.0.0.1", "-c", "timezone=UTC", "-c", "log_timezone=UTC"], { stdio: "inherit" });
  const shutdown = () => { run(bin.pg_ctl, ["stop", "-D", DATA_DIR, "-m", "fast", "-w"]); };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  let up = false;
  for (let i = 0; i < 60 && !up; i++) { await new Promise((r) => setTimeout(r, 500)); up = await canConnect(); }
  if (!up) { console.error("PostgreSQL did not become ready."); process.exit(1); }
  await ensureDatabases();
  console.log(`Ready on 127.0.0.1:${PORT}. Press Ctrl+C to stop.`);
  server.on("exit", (code) => process.exit(code ?? 0));
}

/**
 * Registers PostgreSQL as a Windows service (auto-start, survives logoff/reboot).
 * Must be run from an elevated (Administrator) terminal. Databases are created on first `start`.
 */
function serviceInstall() {
  if (process.platform !== "win32") return console.log("Windows only. On Linux use systemd or the Docker files in ../docker.");
  initIfNeeded();
  const r = run(bin.pg_ctl, ["register", "-N", "InterviewOS-PostgreSQL", "-D", DATA_DIR, "-S", "auto", "-o", `-p ${PORT} -c listen_addresses=127.0.0.1 -c timezone=UTC -c log_timezone=UTC`]);
  console.log(r.code === 0 ? "Registered service 'InterviewOS-PostgreSQL'. Start it with: net start InterviewOS-PostgreSQL" : `${r.out}\n(Run this from an Administrator terminal.)`);
}

function serviceRemove() {
  const r = run(bin.pg_ctl, ["unregister", "-N", "InterviewOS-PostgreSQL"]);
  console.log(r.code === 0 ? "Service removed." : `${r.out}\n(Run this from an Administrator terminal.)`);
}

/**
 * Cold backup: copies the whole data directory while the server is STOPPED. The embedded binaries
 * do not include pg_dump, so this is the local backup option; see ../../backup for pg_dump scripts.
 */
async function coldBackup() {
  if (await canConnect()) {
    console.error("PostgreSQL is running. Stop it first (Ctrl+C the `serve` window, or `npm run stop`), then retry.");
    process.exit(1);
  }
  if (!existsSync(DATA_DIR)) return console.error(`No data directory at ${DATA_DIR}`);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
  const dest = path.join(path.dirname(DATA_DIR), "backups", `pgdata_${stamp}`);
  mkdirSync(path.dirname(dest), { recursive: true });
  cpSync(DATA_DIR, dest, { recursive: true, errorOnExist: true });
  console.log(`Cold backup written to ${dest}\nTo restore: stop the server, rename the current pgdata folder, copy this folder back as pgdata.`);
}

const cmd = process.argv[2];
if (cmd === "start") await start();
else if (cmd === "serve") await serve();
else if (cmd === "stop") stop();
else if (cmd === "status") status();
else if (cmd === "service:install") { requireSecrets(); serviceInstall(); }
else if (cmd === "service:remove") serviceRemove();
else if (cmd === "backup:cold") await coldBackup();
else if (cmd === "ensure") { requireSecrets(); await ensureDatabases(); }
else console.log("Usage: node pg.mjs start|serve|stop|status|ensure|backup:cold|service:install|service:remove");
