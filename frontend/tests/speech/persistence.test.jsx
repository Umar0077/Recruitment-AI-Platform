import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TranscriptVersions } from "@/components/interview/transcript-versions";
import { useDemoStore } from "@/lib/demo/store";
import { officialQuestions } from "@/lib/demo/questions";

afterEach(cleanup);
describe("transcript provenance in review and persistence", () => {
  it("distinguishes original capture, local suggestion and candidate-confirmed assessment text", () => {
    render(<TranscriptVersions answer={{ transcript: "I am still unsure.", originalTranscript: "i am still unsure", cleanedTranscript: "I am still unsure", hasUnfinalized: true, language: "en-IN" }} />);
    expect(screen.getByText("Candidate-confirmed answer · assessment text")).toBeTruthy();
    expect(screen.getByText("I am still unsure.")).toBeTruthy();
    expect(screen.getByText("i am still unsure")).toBeTruthy();
    expect(screen.getByText("I am still unsure")).toBeTruthy();
    expect(screen.getByText(/Recognition stopped with unfinished words/)).toBeTruthy();
  });
  it("does not present confirmed legacy answers as original capture", () => {
    render(<TranscriptVersions answer={{ transcript: "A fictional legacy answer" }} />);
    expect(screen.getByText("Original transcript unavailable for this answer.")).toBeTruthy();
    expect(screen.getByText("No cleaned version was saved.")).toBeTruthy();
  });
  it("keeps all transcript versions after a demo pause, resume and submission", () => {
    const originalState = useDemoStore.getState();
    try {
      originalState.resetDemoInterview();
      const state = useDemoStore.getState();
      const candidate = state.candidates.find(c => c.id === state.flow.candidateId);
      const question = officialQuestions(candidate.track)[0];
      const answer = { questionId: question.id, transcript: "Fictional reviewed answer.", originalTranscript: "  fictional raw answer  ", cleanedTranscript: "Fictional raw answer.", hasUnfinalized: true, language: "en-GB", cleanupVersion: "local-format-v1", durationSec: 15, inputMode: "voice", confirmedAt: "2026-11-17T12:00:00.000Z" };
      state.recordAnswer(answer);
      useDemoStore.getState().interruptInterview();
      expect(useDemoStore.getState().flow.answers[0]).toEqual(answer);
      useDemoStore.getState().updateFlow({ stage: "active" });
      for (let i = 1; i < officialQuestions(candidate.track).length; i++) useDemoStore.getState().recordAnswer();
      useDemoStore.getState().submitInterview();
      const persisted = useDemoStore.getState().interviews.find(i => i.id === candidate.interviewId).answers[0];
      expect(persisted).toMatchObject({ transcript: answer.transcript, originalTranscript: answer.originalTranscript, cleanedTranscript: answer.cleanedTranscript, hasUnfinalized: true, language: "en-GB", cleanupVersion: "local-format-v1" });
      expect(useDemoStore.getState().flow.stage).toBe("submitted");
    } finally { useDemoStore.setState(originalState, true); }
  });
});
