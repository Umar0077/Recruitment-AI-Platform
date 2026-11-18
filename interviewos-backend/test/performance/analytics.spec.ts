import { AnalyticsController } from "../../src/modules/analytics/analytics.module";

describe("weekly analytics sample configuration (no database)", () => {
  it("counts selected candidates once instead of summing their applications", async () => {
    const count = jest.fn().mockImplementation(({ where }) => Promise.resolve(where.applications ? 2 : 12));
    const db = { candidate: { count, groupBy: jest.fn().mockResolvedValue([]) }, application: { groupBy: jest.fn().mockResolvedValue([]) }, interviewSession: { groupBy: jest.fn().mockResolvedValue([]) }, hrReview: { count: jest.fn().mockResolvedValue(0) }, $queryRaw: jest.fn().mockResolvedValue([]) };
    const controller = new AnalyticsController(db as never, { get: () => "production" } as never);
    const result = await controller.overview({ from: "2026-11-01T00:00:00Z" });
    expect(result.candidates).toMatchObject({ total: 12, selected: 2 });
    const where = count.mock.calls[1][0].where;
    expect(where.isSample).toBe(false);
    expect(where.applications.some.status.in).toContain("SELECTED");
    expect(where.applications.some.status.in).not.toContain("NOT_SELECTED");
    expect(where.applications.some.submittedAt.gte).toEqual(new Date("2026-11-01T00:00:00Z"));
  });
  it.each([
    ["production", undefined, false],
    ["development", undefined, true],
    ["production", true, true],
    ["development", false, false],
  ])("applies %s default and explicit override %s consistently", async (environment, override, expected) => {
    const query = jest.fn().mockResolvedValue([]);
    const controller = new AnalyticsController({ $queryRaw: query } as never, { get: () => environment } as never);
    const result = await controller.activity({ weeks: 1, includeSample: override as boolean | undefined });
    expect(result).toEqual({ includeSample: expected, weeks: [] });
    expect(query.mock.calls[0]!.slice(1)).toEqual([0, expected, expected, expected]);
  });
});
