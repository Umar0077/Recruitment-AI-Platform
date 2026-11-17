import { describe, expect, it } from "vitest";
import { knownTokenTotal, resetCountdown, usageLatency, usageNumber, usageUsd, usageUtc, validateUsageDates } from "@/lib/data/usage-format";
import { DEMO_USAGE_AS_OF, demoUsageHistory, demoUsageOverview } from "@/lib/demo/api-usage";
import { ALL_NAV, isNavVisible } from "@/components/admin/nav";

describe("honest usage presentation", () => {
  it("keeps missing measurements distinct from zero", () => {
    expect(usageUsd(null)).toBe("Unavailable"); expect(usageUsd(undefined)).toBe("Unavailable"); expect(usageUsd(0)).toBe("$0.00");
    expect(usageNumber(null)).toBe("Unavailable"); expect(usageNumber(0)).toBe("0"); expect(usageLatency(null)).toBe("Unavailable");
  });
  it("preserves small reported costs instead of rounding them to zero", () => { expect(usageUsd(0.000001)).toBe("$0.000001"); expect(usageLatency(1234)).toBe("1.23 s"); });
  it("retains legacy combined token totals without inventing missing token measurements", () => {
    expect(knownTokenTotal({ totalTokens: 250, tokenCoverageRequests: 0, requests: 2 })).toBe(250);
    expect(knownTokenTotal({ totalTokens: 0, tokenCoverageRequests: 0, requests: 2 })).toBeNull();
    expect(knownTokenTotal({ totalTokens: 0, tokenCoverageRequests: 1, requests: 2 })).toBe(0);
    expect(knownTokenTotal({ totalTokens: 0, tokenCoverageRequests: 0, requests: 0 })).toBe(0);
  });
  it("formats UTC independently of the browser's local timezone", () => { expect(usageUtc("2026-11-17T23:59:10Z")).toBe("17 Nov 2026, 23:59:10 UTC"); expect(usageUtc("bad date")).toBe("Unavailable"); });
  it("does not invent quota reset times or reset allowance at countdown zero", () => {
    expect(resetCountdown(null, 0)).toBeNull(); expect(resetCountdown("invalid", 0)).toBeNull();
    expect(resetCountdown("2026-11-17T12:01:01Z", Date.parse("2026-11-17T12:00:00Z"))).toBe("0h 1m 1s");
    expect(resetCountdown("2026-11-17T12:00:00Z", Date.parse("2026-11-17T12:00:01Z"))).toContain("refresh usage to confirm");
  });
  it("validates inclusive UTC date ranges before requests", () => {
    expect(validateUsageDates("", "")).toBeNull(); expect(validateUsageDates("2026-11-17", "")).toContain("both dates");
    expect(validateUsageDates("2026-11-17", "2026-11-16")).toContain("on or after");
    expect(validateUsageDates("2026-02-30", "2026-03-02")).toContain("valid calendar");
    expect(validateUsageDates("2026-01-01", "2027-01-02")).toContain("366 days");
    expect(validateUsageDates("2026-11-17", "2026-11-17")).toBeNull();
  });
});
describe("isolated demo history", () => {
  it("paginates distinct request attempts without duplicates", () => {
    const first = demoUsageHistory({ range: "30d", page: 1, limit: 20 }); const second = demoUsageHistory({ range: "30d", page: 2, limit: 20 });
    expect(first.items).toHaveLength(20); expect(second.items).toHaveLength(20); expect(first.items.some(a => second.items.some(b => a.id === b.id))).toBe(false);
  });
  it("filters dates inclusively and combines feature/status/model filters", () => {
    const all = demoUsageHistory({ range: "30d", from: "2026-11-17", to: "2026-11-17", page: 1, limit: 100 }); expect(all.items.every(row => row.createdAt.startsWith("2026-11-17"))).toBe(true);
    const filtered = demoUsageHistory({ range: "30d", status: "failed", feature: "rubric_generation", model: "demo/fictional-interview-model", page: 1, limit: 100 });
    expect(filtered.items.length).toBeGreaterThan(0); expect(filtered.items.every(row => row.status === "failed" && row.feature === "rubric_generation")).toBe(true);
  });
  it("has consistent aggregate totals and explicit UTC periods", () => {
    const overview = demoUsageOverview("7d"); expect(overview.timezone).toBe("UTC"); expect(overview.daily).toHaveLength(7);
    expect(overview.selected.requests).toBe(overview.daily.reduce((sum, row) => sum + row.requests, 0));
    expect(overview.selected.requests).toBe(overview.selected.succeeded + overview.selected.failed + overview.selected.pending);
  });
  it("derives health from the same recent attempts as the last-24-hour counters", () => {
    const now = Date.parse(DEMO_USAGE_AS_OF);
    const recent = demoUsageHistory({ range: "7d", page: 1, limit: 100 }).items.filter(row => Date.parse(row.createdAt) >= now - 86400000 && Date.parse(row.createdAt) <= now);
    const failures = recent.filter(row => row.status === "failed").length;
    expect(demoUsageOverview("7d").health).toMatchObject({ status: "healthy", requestsLast24h: recent.length, failuresLast24h: failures });
    expect(failures).toBe(0); expect(recent.some(row => row.status === "success")).toBe(true);
  });
});
describe("API usage navigation", () => {
  const item = ALL_NAV.find(item => item.href === "/admin/api-usage");
  it("hides account billing/usage from staff without users:manage", () => { expect(isNavVisible(item, ["analytics:read"], true)).toBe(false); expect(isNavVisible(item, undefined, true)).toBe(false); });
  it("shows the authorized admin module and isolated demo preview", () => { expect(isNavVisible(item, ["users:manage"], true)).toBe(true); expect(isNavVisible(item, [], false)).toBe(true); });
});
