import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
/** Operator-only transaction; never registered as an HTTP endpoint or normal seed. */
export async function initializeAdmin(db: PrismaClient, hash: string, email = "admin@balitech.com", recovery = false) {
  return db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('interviewos-admin-bootstrap'))`;
      if (recovery) {
        const account = await tx.adminCredential.findUniqueOrThrow({ where: { email } });
        await tx.adminCredential.update({ where: { id: account.id }, data: { passwordHash: hash, mustChangePassword: true, failedLoginAttempts: 0, lockedUntil: null, passwordChangedAt: new Date() } });
        await tx.adminSession.updateMany({ where: { credentialId: account.id, revokedAt: null }, data: { revokedAt: new Date() } });
        await tx.auditLog.create({ data: { action: "admin.operator_recovery", entityType: "admin_credential", entityId: account.id } });
        return true;
      }
      if (await tx.systemSetting.findUnique({ where: { key: "admin.bootstrap.completed" } })) return false;
      if (await tx.adminCredential.count()) throw new Error("Existing administrator credentials require operator review.");
      const user = await tx.user.create({ data: { firebaseUid: `admin-local:${randomUUID()}`, email, displayName: "InterviewOS Administrator", roles: { create: { role: { connect: { code: "SUPER_ADMIN" } } } } } });
      const account = await tx.adminCredential.create({ data: { userId: user.id, email, passwordHash: hash } });
      await tx.systemSetting.create({ data: { key: "admin.bootstrap.completed", value: { initialized: true } } });
      await tx.auditLog.create({ data: { actorUserId: user.id, action: "admin.bootstrapped", entityType: "admin_credential", entityId: account.id } });
      return true;
    });
}
