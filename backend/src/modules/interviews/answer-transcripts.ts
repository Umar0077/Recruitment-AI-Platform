import { Prisma, TranscriptKind } from "@prisma/client";
import type { SaveAnswerDto } from "./interviews.dto";

/** Existing transcript rows store provenance without changing the confirmed answer or schema. */
export function answerTranscripts(dto: SaveAnswerDto, confirmed: string): Prisma.InterviewTranscriptCreateWithoutAnswerInput[] {
  const common = { engine: dto.engine, language: dto.language };
  const records: Prisma.InterviewTranscriptCreateWithoutAnswerInput[] = [{ ...common, kind: "CONFIRMED", text: confirmed, metadata: { variant: "confirmed", candidateReviewed: true } }];
  const original = dto.originalTranscript ?? dto.provisionalTranscript;
  if (typeof original === "string") records.push({ ...common, kind: "PROVISIONAL", text: original, metadata: { variant: "original", hasUnfinalized: dto.hasUnfinalized ?? null, interimTranscript: dto.interimTranscript ?? null, finalOnly: dto.cleanupVersion === "format-v2-final-separated" } });
  if (typeof dto.cleanedTranscript === "string") records.push({ ...common, kind: "PROVISIONAL", text: dto.cleanedTranscript, metadata: { variant: "cleaned", cleanupVersion: dto.cleanupVersion ?? null } });
  return records;
}

type TranscriptRecord = { kind: TranscriptKind; text: string; language: string | null; metadata: Prisma.JsonValue };
function metadata(row?: TranscriptRecord): Prisma.JsonObject {
  return row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata as Prisma.JsonObject : {};
}

/** Legacy PROVISIONAL rows are original recognition text; absence never means confirmed text is raw. */
export function transcriptVersions(rows: TranscriptRecord[]) {
  const original = rows.find(row => row.kind === "PROVISIONAL" && metadata(row).variant === "original")
    ?? rows.find(row => row.kind === "PROVISIONAL" && metadata(row).variant === undefined);
  const cleaned = rows.find(row => row.kind === "PROVISIONAL" && metadata(row).variant === "cleaned");
  const confirmed = rows.find(row => row.kind === "CONFIRMED");
  return {
    originalTranscript: original?.text ?? null,
    cleanedTranscript: cleaned?.text ?? null,
    interimTranscript: typeof metadata(original).interimTranscript === "string" ? metadata(original).interimTranscript as string : null,
    originalFinalOnly: metadata(original).finalOnly === true,
    hasUnfinalized: typeof metadata(original).hasUnfinalized === "boolean" ? metadata(original).hasUnfinalized as boolean : null,
    cleanupVersion: typeof metadata(cleaned).cleanupVersion === "string" ? metadata(cleaned).cleanupVersion as string : null,
    language: original?.language ?? confirmed?.language ?? null,
    assessmentTranscript: "candidate_confirmed" as const,
  };
}
