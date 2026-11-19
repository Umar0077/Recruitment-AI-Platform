import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
const s = vi.hoisted(() => ({ path: "/candidate/onboarding", status: "signedIn", profile: { roles: ["CANDIDATE"], candidateId: null }, replace: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => s.path, useRouter: () => ({ replace: s.replace }) }));
vi.mock("@/lib/config/environment", () => ({ isApiMode: true }));
vi.mock("@/hooks/use-demo", () => ({ useHydrated: () => true }));
vi.mock("@/lib/demo/store", () => ({ useDemoStore: () => null }));
vi.mock("@/lib/auth/auth-provider", () => ({ useAuth: () => s }));
import { useAccessGate } from "@/lib/auth/use-access-gate";
function Probe() { return <output>{useAccessGate("candidate") ? "content mounted" : "blocked"}</output>; }
beforeEach(() => { s.path = "/candidate/onboarding"; s.status = "signedIn"; s.profile = { roles: ["CANDIDATE"], candidateId: null }; vi.clearAllMocks(); });
afterEach(cleanup);
it("mounts onboarding for a verified candidate with no candidate row", () => { render(<Probe />); expect(screen.getByText("content mounted")).toBeTruthy(); expect(s.replace).not.toHaveBeenCalled(); });
it.each(["/candidate/interview", "/candidate/interview/unavailable", "/candidate/status"])("routes %s to onboarding instead of the unavailable loop", path => { s.path = path; render(<Probe />); expect(s.replace).toHaveBeenCalledWith("/candidate/onboarding"); });
it("waits for authentication before routing", () => { s.status = "loading"; render(<Probe />); expect(s.replace).not.toHaveBeenCalled(); });
it("still rejects staff-only identities", () => { s.profile.roles = ["HR_MANAGER"]; render(<Probe />); expect(s.replace).toHaveBeenCalledWith("/candidate/login?denied=staff"); });
