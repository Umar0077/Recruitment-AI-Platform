import { CandidatesService } from "../../src/modules/candidates/candidates.module";
import type { AuthUser } from "../../src/common/auth-user";

const actor = { id: "fictional-recruiter", roles: ["RECRUITER"], permissions: new Set() } as AuthUser;
const ctx = { user: actor, requestId: "fictional-request" };
describe("scoped candidate application access probes (no database)", () => {
  const db = {
    application: { findFirst: jest.fn() },
    recruitmentEvent: { findMany: jest.fn() },
    hrRemark: { findMany: jest.fn() },
    $transaction: jest.fn(),
    user: { findFirst: jest.fn() },
  };
  const scope = { applicationWhere: jest.fn(() => ({ assignedRecruiterId: actor.id })) };
  const service = new CandidatesService(db as never, {} as never, {} as never, scope as never);
  beforeEach(() => {
    jest.clearAllMocks();
    db.application.findFirst.mockResolvedValue({ id: "fictional-application" });
    db.recruitmentEvent.findMany.mockResolvedValue([]); db.hrRemark.findMany.mockResolvedValue([]);
  });
  it("loads timeline rows after a scoped id-only access check", async () => {
    expect(await service.timeline("fictional-application", actor)).toEqual({ events: [], remarks: [] });
    expect(db.application.findFirst).toHaveBeenCalledWith({ where: { id: "fictional-application", assignedRecruiterId: actor.id }, select: { id: true } });
    expect(db.recruitmentEvent.findMany).toHaveBeenCalledTimes(1);
  });
  it.each(["timeline", "status", "remark", "assignment"])("refuses out-of-scope %s before reading details or mutating", async action => {
    db.application.findFirst.mockResolvedValue(null);
    const result = action === "timeline" ? service.timeline("other-application", actor)
      : action === "status" ? service.updateStatus("other-application", { status: "SHORTLISTED" }, ctx)
      : action === "remark" ? service.addRemark("other-application", { body: "Fictional note" }, ctx)
      : service.assign("other-application", { recruiterId: null }, ctx);
    await expect(result).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    expect(db.$transaction).not.toHaveBeenCalled(); expect(db.recruitmentEvent.findMany).not.toHaveBeenCalled(); expect(db.hrRemark.findMany).not.toHaveBeenCalled();
    expect(db.application.findFirst.mock.calls[0]![0]).toMatchObject({ where: { assignedRecruiterId: actor.id }, select: { id: true } });
  });
});
