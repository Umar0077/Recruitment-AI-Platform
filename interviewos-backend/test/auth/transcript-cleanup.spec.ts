import { validateTranscriptCleanup } from "../../src/modules/assessment/transcript-cleanup";
describe("faithful transcript correction evaluation contract", () => {
  const original = "i did not meet 12.5% conversion in CRM i made 30 calls";
  it("accepts capitalization and punctuation without improving the answer", () => {
    expect(validateTranscriptCleanup({ correctedText: "I did not meet 12.5% conversion in CRM. I made 30 calls." }, original).correctedText).toContain("not");
  });
  it.each([
    "I did meet 12.5% conversion in CRM. I made 30 calls.",
    "I did not meet 125% conversion in CRM. I made 30 calls.",
    "I did not meet 12.5% conversion in CRM. I made 300 calls.",
    "I did not meet 12.5% conversion in CRM. I made 30 successful calls.",
    "I made 30 calls. I did not meet 12.5% conversion in CRM.",
  ])("rejects changed facts/negation/words/order", correctedText => expect(() => validateTranscriptCleanup({ correctedText }, original)).toThrow("UNFAITHFUL_CLEANUP"));
  it.each([null, [], { correctedText: 1 }, { correctedText: "" }, { correctedText: "hello", explanation: "added" }])("rejects malformed structured output", value => expect(() => validateTranscriptCleanup(value, original)).toThrow("INVALID_CLEANUP"));
  it("does not expand contractions or guess domain terms", () => {
    expect(() => validateTranscriptCleanup({ correctedText: "I can sell CRM." }, "I can't sell C R M")).toThrow();
  });
});
