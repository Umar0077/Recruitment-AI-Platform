import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const s = vi.hoisted(() => ({ api: true, auth: null, overview: vi.fn(), history: vi.fn(), provider: vi.fn() }));
vi.mock("@/lib/config/environment", () => ({ get isApiMode() { return s.api; } }));
vi.mock("@/lib/auth/auth-provider", () => ({ useAuth: () => s.auth }));
vi.mock("@/lib/api/api-usage", () => ({ apiUsage: { overview: (...args) => s.overview(...args), history: (...args) => s.history(...args), provider: (...args) => s.provider(...args) } }));
import { useApiUsage } from "@/lib/data/api-usage";
const history = { range: "7d", page: 1, limit: 20 };
let client;
function wrapper({ children }) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  s.api = true; s.auth = { status: "signedIn", profile: { id: "admin-a", permissions: ["users:manage"] } };
  s.overview.mockResolvedValue({ provider: "OpenRouter" }); s.history.mockResolvedValue({ items: [{ id: "admin-a-request" }], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } }); s.provider.mockResolvedValue({ status: "unavailable" });
});
afterEach(() => { cleanup(); client.clear(); vi.resetAllMocks(); });
describe("usage query authorization and caching", () => {
  it.each(["demo", "signedOut", "loading", "unprivileged"])("makes no usage API calls in %s state", state => {
    if (state === "demo") s.api = false;
    else if (state === "unprivileged") s.auth.profile.permissions = ["analytics:read"];
    else s.auth.status = state;
    renderHook(() => useApiUsage("7d", history), { wrapper });
    expect(s.overview).not.toHaveBeenCalled(); expect(s.history).not.toHaveBeenCalled(); expect(s.provider).not.toHaveBeenCalled();
  });
  it("loads only authorized data and passes cancellation signals", async () => {
    const { result } = renderHook(() => useApiUsage("7d", history), { wrapper });
    await waitFor(() => expect(result.current.requests.isSuccess).toBe(true));
    expect(s.history).toHaveBeenCalledWith(history, expect.any(AbortSignal));
    expect(s.provider).toHaveBeenCalledTimes(1);
  });
  it("never carries previous-account history into a new account while fetching", async () => {
    const { result, rerender } = renderHook(() => useApiUsage("7d", history), { wrapper });
    await waitFor(() => expect(result.current.requests.isSuccess).toBe(true));
    s.auth = { ...s.auth, profile: { ...s.auth.profile, id: "admin-b" } };
    s.history.mockImplementation(() => new Promise(() => {}));
    rerender();
    expect(result.current.requests.data).toBeUndefined();
  });
});
