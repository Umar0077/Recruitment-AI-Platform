import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useDemoStore } from "@/lib/demo/store";

let original;
beforeEach(() => { original = useDemoStore.getState(); useDemoStore.getState().resetDemo(); useDemoStore.setState({ candidateSession: null, candidateProgress: {} }); });
afterEach(() => { useDemoStore.setState(original, true); });

function partialInterview(email) {
  useDemoStore.getState().startSession("candidate", email);
  useDemoStore.getState().updateFlow({ consent: true, equipmentChecked: true, practiceDone: true, stage: "active" });
  useDemoStore.getState().recordAnswer(); useDemoStore.getState().recordAnswer();
  useDemoStore.getState().interruptInterview();
  return useDemoStore.getState().flow;
}

describe("demo fresh login isolation", () => {
  it("clears confirmed answers across sign-out and same-email sign-in", () => {
    const saved = partialInterview("fictional-resume@example.test");
    useDemoStore.getState().endSession("candidate");
    expect(useDemoStore.getState().candidateSession).toBeNull();
    expect(useDemoStore.getState().flow.answeredCount).toBe(0);
    expect(useDemoStore.getState().flow.answers).toBeUndefined();
    useDemoStore.getState().startSession("candidate", " FICTIONAL-RESUME@example.test ");
    expect(useDemoStore.getState().flow.answeredCount).toBe(0);
    expect(useDemoStore.getState().flow.answeredCount).toBe(0);
    const interview = useDemoStore.getState().interviews.find(item => item.candidateId === saved.candidateId);
    expect(interview.answers).toHaveLength(0);
    expect(interview.status).toBe("not_started");
  });
  it("starts fresh after persisted-store hydration for every identity", async () => {
    partialInterview("fictional-a@example.test");
    useDemoStore.getState().endSession("candidate");
    const raw = localStorage.getItem("interviewos-demo-v3");
    useDemoStore.setState({ candidateProgress: {} });
    localStorage.setItem("interviewos-demo-v3", raw);
    await useDemoStore.persist.rehydrate();
    useDemoStore.getState().startSession("candidate", "fictional-b@example.test");
    expect(useDemoStore.getState().flow.answeredCount).toBe(0);
    expect(useDemoStore.getState().flow.answers).toBeUndefined();
    const bCandidate = useDemoStore.getState().candidates.find(item => item.id === useDemoStore.getState().flow.candidateId);
    expect(useDemoStore.getState().interviews.find(item => item.id === bCandidate.interviewId).answers).toEqual([]);
    useDemoStore.getState().endSession("candidate");
    useDemoStore.getState().startSession("candidate", "fictional-a@example.test");
    expect(useDemoStore.getState().flow.answeredCount).toBe(0);
  });
  it("starts fresh after a submitted demo and supports an explicit reset", () => {
    partialInterview("fictional-submitted@example.test");
    useDemoStore.getState().recordAnswer(); useDemoStore.getState().recordAnswer();
    const reference = useDemoStore.getState().submitInterview();
    useDemoStore.getState().endSession("candidate");
    useDemoStore.getState().startSession("candidate", "fictional-submitted@example.test");
    expect(useDemoStore.getState().flow.stage).toBe("not_started");
    expect(useDemoStore.getState().flow.reference).not.toBe(reference);
    useDemoStore.getState().resetDemoInterview();
    useDemoStore.getState().endSession("candidate");
    useDemoStore.getState().startSession("candidate", "fictional-submitted@example.test");
    expect(useDemoStore.getState().flow.answeredCount).toBe(0);
    expect(useDemoStore.getState().flow.stage).toBe("not_started");
  });
  it("does not change candidate progress when an admin session starts or ends", () => {
    const saved = partialInterview("fictional-candidate@example.test");
    useDemoStore.getState().startSession("admin", "fictional-admin@example.test");
    useDemoStore.getState().endSession("admin");
    expect(useDemoStore.getState().flow).toEqual(saved);
  });
});
