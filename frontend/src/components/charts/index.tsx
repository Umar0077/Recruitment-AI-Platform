"use client";
import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type * as Charts from "./recharts";
import { InterviewOSInlineLoader } from "@/components/ui/interviewos-loader";
export { CHART, ChartContainer, FunnelBars } from "./shared";

function ChartLoading() { return <div className="flex h-full items-center justify-center"><InterviewOSInlineLoader message="Loading chart…" /></div>; }
const Trend = dynamic(() => import("./recharts").then(m => m.TrendChart), { ssr: false, loading: ChartLoading });
const Donut = dynamic(() => import("./recharts").then(m => m.DonutChart), { ssr: false, loading: ChartLoading });
const Bars = dynamic(() => import("./recharts").then(m => m.BarsChart), { ssr: false, loading: ChartLoading });

/** Plot code loads locally after route content. Reserve the exact plot height in either state. */
export function TrendChart(props: ComponentProps<typeof Charts.TrendChart>) {
  return <div style={{height:props.height ?? 260}}><Trend {...props} /></div>;
}
export function DonutChart(props: ComponentProps<typeof Charts.DonutChart>) {
  return <div style={{height:props.height ?? 200}}><Donut {...props} /></div>;
}
export function BarsChart(props: ComponentProps<typeof Charts.BarsChart>) {
  return <div style={{height:props.height ?? 240}}><Bars {...props} /></div>;
}
