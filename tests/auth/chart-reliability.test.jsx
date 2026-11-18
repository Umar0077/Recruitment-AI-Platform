import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("@/hooks/use-demo", () => ({ usePrefersReducedMotion: () => true }));
vi.mock("recharts", () => {
  const Container = ({ children }) => <svg>{children}</svg>;
  const Empty = () => null;
  return { ResponsiveContainer: Container, AreaChart: Container, LineChart: Container, BarChart: Container, PieChart: Container, Area: ({ fill }) => <path fill={fill} />, Line: Empty, Bar: Empty, Cell: Empty, CartesianGrid: Empty, Pie: Empty, Tooltip: Empty, XAxis: Empty, YAxis: Empty };
});
import { MetricCard } from "@/components/admin/widgets";
import { TrendChart } from "@/components/charts/recharts";

describe("shared dashboard chart edge cases", () => {
  it.each([{ spark: [] }, { spark: [0] }, { spark: [3] }, { spark: [1, 3] }])("renders finite sparkline coordinates for $spark", ({ spark }) => {
    const html = renderToStaticMarkup(<MetricCard label="Fictional metric" value={3} icon={() => null} spark={spark} />);
    expect(html).not.toMatch(/NaN|Infinity/);
  });
  it("keeps matching series keys in separate chart instances from sharing gradients", () => {
    const data = [{ day: "Fictional day", count: 1 }];
    const html = renderToStaticMarkup(<><TrendChart data={data} series={[{ key: "count", label: "Requests", color: "blue" }]} /><TrendChart data={data} series={[{ key: "count", label: "Tokens", color: "green" }]} /></>);
    const ids = [...html.matchAll(/linearGradient id="([^"]+)"/g)].map(match => match[1]);
    const fills = [...html.matchAll(/fill="url\(#([^)]*)\)"/g)].map(match => match[1]);
    expect(ids).toHaveLength(2); expect(new Set(ids).size).toBe(2); expect(fills).toEqual(ids);
  });
});
