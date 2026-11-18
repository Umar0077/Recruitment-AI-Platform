import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const words = text => text.toLowerCase().replaceAll("’", "'").match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) ?? [];
/** Word-level Levenshtein distance. Formatting normalization never edits stored answers. */
export function wordErrorRate(reference, recognized) {
  const a = words(reference), b = words(recognized);
  if (!a.length || a.length > 2000 || b.length > 2000) throw new Error("Use a nonempty reference and at most 2,000 words per transcript.");
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return { referenceWords: a.length, recognizedWords: b.length, wordErrors: row[b.length], wer: row[b.length] / a.length };
}
export function evaluateSpeech(rows) {
  const measured = rows.filter(row => typeof row.recognized === "string").map(row => ({ id: row.id, condition: row.condition, ...wordErrorRate(row.reference, row.recognized) }));
  const total = measured.reduce((sum, row) => ({ words: sum.words + row.referenceWords, errors: sum.errors + row.wordErrors }), { words: 0, errors: 0 });
  return { source: "operator-supplied transcripts; device conditions are not independently verified", measured, pending: rows.length - measured.length, aggregateWER: total.words ? total.errors / total.words : null };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(evaluateSpeech(JSON.parse(readFileSync(process.argv[2] ?? "tests/fixtures/speech-accuracy.json", "utf8"))), null, 2)); }
  catch { console.error("Could not evaluate the transcript file. Check the JSON format and reference text; transcript contents withheld."); process.exitCode = 1; }
}
