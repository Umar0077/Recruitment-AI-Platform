/**
 * Prepares the isolated test database: apply migrations, empty every table, seed reference data.
 * Guarded so it can only ever touch a database whose name contains "test".
 */
import { execSync } from "node:child_process";
import { config } from "dotenv";

export default async function globalSetup() {
  config({ quiet: true } as never);
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !/\/[\w-]*test[\w-]*(\?|$)/.test(url)) throw new Error("Refusing to run: TEST_DATABASE_URL is missing or not a test database.");
  const env = { ...process.env, DATABASE_URL: url, NODE_ENV: "test" };
  execSync("npx prisma migrate deploy", { env, stdio: "pipe" });

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await prisma.$disconnect();

  execSync("npx tsx prisma/seed.ts", { env: { ...env, SEED_DEV_DATA: "true" }, stdio: "pipe" });
}
