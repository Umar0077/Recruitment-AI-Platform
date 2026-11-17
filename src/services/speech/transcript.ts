/** Local formatting only. Never infer missing words, technical terms, or grammar. */
export function cleanTranscript(original: string): string {
  const text = original.replace(/\s+/g, " ").trim();
  if (!text) return "";
  const capitalized = text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?…]["'’”)]?$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

export interface AnswerTranscriptMetadata {
  originalTranscript: string;
  interimTranscript?: string;
  cleanedTranscript?: string;
  hasUnfinalized: boolean;
  language: string;
  cleanupVersion?: string;
}
