import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
const s = vi.hoisted(() => ({ api: false, queries: null }));
vi.mock("next/dynamic", () => ({ default: () => () => <div data-testid="usage-charts">Usage charts</div> }));
vi.mock("@/lib/config/environment", () => ({ get isApiMode() { return s.api; } }));
vi.mock("@/lib/data/api-usage", () => ({ useApiUsage: () => s.queries }));
vi.mock("@/components/ui/overlays", () => ({ Select: ({ label, value, options, onValueChange }) => <select aria-label={label} value={value} onChange={event => onValueChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> }));
import { ApiUsageDashboard, ProviderDetails } from "@/components/api/admin/api-usage";
import { DEMO_PROVIDER_USAGE } from "@/lib/demo/api-usage";
beforeEach(() => { s.api = false; s.queries = { overview: {}, provider: {}, requests: {}, allowed: false, restoring: false }; });
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe("provider metadata UI", () => {
  it("shows unknown quota and credits as unavailable rather than free/zero", () => {
    render(<ProviderDetails data={DEMO_PROVIDER_USAGE} demo={false} />);
    expect(screen.getAllByText("Reset time unavailable").length).toBeGreaterThan(0); expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(0);
    expect(screen.queryByText("$0.00")).toBeNull(); expect(screen.getByText("Pricing unavailable")).toBeTruthy();
  });
  it("never treats key expiration as a quota reset", () => {
    const data = structuredClone(DEMO_PROVIDER_USAGE); data.key.expiresAt = "2027-01-01T00:00:00Z";
    render(<ProviderDetails data={data} demo={false} />); expect(screen.getByText("01 Jan 2027, 00:00:00 UTC")).toBeTruthy();
    expect(screen.getAllByText("Reset time unavailable")).toHaveLength(2); expect(screen.queryByText(/\dh \dm/)).toBeNull();
  });
  it("only starts a countdown for provider-confirmed free quota reset", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-17T12:00:00Z")); const data = structuredClone(DEMO_PROVIDER_USAGE);
    data.freeQuota = { ...data.freeQuota, resetAt: "2026-11-17T12:01:01Z", resetSource: "provider" };
    render(<ProviderDetails data={data} demo={false} />); expect(screen.getByText("0h 1m 1s")).toBeTruthy();
  });
  it("distinguishes the key reset period from the effective spend budget timestamp", () => {
    const data = structuredClone(DEMO_PROVIDER_USAGE);
    data.key.limitReset = "monthly"; data.key.budgetResetAt = "2026-11-18T00:00:00Z";
    render(<ProviderDetails data={data} demo={false} />);
    expect(screen.getByText("Key budget reset period").parentElement.textContent).toContain("monthly");
    expect(screen.getByText("Effective spend budget reset time").parentElement.textContent).toContain("18 Nov 2026, 00:00:00 UTC");
    expect(screen.getByText(/broader workspace or guardrail budget/)).toBeTruthy();
    expect(screen.getByText("Request quota reset").parentElement.textContent).toContain("Reset time unavailable");
  });
});
describe("API Usage dashboard", () => {
  it("blocks unauthorized API-mode staff before rendering account information", () => {
    s.api = true; render(<ApiUsageDashboard />); expect(screen.getByText("API Usage access restricted")).toBeTruthy(); expect(screen.queryByText("Provider allowance & credits")).toBeNull();
  });
  it("labels all demo samples and provides pagination", () => {
    render(<ApiUsageDashboard />); expect(screen.getByText(/fictional request samples as of/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Usage period"), { target: { value: "30d" } });
    fireEvent.click(screen.getByRole("button", { name: "Next request page" })); expect(screen.getByText(/Page 2 of/)).toBeTruthy();
  });
  it("applies history filters and resets pagination", () => {
    render(<ApiUsageDashboard />); fireEvent.change(screen.getByLabelText("Usage period"), { target: { value: "30d" } });
    fireEvent.click(screen.getByRole("button", { name: "Next request page" }));
    fireEvent.change(screen.getByLabelText("History status"), { target: { value: "failed" } }); fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(screen.getByText(/Page 1 of 1/)).toBeTruthy(); expect(screen.getAllByText("RATE_LIMITED").length).toBeGreaterThan(0);
  });
  it("rejects invalid date filters and supports a no-results state", () => {
    render(<ApiUsageDashboard />); fireEvent.change(screen.getByLabelText("From date (UTC)"), { target: { value: "2026-12-01" } }); fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(screen.getByRole("alert").textContent).toContain("both dates");
    fireEvent.change(screen.getByLabelText("To date (UTC, inclusive)"), { target: { value: "2026-12-02" } }); fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(screen.getByText("No matching requests")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" })); expect(screen.queryByText("No matching requests")).toBeNull();
  });
});
