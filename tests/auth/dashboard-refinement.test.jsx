import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DashboardView, PendingReviews } from "@/components/admin/dashboard-view";
import { NAV_GROUPS, ALL_NAV, isActive, isNavVisible } from "@/components/admin/nav";
vi.mock("@/hooks/use-demo", () => ({ usePrefersReducedMotion: () => true }));
afterEach(cleanup);
it("shows four truthful metrics, quick actions, and a correctly linked compact review queue", () => {
  render(<DashboardView values={[12, 8, 3, 2]} pending={<PendingReviews rows={[{id:"fictional-interview",name:"Fictional Candidate",role:"CSR Fresher",date:"Nov 19, 2026",status:"Awaiting HR Review"}]} />} activity="No recent activity" />);
  expect(screen.getByRole("region", {name:"Key HR metrics"}).querySelectorAll("a")).toHaveLength(4);
  expect(screen.getByRole("link", {name:"Review interview for Fictional Candidate"}).getAttribute("href")).toBe("/admin/interviews/fictional-interview");
  expect(screen.getByRole("table").querySelectorAll("thead th")).toHaveLength(5);
  expect(screen.getByRole("heading",{name:"Quick Actions"})).toBeTruthy();
  expect(screen.queryByText("Completion Rate")).toBeNull();
});
it("keeps reviewers' work available without exposing unauthorized analytics shortcuts", () => {
  render(<DashboardView showMetrics={false} values={["—","—","—","—"]} pending={<PendingReviews rows={[]} />} activity="No activity" />);
  expect(screen.queryByRole("region",{name:"Key HR metrics"})).toBeNull();
  expect(screen.queryByRole("link",{name:"View Reports"})).toBeNull();
  expect(screen.getByRole("link",{name:"Review Interviews"})).toBeTruthy();
  expect(screen.getByText(/No interviews awaiting review/)).toBeTruthy();
});
it("has unique grouped routes and only one active parent or child link", () => {
  expect(new Set(ALL_NAV.map(x=>x.href)).size).toBe(ALL_NAV.length);
  expect(NAV_GROUPS.map(x=>x.label)).toContain("Administration");
  expect(ALL_NAV.filter(x=>isActive("/admin/assessments/rubrics",x.href)).map(x=>x.label)).toEqual(["Rubric Configuration"]);
  expect(isNavVisible(ALL_NAV.find(x=>x.href==="/admin/api-usage"),["interviews:review"],true)).toBe(false);
});
