import { expect, it } from "vitest";
import { wordErrorRate, evaluateSpeech } from "../../scripts/speech-accuracy.mjs";
it("measures insertions, deletions and substitutions against a known reference", () => {
  expect(wordErrorRate("I listen to customers", "I listen customers")).toMatchObject({wordErrors:1,wer:0.25});
  expect(wordErrorRate("I listen", "I always listen").wordErrors).toBe(1);
  expect(wordErrorRate("I listen", "I speak").wordErrors).toBe(1);
  expect(wordErrorRate("I listen.", "i listen").wer).toBe(0);
  expect(wordErrorRate("I listen", "").wer).toBe(1);
});
it("reports physical tests as pending until recognized text has been supplied", () => {
  expect(evaluateSpeech([{id:"fictional",reference:"I listen",recognized:null}])).toMatchObject({pending:1,measured:[],aggregateWER:null});
  expect(()=>wordErrorRate("", "words")).toThrow();
});
