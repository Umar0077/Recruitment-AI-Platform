/**
 * Operator CLI to grant a staff role to an existing user (e.g. the first SUPER_ADMIN).
 * The user must have signed in once so their Firebase account exists in `users`.
 *
 *   npm run admin:grant -- <firebase-uid-or-email> SUPER_ADMIN
 *
 * Runs on the server against DATABASE_URL; there is no HTTP route that can do this without
 * an existing Super Admin.
 */
import "dotenv/config";
import { PrismaClient, RoleCode } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [who, roleArg = "SUPER_ADMIN"] = process.argv.slice(2);
  if (!who) throw new Error("Usage: npm run admin:grant -- <firebase-uid-or-email> [ROLE]");
  if (!(roleArg in RoleCode) || roleArg === "CANDIDATE") throw new Error(`Role must be one of: ${Object.keys(RoleCode).filter((r) => r !== "CANDIDATE").join(", ")}`);
  const users = await prisma.user.findMany({ where: who.includes("@") ? { email: { equals: who, mode: "insensitive" }, emailVerified: true } : { firebaseUid: who } });
  if (users.length !== 1) throw new Error(users.length ? "More than one user matches; use the Firebase UID." : "No matching user. Sign in once first (verified email required when matching by email).");
  const user = users[0]!;
  const role = await prisma.role.findUniqueOrThrow({ where: { code: roleArg as RoleCode } });
  const candidateRole = await prisma.role.findUniqueOrThrow({ where: { code: "CANDIDATE" } });
  await prisma.$transaction([
    // Staff accounts do not keep the candidate role.
    prisma.userRole.deleteMany({ where: { userId: user.id, roleId: candidateRole.id } }),
    prisma.userRole.createMany({ data: [{ userId: user.id, roleId: role.id }], skipDuplicates: true }),
    prisma.auditLog.create({ data: { action: "user.roles_changed", entityType: "user", entityId: user.id, summary: { granted: roleArg, via: "cli" } } }),
  ]);
  console.log(`✓ ${roleArg} granted to user ${user.id}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
