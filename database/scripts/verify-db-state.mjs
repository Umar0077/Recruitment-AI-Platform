/**
 * Read-only PostgreSQL database state and migration verification.
 * Never logs candidate PII, transcripts, or administrator password hashes.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const backendPkg = path.resolve(here, "../../backend/package.json");
const require = createRequire(backendPkg);
const { PrismaClient } = require("@prisma/client");

const db = new PrismaClient();
try {
  const [candidates, applications, interviews, answers, admins, users, migrations, dbName] = await Promise.all([
    db.candidate.count(),
    db.application.count(),
    db.interviewSession.count(),
    db.interviewAnswer.count(),
    db.adminCredential.count(),
    db.user.count(),
    db.$queryRawUnsafe("SELECT migration_name, finished_at FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY started_at ASC"),
    db.$queryRawUnsafe("SELECT current_database() AS db"),
  ]);
  console.log(
    JSON.stringify(
      {
        connected: true,
        database: dbName[0]?.db,
        counts: { candidates, applications, interviews, answers, admins, users },
        appliedMigrationsCount: migrations.length,
        appliedMigrations: migrations.map((m) => m.migration_name),
      },
      null,
      2,
    ),
  );
} finally {
  await db.$disconnect();
}
