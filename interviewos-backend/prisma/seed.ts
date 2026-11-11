/**
 * Idempotent seed. Safe to run repeatedly; never deletes candidate data.
 *  - Always: roles, permissions (synced to the code matrix), job roles, official question sets (V1).
 *  - Development only (SEED_DEV_DATA=true, NODE_ENV != production): test-mode staff users and
 *    clearly-flagged sample candidates (is_sample = true). Refuses to create these in production.
 */
import "dotenv/config";
import { PrismaClient, type RoleCode } from "@prisma/client";
import { ROLE_PERMISSIONS, PERMISSIONS } from "../src/common/constants/permissions";
import { HR_SOURCE, JOB_ROLES, QUESTION_SETS, RESPONSE_SECONDS, ROLE_NAMES } from "./seed-data";

const prisma = new PrismaClient();
const prod = process.env.NODE_ENV === "production";

async function seedAccess() {
  for (const code of Object.values(PERMISSIONS)) {
    await prisma.permission.upsert({ where: { code }, create: { code }, update: {} });
  }
  const perms = new Map((await prisma.permission.findMany()).map((p) => [p.code, p.id]));
  for (const [code, [name, description]] of Object.entries(ROLE_NAMES) as [RoleCode, readonly [string, string]][]) {
    const role = await prisma.role.upsert({ where: { code }, create: { code, name, description }, update: { name, description } });
    const wanted = ROLE_PERMISSIONS[code].map((p) => perms.get(p)!);
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id, permissionId: { notIn: wanted } } });
    await prisma.rolePermission.createMany({ data: wanted.map((permissionId) => ({ roleId: role.id, permissionId })), skipDuplicates: true });
  }
  console.log(`✓ roles (${Object.keys(ROLE_NAMES).length}) and permissions (${perms.size})`);
}

async function seedQuestionSets() {
  for (const set of QUESTION_SETS) {
    const qs = await prisma.questionSet.upsert({ where: { code: set.code }, create: { code: set.code, title: set.title, track: set.track }, update: { title: set.title } });
    const versionCode = `${set.code}-V1`;
    const existing = await prisma.questionSetVersion.findUnique({ where: { versionCode }, include: { questions: { orderBy: { position: "asc" } } } });
    if (existing) {
      // Published content is immutable — report drift instead of rewriting it.
      const drift = set.questions.some((q, i) => existing.questions[i]?.code !== q.code || existing.questions[i]?.text !== q.text || existing.questions[i]?.category !== q.category);
      if (drift) console.warn(`! ${versionCode} differs from seed-data.ts — left unchanged. Publish a new version to change questions.`);
    } else {
      await prisma.$transaction(async (tx) => {
        const v = await tx.questionSetVersion.create({
          data: {
            questionSetId: qs.id, version: 1, versionCode, status: "PUBLISHED", source: HR_SOURCE, publishedAt: new Date(),
            questions: { create: set.questions.map((q, i) => ({ ...q, position: i + 1, responseSeconds: RESPONSE_SECONDS })) },
          },
        });
        await tx.questionSet.update({ where: { id: qs.id }, data: { activeVersionId: v.id } });
      });
    }
    const fresh = await prisma.questionSet.findUniqueOrThrow({ where: { id: qs.id } });
    if (!fresh.activeVersionId) {
      const v = await prisma.questionSetVersion.findUniqueOrThrow({ where: { versionCode } });
      if (v.status === "PUBLISHED") await prisma.questionSet.update({ where: { id: qs.id }, data: { activeVersionId: v.id } });
    }
  }
  console.log(`✓ question sets ${QUESTION_SETS.map((s) => `${s.code}-V1`).join(", ")}`);
}

async function seedJobRoles() {
  for (const r of JOB_ROLES) {
    const qs = await prisma.questionSet.findUniqueOrThrow({ where: { code: r.questionSet } });
    await prisma.jobRole.upsert({
      where: { code: r.code },
      create: { code: r.code, title: r.title, track: r.track, description: r.description, defaultQuestionSetId: qs.id },
      update: { title: r.title, description: r.description, defaultQuestionSetId: qs.id },
    });
  }
  console.log(`✓ job roles ${JOB_ROLES.map((r) => r.code).join(", ")}`);
}

