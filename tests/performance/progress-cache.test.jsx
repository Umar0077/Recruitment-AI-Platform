import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const mocks = vi.hoisted(() => ({ progress: vi.fn(), saveAnswer: vi.fn(), start: vi.fn(), interrupt: vi.fn(), submit: vi.fn() }));
vi.mock("@/lib/auth/auth-provider", () => ({ useAuth: () => ({ status: "signedIn", profile: { id: "fictional-candidate" } }) }));
vi.mock("@/lib/api/endpoints", () => ({ api: { interviews: mocks } }));
import { useProgress, useSaveAnswer, useStartInterview, useInterruptInterview, useSubmitInterview } from "@/lib/data/queries";
afterEach(() => { cleanup(); vi.resetAllMocks(); });
describe("authoritative interview progress", () => {
  it.each([['saveAnswer',useSaveAnswer],['start',useStartInterview],['interrupt',useInterruptInterview],['submit',useSubmitInterview]])("%s retains confirmed progress without an extra transcript request", async (name, mutationHook) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry:false }, mutations: { retry:false } } });
    const before = { interviewId:'fictional-interview', answeredCount:0 };
    const confirmed = { interviewId:'fictional-interview', answeredCount:1 };
    mocks.progress.mockResolvedValue(before);
    mocks[name].mockResolvedValue(['saveAnswer','submit'].includes(name) ? { progress:confirmed } : confirmed);
    const wrapper = ({children}) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const {result} = renderHook(() => ({query:useProgress('fictional-interview'),mutation:mutationHook('fictional-interview')}),{wrapper});
    await waitFor(() => expect(result.current.query.data).toEqual(before));
    await act(() => result.current.mutation.mutateAsync({consent:true,code:'Q1',input:{text:'Fictional response'}}));
    await waitFor(() => expect(result.current.query.data).toEqual(confirmed));
    expect(mocks.progress).toHaveBeenCalledTimes(1);
    expect(mocks.progress.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    client.clear();
  });
});
