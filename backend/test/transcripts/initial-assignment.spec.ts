import { assignInitial } from "../../src/modules/interviews/initial-assignment";
import type { PrismaService } from "../../src/database/prisma.service";
import type { ConfigService } from "@nestjs/config";
import type { EnvironmentVariables } from "../../src/config/env.validation";
import type { AuditService } from "../../src/modules/audit/audit.module";
import type { RequestContext } from "../../src/common/http";

describe("initial candidate assignment", () => {
  const ctx = { user: { id: "user", roles: ["CANDIDATE"], permissions: new Set(["interviews:take"]) } } as unknown as RequestContext;
  function fixture() {
    const tx = { $queryRaw: jest.fn(), user: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "user", email: "fictional@example.test", emailVerified: true, displayName: "Fictional Candidate" }) }, candidate: { findUnique: jest.fn().mockResolvedValue({ id: "candidate" }), findMany: jest.fn().mockResolvedValue([]) }, interviewSession: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() }, application: { findMany: jest.fn().mockResolvedValue([]) }, jobRole: { findMany: jest.fn().mockResolvedValue([{ code: "CSR-FRESHER", title: "Fresher" }]), findUnique: jest.fn().mockResolvedValue(null) } };
    const prisma = { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) } as unknown as PrismaService;
    const run = (input = {}) => assignInitial(prisma, {} as ConfigService<EnvironmentVariables, true>, {} as AuditService, input, ctx);
    return { tx, run };
  }
  it.each(["PENDING", "IN_PROGRESS", "INTERRUPTED", "COMPLETED", "SUBMITTED", "EXPIRED", "CANCELLED"])("reuses %s history without another assignment", async status => {
    const { tx, run } = fixture(); tx.interviewSession.findFirst.mockResolvedValue({ id: "existing", status });
    expect(await run()).toMatchObject({ state: "assigned", interviewId: "existing" });
    expect(tx.interviewSession.create).not.toHaveBeenCalled();
  });
  it("requires explicit role selection without an application", async () => { const { run } = fixture(); expect((await run()).state).toBe("select_role"); });
  it("requires verified email", async () => { const { tx, run } = fixture(); tx.user.findUniqueOrThrow.mockResolvedValue({ emailVerified: false }); await expect(run()).rejects.toMatchObject({ code: "FORBIDDEN" }); });
  it("requires a full name", async () => { const { tx, run } = fixture(); tx.user.findUniqueOrThrow.mockResolvedValue({ email: "fictional@example.test", emailVerified: true }); await expect(run()).rejects.toMatchObject({ code: "PROFILE_INCOMPLETE" }); });
  it("rejects a foreign application", async () => { const { run } = fixture(); await expect(run({ applicationId: "foreign" })).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" }); });
  it("rejects arbitrary roles and unavailable questions", async () => { const { run } = fixture(); await expect(run({ roleCode: "ADMIN" })).rejects.toMatchObject({ code: "INVALID_ROLE" }); await expect(run({ roleCode: "FE-CLOSER" })).rejects.toMatchObject({ code: "QUESTION_SET_NOT_PUBLISHED" }); });
  it("asks explicitly when multiple applications exist", async () => { const { tx, run } = fixture(); tx.application.findMany.mockResolvedValue([{ id: "a", status: "APPLICATION_RECEIVED", jobRole: { title: "FE" } }, { id: "b", status: "APPLICATION_RECEIVED", jobRole: { title: "CSR" } }]); expect((await run()).state).toBe("select_application"); });
  it("preserves later recruitment stages", async () => { const { tx, run } = fixture(); tx.application.findMany.mockResolvedValue([{ id: "a", status: "HIRED", jobRole: { code: "FE-CLOSER" } }]); await expect(run()).rejects.toMatchObject({ code: "APPLICATION_NOT_ELIGIBLE" }); });
  it("denies staff-only identities", async () => { await expect(assignInitial({} as PrismaService, {} as ConfigService<EnvironmentVariables, true>, {} as AuditService, {}, { user: { roles: ["HR"], permissions: new Set() } } as unknown as RequestContext)).rejects.toMatchObject({ code: "FORBIDDEN" }); });
});
