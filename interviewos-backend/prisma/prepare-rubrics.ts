import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { draftFor } from "../src/modules/assessment/drafts";
import { json } from "../src/modules/assessment/assessment.service";
const db = new PrismaClient();
async function main() {
  const questions = await db.question.findMany({ where: { version: { status: "PUBLISHED" } } });
  let prepared = 0;
  for (const q of questions) {
    const content = draftFor(q.code);
    if (!content) continue;
    await db.referenceRubricVersion.upsert({ where: { questionId_version: { questionId: q.id, version: 1 } }, create: { questionId: q.id, version: 1, content: json(content) }, update: {} });
    prepared++;
  }
  console.log({ prepared, status: "DRAFT", approved: false });
}
main().catch(() => { console.error("Draft preparation failed"); process.exitCode = 1; }).finally(() => db.$disconnect());
