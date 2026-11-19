/** Descriptive diagnostics only; never factual verification or a hiring score. */
export const NLP_VERSION = "interviewos-nlp-1.0.0";
export const PREPROCESSING_VERSION = "english-nfkc-1";
const STOP = new Set(["a", "an", "the", "is", "are", "was", "were", "of", "to", "in", "and", "i", "my"]);
export function normalize(text: string): string {
  return text.normalize("NFKC").replace(/[‘’]/g, "'").toLowerCase().replace(/\s+/g, " ").trim();
}
export function tokenize(text: string): string[] {
  return (normalize(text).match(/[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu) ?? []).filter(t => !STOP.has(t));
}
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || [...a, ...b].some(v => !Number.isFinite(v))) throw new Error("Invalid vector dimensions or values");
  const norm = (v: number[]) => Math.hypot(...v);
  const na = norm(a), nb = norm(b);
  if (!na || !nb) return 0;
  return Math.max(-1, Math.min(1, a.reduce((s, v, i) => s + (v / na) * (b[i] / nb), 0)));
}
export function tfidf(documents: string[]): number[][] {
  const tokens = documents.map(tokenize);
  const vocab = [...new Set(tokens.flat())].sort();
  return tokens.map(doc => vocab.map(term => {
    const count = doc.filter(t => t === term).length;
    // Log TF prevents repetition from dominating the vector.
    return count ? (1 + Math.log(count)) * (Math.log((1 + documents.length) / (1 + tokens.filter(d => d.includes(term)).length)) + 1) : 0;
  }));
}
export interface EmbeddingProvider {
  readonly model: string;
  embed(texts: string[]): Promise<number[][]>;
}
export interface Concept { name: string; alternatives: string[] }
export function analyze(questionId: string, answer: string, reference: string, concepts: Concept[]) {
  const words = tokenize(answer), unique = new Set(words), referenceWords = new Set(tokenize(reference));
  const vectors = tfidf([answer, reference, ...concepts.map(c => c.name)]);
  const sentences = answer.match(/[^.!?\n]+[.!?]?/g) ?? [];
  const findings = concepts.map(c => {
    const variants = [c.name, ...c.alternatives].map(tokenize).filter(v => v.length);
    const evidence = sentences.find(s => variants.some(v => v.every(t => new Set(tokenize(s)).has(t))));
    const negation = !!evidence && /\b(not|never|no|without|\w+n't)\b/i.test(evidence);
    return { concept: c.name, status: evidence ? (negation ? "requires_context_review" : "lexically_present") : "not_clearly_addressed", evidence: evidence?.trim() ?? null };
  });
  return {
    questionId, nlpVersion: NLP_VERSION, preprocessingVersion: PREPROCESSING_VERSION,
    lexicalSimilarity: cosine(vectors[0], vectors[1]),
    lexicalOverlap: unique.size ? [...unique].filter(t => referenceWords.has(t)).length / unique.size : 0,
    keywordCoverage: referenceWords.size ? [...referenceWords].filter(t => unique.has(t)).length / referenceWords.size : 0,
    semanticSimilarity: null, embeddingModel: null, semanticStatus: "unavailable",
    conceptCoverage: findings, wordCount: words.length, uniqueWordCount: unique.size,
    repetitionRatio: words.length ? 1 - unique.size / words.length : 0,
    completeness: words.length === 0 ? "empty" : words.length < 10 ? "limited_information" : "requires_context_review",
    analysisStatus: "completed",
    limitations: ["Lexical matches do not establish understanding or factual accuracy.", "Unmatched concepts may be expressed through paraphrases; human review is required.", "Negation flags require contextual review; they are not contradiction verdicts."],
  };
}
export async function semanticComparison(provider: EmbeddingProvider, answer: string, reference: string, concepts: Concept[]) {
  const texts = [answer, reference, ...concepts.flatMap(c => [c.name, ...c.alternatives])];
  const vectors = await provider.embed(texts);
  if (vectors.length !== texts.length || vectors.some(v => !v.length)) throw new Error("Invalid embedding response");
  return { model: provider.model, reference: cosine(vectors[0], vectors[1]), concepts: vectors.slice(2).map(v => cosine(vectors[0], v)) };
}
