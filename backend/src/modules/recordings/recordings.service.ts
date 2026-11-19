import { Injectable, OnApplicationBootstrap, OnModuleDestroy, HttpStatus } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { RecordingStorage } from "../../integrations/storage/recording-storage";
import { AccessScope } from "../../common/access-scope";
import { AppError, forbidden, notFound, conflict } from "../../common/errors";
import type { AuthUser } from "../../common/auth-user";
import type { EnvironmentVariables } from "../../config/env.validation";
import { AuditService } from "../audit/audit.module";
import type { BeginRecordingDto, PartDto, CompleteRecordingDto, RecordingEventDto } from "./recordings.dto";
const PART_BYTES = 5 * 1024 * 1024;
const select = { id: true, status: true, contentType: true, sizeBytes: true, durationMs: true, consentAt: true, policyReference: true, monitoringConsent: true, cameraConsent: true, systemAudioConsent: true, displaySurface: true, retentionUntil: true, completedAt: true, deletedAt: true, createdAt: true } satisfies Prisma.InterviewRecordingSelect;
@Injectable()
export class RecordingsService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private cleaning = false;
  constructor(private db: PrismaService, private config: ConfigService<EnvironmentVariables, true>, private storage: RecordingStorage, private scope: AccessScope, private audit: AuditService) {}
  private get<K extends keyof EnvironmentVariables>(key: K) { return this.config.get(key, { infer: true }); }
  async policy() {
    const blockers: string[] = [];
    if (!this.get("RECORDING_ENABLED")) blockers.push("recording_disabled");
    if (!this.get("RECORDING_UPLOAD_ENABLED")) blockers.push("upload_disabled");
    if (!this.get("RECORDING_RETENTION_DAYS")) blockers.push("retention_missing");
    if (!this.get("RECORDING_POLICY_REFERENCE").trim()) blockers.push("policy_reference_missing");
    if (!this.get("RECORDING_SUPPORT_EMAIL").trim()) blockers.push("support_contact_missing");
    if (!this.storage.configured) blockers.push("storage_configuration_missing");
    const configured = this.get("RECORDING_ENABLED") && this.get("RECORDING_UPLOAD_ENABLED") && this.get("RECORDING_RETENTION_DAYS") > 0 && !!this.get("RECORDING_POLICY_REFERENCE").trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.get("RECORDING_SUPPORT_EMAIL"));
    const available = configured && await this.storage.ready();
    if (configured && !available) blockers.push(this.storage.readinessIssue ?? "storage_not_ready");
    return { available, mode: this.get("RECORDING_MODE"), blockers: [...new Set(blockers)], reason: available ? null : "Recording is unavailable until approved privacy, retention and private storage settings are ready. You may continue the existing interview without recording or request an alternative assessment.", policyReference: this.get("RECORDING_POLICY_REFERENCE"), retentionDays: this.get("RECORDING_RETENTION_DAYS"), supportEmail: this.get("RECORDING_SUPPORT_EMAIL"), screenRequirement: this.get("RECORDING_SCREEN_REQUIREMENT"), cameraEnabled: this.get("RECORDING_CAMERA_ENABLED"), monitoringEnabled: this.get("RECORDING_MONITORING_ENABLED"), partBytes: PART_BYTES, maxBytes: this.get("RECORDING_MAX_MB") * 1024 * 1024, width: this.get("RECORDING_WIDTH"), height: this.get("RECORDING_HEIGHT"), fps: this.get("RECORDING_FPS"), videoBitsPerSecond: this.get("RECORDING_VIDEO_BITRATE") };
  }
  private async session(id: string, user: AuthUser, owner = false) {
    const candidate = user.roles.includes("CANDIDATE");
    if (owner && !candidate || !candidate && !user.permissions.has("interviews:read")) throw forbidden();
    const session = await this.db.interviewSession.findFirst({ where: { id, ...(candidate ? { candidateId: user.candidateId ?? "00000000-0000-0000-0000-000000000000" } : { application: this.scope.applicationWhere(user) }) } });
    if (!session) throw notFound("Interview"); return session;
  }
  private async recording(id: string, user: AuthUser, owner = false) {
    const r = await this.db.interviewRecording.findUnique({ where: { id } });
    if (!r) throw notFound("Recording"); await this.session(r.sessionId, user, owner); return r;
  }
  async begin(dto: BeginRecordingDto, user: AuthUser) {
    const session = await this.session(dto.sessionId, user, true);
    if (this.get("RECORDING_MODE") === "local_test" && !user.email?.endsWith("@example.test")) throw forbidden("The local recording lab accepts fictional example.test identities only.");
    const policy = await this.policy();
    if (!policy.available || !dto.consent || dto.policyReference !== policy.policyReference || dto.cameraConsent !== policy.cameraEnabled || dto.monitoringConsent && !policy.monitoringEnabled) throw forbidden("Recording consent or approved policy is unavailable.");
    if (policy.screenRequirement === "full_display" && dto.displaySurface !== "monitor") throw forbidden("This recording requires sharing an entire display. Use the alternative assessment if unavailable.");
    if (session.status !== "IN_PROGRESS" || session.expiresAt <= new Date()) throw conflict("CONFLICT", "Start or resume the interview before recording.");
    let external: { key: string; uploadId: string } | undefined;
    try { return await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM interview_sessions WHERE id = ${session.id}::uuid FOR UPDATE`;
      const currentSession = await tx.interviewSession.findUniqueOrThrow({ where: { id: session.id } });
      if (currentSession.status !== "IN_PROGRESS" || currentSession.expiresAt <= new Date()) throw conflict("CONFLICT", "The interview is no longer active.");
      const prior = await tx.interviewRecording.findUnique({ where: { clientId: dto.clientId } });
      if (prior) { if (prior.sessionId !== session.id) throw forbidden(); return { id: prior.id, status: prior.status }; }
      if (await tx.interviewRecording.count({ where: { sessionId: session.id } }) >= 8) throw conflict("CONFLICT", "Recording attempt limit reached. Contact support; confirmed answers are preserved.");
      if (await tx.interviewRecording.count({ where: { sessionId: session.id, status: { in: ["RECORDING", "UPLOADING"] }, createdAt: { gt: new Date(Date.now() - 4 * 3600000) } } })) throw conflict("CONFLICT", "A recording is already active. Finish or cancel it before retrying.");
      const id = randomUUID(), key = `interviews/${session.id}/${id}`;
      // No media bytes enter PostgreSQL. Abort external work if the transaction fails.
      const r = await tx.interviewRecording.create({ data: { id, sessionId: session.id, candidateId: session.candidateId, clientId: dto.clientId, objectKey: key, contentType: dto.contentType, policyReference: policy.policyReference, monitoringConsent: dto.monitoringConsent, cameraConsent: dto.cameraConsent, systemAudioConsent: dto.systemAudioConsent, displaySurface: dto.displaySurface, retentionUntil: new Date(Date.now() + policy.retentionDays * 86400000) } });
      const uploadId = await this.storage.begin(key, dto.contentType);
      external = { key, uploadId };
      try {
        await tx.interviewRecording.update({ where: { id }, data: { uploadId } });
        await this.audit.record({ actorUserId: user.id, action: "recording.consent", entityType: "recording", entityId: id, summary: { policy: policy.policyReference, monitoring: dto.monitoringConsent } }, tx);
      } catch (e) { await this.storage.abort(key, uploadId).catch(() => undefined); throw e; }
      return { id: r.id, status: r.status };
    }, { timeout: 45000 }); } catch (e) { if (external) await this.storage.abort(external.key, external.uploadId).catch(() => undefined); throw e; }
  }
  async part(id: string, dto: PartDto, user: AuthUser) {
    await this.recording(id, user, true);
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM interview_recordings WHERE id = ${id}::uuid FOR UPDATE`;
      const r = await tx.interviewRecording.findUniqueOrThrow({ where: { id } });
      if (!r.uploadId || r.status !== "RECORDING" || r.retentionUntil <= new Date() || Date.now() - r.createdAt.getTime() > 24 * 3600000) throw conflict("CONFLICT", "Recording upload is no longer open.");
      if ((dto.partNumber - 1) * PART_BYTES + dto.sizeBytes > this.get("RECORDING_MAX_MB") * 1024 * 1024) throw forbidden("Recording size limit reached.");
      await tx.recordingSegment.upsert({ where: { recordingId_partNumber: { recordingId: id, partNumber: dto.partNumber } }, create: { recordingId: id, ...dto }, update: { sizeBytes: dto.sizeBytes } });
      return { url: await this.storage.partUrl(r.objectKey, r.uploadId, dto.partNumber, dto.sizeBytes), expiresInSeconds: 60 };
    });
  }
  async complete(id: string, dto: CompleteRecordingDto, user: AuthUser) {
    await this.recording(id, user, true);
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM interview_recordings WHERE id = ${id}::uuid FOR UPDATE`;
      const r = await tx.interviewRecording.findUniqueOrThrow({ where: { id }, include: { segments: { orderBy: { partNumber: "asc" } } } });
      if (r.status === "UPLOADED") return { status: r.status };
      if (r.status !== "RECORDING" || r.retentionUntil <= new Date() || !r.uploadId) throw conflict("CONFLICT", "Recording cannot be completed.");
      if (r.segments.length !== dto.partsCount || r.segments.some((p, i) => p.partNumber !== i + 1 || i < dto.partsCount - 1 && p.sizeBytes !== PART_BYTES)) throw conflict("CONFLICT", "Recording parts are incomplete.");
      const expectedSize = r.segments.reduce((sum, p) => sum + p.sizeBytes, 0);
      if (!expectedSize || expectedSize > this.get("RECORDING_MAX_MB") * 1024 * 1024) throw forbidden("Recording size limit exceeded.");
      let object = await this.storage.head(r.objectKey);
      if (!object) {
        const parts = await this.storage.parts(r.objectKey, r.uploadId);
        if (parts.length !== dto.partsCount || parts.some((p, i) => p.partNumber !== i + 1 || p.size !== r.segments[i]?.sizeBytes)) throw conflict("CONFLICT", "Storage has not confirmed all recording parts.");
        await this.storage.complete(r.objectKey, r.uploadId, parts);
        object = await this.storage.head(r.objectKey);
      }
      if (!object || object.size !== expectedSize || object.type !== r.contentType) throw new AppError("CONFLICT", "Storage verification failed. Retry or contact support.", HttpStatus.CONFLICT);
      await tx.interviewRecording.update({ where: { id }, data: { status: "UPLOADED", sizeBytes: object.size, durationMs: dto.durationMs, completedAt: new Date(), uploadId: null } });
      await this.audit.record({ actorUserId: user.id, action: "recording.upload_verified", entityType: "recording", entityId: id }, tx);
      return { status: "UPLOADED" };
    }, { timeout: 45000 });
  }
  async list(sessionId: string, user: AuthUser) {
    await this.session(sessionId, user);
    return { recordings: await this.db.interviewRecording.findMany({ where: { sessionId }, select, orderBy: { createdAt: "asc" }, take: 8 }), events: await this.db.interviewSessionEvent.findMany({ where: { sessionId }, select: { id: true, recordingId: true, type: true, occurredAt: true, receivedAt: true, durationMs: true, captureState: true }, orderBy: { occurredAt: "asc" }, take: 1000 }) };
  }
  async event(id: string, dto: RecordingEventDto, user: AuthUser) {
    const r = await this.recording(id, user, true);
    if (!r.monitoringConsent || ["DELETED", "CANCELLED"].includes(r.status) || r.retentionUntil <= new Date()) throw forbidden("Session event consent is not active.");
    const occurredAt = new Date(dto.occurredAt);
    if (occurredAt.getTime() < r.createdAt.getTime() - 60000 || occurredAt.getTime() > Date.now() + 60000) throw forbidden("Invalid session event time.");
    // Serialize quota/deduplication; client timestamps are observations, not evidence of misconduct.
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM interview_recordings WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await tx.interviewRecording.findUniqueOrThrow({ where: { id } });
      if (current.deletedAt || current.retentionUntil <= new Date() || occurredAt.getTime() > (current.completedAt?.getTime() ?? current.createdAt.getTime() + 4 * 3600000) + 60000) throw forbidden("Session event window has ended.");
      if (await tx.interviewSessionEvent.count({ where: { recordingId: id } }) >= 1000) throw forbidden("Session event limit reached.");
      await tx.interviewSessionEvent.createMany({ data: [{ ...dto, occurredAt, sessionId: r.sessionId, recordingId: id }], skipDuplicates: true }); return { accepted: true };
    });
  }
  async playback(id: string, user: AuthUser) {
    const r = await this.recording(id, user);
    if (user.roles.includes("CANDIDATE") || !user.permissions.has("interviews:review")) throw forbidden();
    if (r.status !== "UPLOADED" || r.retentionUntil <= new Date()) throw notFound("Recording");
    const session = await this.session(r.sessionId, user);
    if (!["COMPLETED", "SUBMITTED", "EXPIRED"].includes(session.status)) throw conflict("CONFLICT", "Playback becomes available after the interview ends.");
    if (!await this.storage.head(r.objectKey)) throw notFound("Recording");
    await this.audit.record({ actorUserId: user.id, action: "recording.playback_authorized", entityType: "recording", entityId: id });
    return { url: await this.storage.playback(r.objectKey), expiresAt: new Date(Date.now() + 60000).toISOString() };
  }
  async remove(id: string, user: AuthUser) {
    const r = await this.recording(id, user);
    const ownerCancel = user.roles.includes("CANDIDATE") && r.status !== "UPLOADED";
    if (!ownerCancel && !user.permissions.has("users:manage")) throw forbidden();
    await this.purge(id, user.id, ownerCancel ? "CANCELLED" : "DELETED", ownerCancel); return { deleted: true };
  }
  private async purge(id: string, actor: string | null, status = "DELETED", incompleteOnly = false) {
    await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM interview_recordings WHERE id = ${id}::uuid FOR UPDATE`;
      const r = await tx.interviewRecording.findUniqueOrThrow({ where: { id } });
      if (r.deletedAt) return;
      if (incompleteOnly && r.status === "UPLOADED") throw forbidden("Only authorized staff can delete a completed recording.");
      if (r.uploadId) await this.storage.abort(r.objectKey, r.uploadId);
      await this.storage.remove(r.objectKey);
      await tx.interviewRecording.update({ where: { id }, data: { status, deletedAt: new Date(), uploadId: null } });
      await tx.interviewSessionEvent.deleteMany({ where: { recordingId: id } });
      await tx.recordingSegment.deleteMany({ where: { recordingId: id } });
      await this.audit.record({ actorUserId: actor, action: "recording.deletion_verified", entityType: "recording", entityId: id }, tx);
    }, { timeout: 45000 });
  }
  async cleanup() {
    if (this.cleaning || !this.storage.configured) return; this.cleaning = true;
    try {
      if (this.get("RECORDING_MODE") === "local_test") await this.storage.cleanupAbandonedUploads();
      const rows = await this.db.interviewRecording.findMany({ where: { deletedAt: null, OR: [{ retentionUntil: { lte: new Date() } }, { status: "RECORDING", createdAt: { lt: new Date(Date.now() - 24 * 3600000) } }] }, select: { id: true }, take: 50 });
      for (const r of rows) await this.purge(r.id, null).catch(() => undefined); // Retry next sweep; never falsely mark deleted.
    } finally { this.cleaning = false; }
  }
  onApplicationBootstrap() { if (this.get("NODE_ENV") !== "test" && this.storage.configured) { this.timer = setInterval(() => void this.cleanup().catch(() => undefined), 300000); this.timer.unref(); } }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
}
