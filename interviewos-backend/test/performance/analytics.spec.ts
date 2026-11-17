import { AnalyticsController } from "../../src/modules/analytics/analytics.module";

describe("weekly analytics sample configuration (no database)", () => {
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