/** Staff accounts usable ONLY with AUTH_MODE=test tokens ("test:<uid>"), which production refuses. */
const DEV_USERS: { uid: string; name: string; email: string; role: RoleCode }[] = [
  { uid: "dev-super-admin", name: "Dev Super Admin", email: "super-admin@dev.invalid", role: "SUPER_ADMIN" },
  { uid: "dev-hr-manager", name: "Dev HR Manager", email: "hr-manager@dev.invalid", role: "HR_MANAGER" },
  { uid: "dev-recruiter", name: "Dev Recruiter", email: "recruiter@dev.invalid", role: "RECRUITER" },
  { uid: "dev-reviewer", name: "Dev Reviewer", email: "reviewer@dev.invalid", role: "REVIEWER" },
  { uid: "dev-candidate", name: "Sample Candidate (Ayesha)", email: "candidate@dev.invalid", role: "CANDIDATE" },
];

const SAMPLE_CANDIDATES = [
  { ext: "sample-001", fullName: "Ayesha Khan (Sample)", email: "candidate@dev.invalid", role: "CSR-FRESHER", location: "Lahore", linkUid: "dev-candidate" },
  { ext: "sample-002", fullName: "Bilal Ahmed (Sample)", email: "bilal@dev.invalid", role: "FE-CLOSER", location: "Karachi" },
  { ext: "sample-003", fullName: "Sana Malik (Sample)", email: "sana@dev.invalid", role: "CSR-FRESHER", location: "Islamabad" },
] as const;

async function seedDevData() {
  const roles = new Map((await prisma.role.findMany()).map((r) => [r.code, r.id]));
  for (const u of DEV_USERS) {
    const user = await prisma.user.upsert({ where: { firebaseUid: u.uid }, create: { firebaseUid: u.uid, email: u.email, emailVerified: true, displayName: u.name }, update: {} });
    await prisma.userRole.createMany({ data: [{ userId: user.id, roleId: roles.get(u.role)! }], skipDuplicates: true });
  }
  for (const c of SAMPLE_CANDIDATES) {
    const role = await prisma.jobRole.findUniqueOrThrow({ where: { code: c.role } });
    const linkUser = "linkUid" in c ? await prisma.user.findUnique({ where: { firebaseUid: c.linkUid } }) : null;
    const candidate = await prisma.candidate.upsert({
      where: { externalCandidateId: c.ext },
      create: { externalCandidateId: c.ext, fullName: c.fullName, email: c.email, category: role.track, location: c.location, isSample: true, userId: linkUser?.id },
      update: {},
    });
    const ref = `${c.ext}-app`;
    const exists = await prisma.application.findUnique({ where: { source_externalApplicationRef: { source: "IMPORT", externalApplicationRef: ref } } });
    if (!exists) {
      await prisma.application.create({
        data: {
          candidateId: candidate.id, jobRoleId: role.id, source: "IMPORT", externalApplicationRef: ref, submittedAt: new Date(),
          details: { note: "Sample data for development" },
          events: { create: { type: "APPLICATION_RECEIVED", toStatus: "APPLICATION_RECEIVED", note: "development seed" } },
        },
      });
    }
  }
  console.log(`✓ development users (${DEV_USERS.length}) and sample candidates (${SAMPLE_CANDIDATES.length}, is_sample=true)`);
}

async function main() {
  await seedAccess();
  await seedQuestionSets();
  await seedJobRoles();
  const wantDev = (process.env.SEED_DEV_DATA ?? "true") === "true";
  if (wantDev && prod) {
    console.warn("! SEED_DEV_DATA ignored: development users and sample data are never created in production.");
  } else if (wantDev) {
    await seedDevData();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
