/**
 * Read-only developer tool: shows what PostgreSQL holds for a candidate's latest interview.
 *
 *   npm run db:inspect -- <candidate-email>
 *
 * Prints session status, progress events, confirmed answers (truncated), HR review, remarks and
 * the application's recruitment status. Never modifies data.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const clip = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("Usage: npm run db:inspect -- <candidate-email>");
  const s = await prisma.interviewSession.findFirst({
    where: { candidate: { email: { equals: email, mode: "insensitive" } } },
    orderBy: { createdAt: "desc" },
    include: {
      candidate: { select: { fullName: true, userId: true } },
      questionSetVersion: { select: { versionCode: true } },
      questions: { orderBy: { position: "asc" }, include: { answer: true } },
      progressEvents: { orderBy: { createdAt: "asc" } },
      review: true,
      application: { select: { id: true, status: true, remarks: { select: { body: true, createdAt: true } }, events: { orderBy: { createdAt: "asc" }, select: { type: true, toStatus: true, createdAt: true } } } },
    },
  });
  if (!s) return console.log(`No interview found for ${email}.`);
  console.log(`Interview ${s.id} — ${s.candidate.fullName} — ${s.questionSetVersion.versionCode}`);
  console.log(`  status ${s.status} · started ${s.startedAt?.toISOString() ?? "—"} · submitted ${s.submittedAt?.toISOString() ?? "—"} · expires ${s.expiresAt.toISOString()}`);
  console.log(`  candidate login linked: ${s.candidate.userId ? "yes" : "no"} · application ${s.application.id} status ${s.application.status}`);
  console.log("  progress events:", s.progressEvents.map((e) => e.type + (e.questionCode ? `(${e.questionCode})` : "")).join(" → "));
  for (const q of s.questions) {
    const a = q.answer;
    console.log(`  ${q.code} ${a ? `✓ ${a.source} ${a.responseDurationSec}s at ${a.confirmedAt.toISOString()} — "${clip(a.transcript)}"` : "— no confirmed answer"}`);
  }
  console.log(`  HR review: ${s.review ? `${s.review.status}${s.review.reviewedAt ? ` at ${s.review.reviewedAt.toISOString()}` : ""}` : "none"}`);
  console.log(`  HR remarks: ${s.application.remarks.length}`);
  console.log("  recruitment events:", s.application.events.map((e) => e.type + (e.toStatus ? `→${e.toStatus}` : "")).join(", "));
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
