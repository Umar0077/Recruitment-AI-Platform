import type { AuditService } from "../../src/modules/audit/audit.module";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import type { EnvironmentVariables } from "../../src/config/env.validation";
import type { PrismaService } from "../../src/database/prisma.service";
import type { VerifiedIdentity } from "../../src/integrations/firebase/token-verifier";
import { AuthService } from "../../src/modules/auth/auth.service";
import { InterviewsService } from "../../src/modules/interviews/interviews.service";
import type { AuthUser } from "../../src/common/auth-user";

const identity: VerifiedIdentity = { uid: "fictional-uid", email: "invited@example.test", emailVerified: true, name: null, signInProvider: "password" };
function row(overrides = {}) {
  return { id: "app-user", firebaseUid: identity.uid, email: identity.email, emailVerified: true, displayName: "Staff-edited name", status: "ACTIVE", lastLoginAt: new Date(), candidate: null, identities: [{ provider: "google.com" }], roles: [{ role: { code: "CANDIDATE", permissions: [{ permission: { code: "interviews:take" } }] } }], ...overrides };
}
describe("UID synchronization and invitation policy (mock persistence only)", () => {
  const db = { $transaction: jest.fn(), user: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() }, role: { findUniqueOrThrow: jest.fn() }, authIdentity: { upsert: jest.fn() }, candidate: { findMany: jest.fn(), updateMany: jest.fn() } };
  const config = new ConfigService<EnvironmentVariables, true>({ AUTO_LINK_CANDIDATE_BY_VERIFIED_EMAIL: true });
  const audit = { record: jest.fn() };
  const service = new AuthService(db as unknown as PrismaService, config, audit as unknown as AuditService);
  beforeEach(() => {
    jest.resetAllMocks(); db.$transaction.mockImplementation(async fn => fn(db)); db.user.findUnique.mockResolvedValue(row());
    db.candidate.findMany.mockResolvedValue([]); db.candidate.updateMany.mockResolvedValue({ count: 1 });
    db.role.findUniqueOrThrow.mockResolvedValue({ id: "candidate-role" }); db.user.create.mockResolvedValue(row());
  });
  it("uses UID only and preserves an existing staff role/name on password login", async () => {
    db.user.findUnique.mockResolvedValue(row({ roles: [{ role: { code: "HR_MANAGER", permissions: [{ permission: { code: "interviews:read" } }] } }] }));
    const user = await service.resolve(identity);
    expect(db.user.findUnique.mock.calls[0][0].where).toEqual({ firebaseUid: identity.uid });
    expect(user.roles).toEqual(["HR_MANAGER"]); expect(user.displayName).toBe("Staff-edited name");
    expect(db.user.create).not.toHaveBeenCalled(); expect(db.user.update).not.toHaveBeenCalled();
    expect(db.authIdentity.upsert).toHaveBeenCalledTimes(1); expect(db.candidate.findMany).not.toHaveBeenCalled();
  });
  it("trims the initial name and audits provisioning without profile values", async () => {
    db.user.findUnique.mockResolvedValue(null);
    await service.resolve({ ...identity, name: "  Fictional  Person  " });
    expect(db.user.create.mock.calls[0][0].data.displayName).toBe("Fictional  Person");
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "user.profile_initialized", summary: { source: "firebase", fields: ["displayName", "emailVerified"] } }), db);
  });
  it("fills and audits a missing name while preserving the candidate relation", async () => {
    db.user.findUnique.mockResolvedValue(row({ displayName: null, candidate: { id: "official-candidate" } }));
    db.user.updateMany.mockResolvedValue({ count: 1 }); db.user.findUniqueOrThrow.mockResolvedValue(row({ displayName: "Fictional Google", candidate: { id: "official-candidate" } }));
    const result = await service.resolve({ ...identity, signInProvider: "google.com", name: " Fictional Google " });
    expect(db.user.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: "app-user", displayName: null }, data: { displayName: "Fictional Google" } });
    expect(result.displayName).toBe("Fictional Google"); expect(result.candidateId).toBe("official-candidate");
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "user.profile_completed" }), db); expect(db.candidate.updateMany).not.toHaveBeenCalled();
  });
  it("does not replace an approved stored name with a new Google name", async () => {
    const result = await service.resolve({ ...identity, signInProvider: "google.com", name: "New Google Name" });
    expect(result.displayName).toBe("Staff-edited name"); expect(db.user.updateMany).not.toHaveBeenCalled(); expect(audit.record).not.toHaveBeenCalled();
  });
  it("keeps a concurrent profile edit and does not record a change that lost the race", async () => {
    db.user.findUnique.mockResolvedValue(row({ displayName: null })); db.user.updateMany.mockResolvedValue({ count: 0 }); db.user.findUniqueOrThrow.mockResolvedValue(row({ displayName: "Approved concurrently" }));
    expect((await service.resolve({ ...identity, name: "Google Name" })).displayName).toBe("Approved concurrently"); expect(audit.record).not.toHaveBeenCalled();
  });
  it("gives a new UID only CANDIDATE and no interview access without an invitation", async () => {
    db.user.findUnique.mockResolvedValue(null);
    const user = await service.resolve({ ...identity, uid: "another-uid-same-email" });
    const data = db.user.create.mock.calls[0][0].data;
    expect(data.firebaseUid).toBe("another-uid-same-email"); expect(data.roles).toEqual({ create: { roleId: "candidate-role" } });
    expect(data).not.toHaveProperty("password"); expect(user.candidateId).toBeNull();
    expect(db.candidate.updateMany).not.toHaveBeenCalled();
  });
  it("links only one unowned candidate with a verified matching email and open unexpired invitation", async () => {
    db.candidate.findMany.mockResolvedValue([{ id: "invited-candidate" }]);
    expect((await service.resolve(identity)).candidateId).toBe("invited-candidate");
    const where = db.candidate.findMany.mock.calls[0][0].where;
    expect(where.userId).toBeNull(); expect(where.email.equals).toBe(identity.email);
    expect(where.interviews.some.status.in).toEqual(["PENDING", "IN_PROGRESS", "INTERRUPTED"]);
    expect(where.interviews.some.expiresAt.gt).toBeInstanceOf(Date);
    expect(db.candidate.updateMany.mock.calls[0][0].where).toEqual({ id: "invited-candidate", userId: null });
  });
  it("does not link ambiguous matching candidates", async () => {
    db.candidate.findMany.mockResolvedValue([{ id: "one" }, { id: "two" }]);
    expect((await service.resolve(identity)).candidateId).toBeNull(); expect(db.candidate.updateMany).not.toHaveBeenCalled();
  });
  it("preserves an existing candidate relationship", async () => {
    db.user.findUnique.mockResolvedValue(row({ candidate: { id: "existing-candidate" } }));
    expect((await service.resolve(identity)).candidateId).toBe("existing-candidate"); expect(db.candidate.findMany).not.toHaveBeenCalled();
  });
  it("handles simultaneous UID provisioning without a duplicate user", async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("synthetic uniqueness conflict", { code: "P2002", clientVersion: "test" }));
    db.user.findUniqueOrThrow.mockResolvedValue(row());
    expect((await service.resolve(identity)).id).toBe("app-user");
    expect(db.user.findUniqueOrThrow.mock.calls[0][0].where).toEqual({ firebaseUid: identity.uid });
  });
  it("rejects disabled PostgreSQL users", async () => {
    db.user.findUnique.mockResolvedValue(row({ status: "DISABLED" }));
    await expect(service.resolve(identity)).rejects.toMatchObject({ code: "ACCOUNT_DISABLED" });
    expect(db.authIdentity.upsert).not.toHaveBeenCalled();
  });
  it("also rejects a disabled row loaded after a provisioning race", async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("synthetic uniqueness conflict", { code: "P2002", clientVersion: "test" }));
    db.user.findUniqueOrThrow.mockResolvedValue(row({ status: "DISABLED" }));
    await expect(service.resolve(identity)).rejects.toMatchObject({ code: "ACCOUNT_DISABLED" });
  });
});

describe("candidate interview ownership (mock persistence only)", () => {
  const db = { interviewSession: { findUnique: jest.fn(), findMany: jest.fn() } };
  const service = new InterviewsService(db as unknown as PrismaService, {} as never, {} as never, {} as never, {} as never);
  const user: AuthUser = { id: "app-user", firebaseUid: identity.uid, email: identity.email, displayName: null, providers: ["password"], roles: ["CANDIDATE"], permissions: new Set(["interviews:take"]), candidateId: null };
  it("returns no interviews for an uninvited account without querying sessions", () => {
    expect(service.listMine(user)).toEqual([]); expect(db.interviewSession.findMany).not.toHaveBeenCalled();
  });
  it("does not disclose another candidate's interview", async () => {
    db.interviewSession.findUnique.mockResolvedValue({ candidateId: "another-candidate" });
    await expect(service.detail("fictional-session", { ...user, candidateId: "own-candidate" })).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });
  it("lists sessions only for the linked candidate", () => {
    service.listMine({ ...user, candidateId: "own-candidate" });
    expect(db.interviewSession.findMany.mock.calls[0][0].where).toEqual({ candidateId: "own-candidate" });
  });
});

