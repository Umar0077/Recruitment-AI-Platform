export const USAGE_RANGE_LABELS = { today: "Today", "7d": "Last 7 days", "30d": "Last 30 days", month: "Current month" } as const;
const numberFormat = new Intl.NumberFormat("en-US");
const dollarFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 6 });
const utcFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
export const usageNumber = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "Unavailable" : numberFormat.format(value);
export const usageUsd = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "Unavailable" : dollarFormat.format(value);
export const usageLatency = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "Unavailable" : value < 1000 ? `${Math.round(value)} ms` : `${(value / 1000).toFixed(2)} s`;
/** Legacy combined totals remain valid even when input/output breakdowns are unavailable. */
export function knownTokenTotal(row: { totalTokens: number; tokenCoverageRequests: number; requests: number }) { return row.totalTokens > 0 || row.tokenCoverageRequests > 0 || row.requests === 0 ? row.totalTokens : null; }
export function usageUtc(value: string | null | undefined) { const time = value ? new Date(value) : null; return time && Number.isFinite(time.getTime()) ? `${utcFormat.format(time)} UTC` : "Unavailable"; }
export function resetCountdown(resetAt: string | null | undefined, now: number): string | null {
  const remaining = resetAt ? new Date(resetAt).getTime() - now : NaN;
  if (!Number.isFinite(remaining)) return null;
  if (remaining <= 0) return "Reset time reached; refresh usage to confirm.";
  const seconds = Math.ceil(remaining / 1000);
  return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds / 60) % 60}m ${seconds % 60}s`;
}
export function validateUsageDates(from: string, to: string): string | null {
  if (!from && !to) return null;
  if (!from || !to) return "Choose both dates, or clear both to use the selected period.";
  const start = Date.parse(`${from}T00:00:00.000Z`), end = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "Choose valid calendar dates.";
  if (new Date(start).toISOString().slice(0, 10) !== from || new Date(end).toISOString().slice(0, 10) !== to) return "Choose valid calendar dates.";
  if (end < start) return "End date must be on or after the start date.";
  if ((end - start) / 86400000 + 1 > 366) return "Choose a date range of 366 days or fewer.";
  return null;
}
