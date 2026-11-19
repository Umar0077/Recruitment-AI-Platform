import type { ConfigService } from "@nestjs/config";
import type { PrismaService } from "../../database/prisma.service";
import type { EnvironmentVariables } from "../../config/env.validation";
import type { AuditService } from "../audit/audit.module";
import type { RequestContext } from "../../common/http";
import { forbidden, conflict, notFound, unprocessable } from "../../common/errors";
import { PERMISSIONS } from "../../common/constants/permissions";

/** Database locks serialize repeated logins; the unique assignment key is the final safeguard. */
export async function assignInitial(prisma: PrismaService, config: ConfigService<EnvironmentVariables, true>, audit: AuditService, input: { roleCode?: string; applicationId?: string }, ctx: RequestContext) {
  if (!ctx.user.roles.includes("CANDIDATE") || !ctx.user.permissions.has(PERMISSIONS.INTERVIEWS_TAKE)) throw forbidden("Candidate access is required.");
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${ctx.user.id}::uuid FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
    if (!user.emailVerified || !user.email) throw forbidden("Verify your email before requesting an interview.");
    if (!user.displayName?.trim()) throw unprocessable("PROFILE_INCOMPLETE", "Complete your full name before requesting an interview.");
    let candidate = await tx.candidate.findUnique({ where: { userId: user.id } });
    if (!candidate) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.email.toLowerCase()}))`;
      const matches = await tx.candidate.findMany({ where: { email: { equals: user.email, mode: "insensitive" } }, take: 2 });
      if (matches.length > 1 || (matches[0]?.userId && matches[0].userId !== user.id)) throw conflict("PROFILE_LINK_REQUIRED", "Please contact recruitment to link your existing application.");
      if (matches[0]) {
        const linked = await tx.candidate.updateMany({ where: { id: matches[0].id, userId: null }, data: { userId: user.id } });
        if (!linked.count) throw conflict("PROFILE_LINK_REQUIRED", "Please contact recruitment to link your application.");
        candidate = { ...matches[0], userId: user.id };
      }
    }
    if (candidate) {
      await tx.$queryRaw`SELECT id FROM candidates WHERE id = ${candidate.id}::uuid FOR UPDATE`;
      const existing = await tx.interviewSession.findFirst({ where: { candidateId: candidate.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
      if (existing) return { state: "assigned", interviewId: existing.id, applicationId: existing.applicationId, candidateId: existing.candidateId };
    }
    const apps = candidate ? await tx.application.findMany({ where: { candidateId: candidate.id }, include: { jobRole: true }, orderBy: [{ submittedAt: "desc" }, { id: "desc" }] }) : [];
    let app = input.applicationId ? apps.find(a => a.id === input.applicationId) : apps.length === 1 ? apps[0] : undefined;
    if (input.applicationId && !app) throw notFound("Application");
    if (apps.length > 1 && !app) return { state: "select_application", applications: apps.map(a => ({ id: a.id, title: a.jobRole.title, status: a.status })) };
    if (app && !["APPLICATION_RECEIVED", "AI_INTERVIEW_PENDING"].includes(app.status)) throw conflict("APPLICATION_NOT_ELIGIBLE", "Your application is already being processed. Please contact recruitment.");
    const roleCode = app?.jobRole.code ?? input.roleCode;
    if (!roleCode) return { state: "select_role", roles: await tx.jobRole.findMany({ where: { isActive: true, code: { in: ["FE-CLOSER", "CSR-FRESHER"] } }, select: { code: true, title: true, description: true, track: true } }) };
    if (!["FE-CLOSER", "CSR-FRESHER"].includes(roleCode)) throw unprocessable("INVALID_ROLE", "Select one of the supported interview roles.");
    const role = await tx.jobRole.findUnique({ where: { code: roleCode }, include: { defaultQuestionSet: { include: { activeVersion: { include: { questions: { where: { isActive: true }, orderBy: { position: "asc" } } } } } } } });
    const version = role?.defaultQuestionSet?.activeVersion;
    const prefix = roleCode === "FE-CLOSER" ? "FE" : "CSR";
    if (!role?.isActive || !version || version.status !== "PUBLISHED" || role.defaultQuestionSet?.track !== role.track || version.questions.length !== 4 || version.questions.some((q, i) => q.code !== `${prefix}-00${i + 1}`)) throw unprocessable("QUESTION_SET_NOT_PUBLISHED", "The approved question set for this role is unavailable. Please contact recruitment.");
    if (!candidate) candidate = await tx.candidate.create({ data: { userId: user.id, fullName: user.displayName.trim(), email: user.email, category: role.track } });
    if (!app) app = await tx.application.create({ data: { candidateId: candidate.id, jobRoleId: role.id, source: "MANUAL", externalApplicationRef: `initial:${user.id}`, submittedAt: new Date() }, include: { jobRole: true } });
    await tx.$queryRaw`SELECT id FROM applications WHERE id = ${app.id}::uuid FOR UPDATE`;
    const existing = await tx.interviewSession.findFirst({ where: { applicationId: app.id } });
    if (existing) return { state: "assigned", interviewId: existing.id, applicationId: existing.applicationId, candidateId: existing.candidateId };
    const current = await tx.application.findUniqueOrThrow({ where: { id: app.id } });
    if (!["APPLICATION_RECEIVED", "AI_INTERVIEW_PENDING"].includes(current.status)) throw conflict("APPLICATION_NOT_ELIGIBLE", "Please contact recruitment about your application.");
    const now = new Date();
    const windowH = config.get("INTERVIEW_COMPLETION_WINDOW_HOURS", { infer: true });
    const reminderH = config.get("INTERVIEW_REMINDER_AFTER_HOURS", { infer: true });
    const session = await tx.interviewSession.create({ data: {
      initialAssignmentKey: candidate.id, candidateId: candidate.id, applicationId: app.id, jobRoleId: role.id, questionSetVersionId: version.id,
      invitedAt: now, expiresAt: new Date(now.getTime() + windowH * 3600000), reminderDueAt: reminderH < windowH ? new Date(now.getTime() + reminderH * 3600000) : null,
      currentQuestionId: version.questions[0]!.id,
      questions: { create: version.questions.map(q => ({ questionId: q.id, position: q.position, code: q.code, textSnapshot: q.text, categorySnapshot: q.category, responseSeconds: q.responseSeconds })) },
      progressEvents: { create: { type: "INVITED" } },
    } });
    if (current.status === "APPLICATION_RECEIVED") {
      await tx.application.update({ where: { id: app.id }, data: { status: "AI_INTERVIEW_PENDING", statusChangedAt: now } });
      await tx.recruitmentEvent.create({ data: { applicationId: app.id, type: "STATUS_CHANGED", fromStatus: current.status, toStatus: "AI_INTERVIEW_PENDING", actorUserId: user.id } });
    }
    await tx.recruitmentEvent.create({ data: { applicationId: app.id, type: "INTERVIEW_INVITED", actorUserId: user.id, note: version.versionCode } });
    await audit.record({ actorUserId: user.id, action: "interview.initial_assigned", entityType: "interview_session", entityId: session.id, summary: { applicationId: app.id }, requestId: ctx.requestId }, tx);
    return { state: "assigned", interviewId: session.id, applicationId: session.applicationId, candidateId: session.candidateId };
  });
}
