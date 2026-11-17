import { Injectable, HttpStatus } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import * as argon2 from "argon2";
import type { Request, Response } from "express";
import type { RoleCode } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { AuditService } from "../audit/audit.module";
import { AppError, forbidden, conflict, unprocessable } from "../../common/errors";
import type { AuthUser } from "../../common/auth-user";
import type { PermissionCode } from "../../common/constants/permissions";
import type { EnvironmentVariables } from "../../config/env.validation";

export const ADMIN_COOKIE = "interviewos_admin_session";
export const passwordHash = (password: string) => argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
export function checkPassword(password: string) {
  if (password.length < 14 || password.length > 128 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^a-zA-Z0-9]/.test(password) || /^(.)\1+$/.test(password)) throw unprocessable("VALIDATION_FAILED", "Use 14–128 characters including upper/lowercase letters, a number and a symbol.");
}
export const sessionHash = (token: string) => createHash("sha256").update(token).digest("hex");
const rejectLogin = () => new AppError("UNAUTHENTICATED", "Invalid email or password, or access is temporarily unavailable.", HttpStatus.UNAUTHORIZED);
const includeUser = { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } as const;
export type AdminRequest = Request & { user?: AuthUser; adminSessionId?: string; adminCredentialId?: string; mustChangePassword?: boolean };

@Injectable()
export class AdminAuthService {
  private dummy = passwordHash(randomBytes(32).toString("hex"));
  constructor(private readonly db: PrismaService, private readonly audit: AuditService, private readonly config: ConfigService<EnvironmentVariables, true>) {}
  checkOrigin(req: Request) {
    const origins = this.config.get("FRONTEND_ORIGINS", { infer: true }).split(",").map(x => x.trim());
    if (!req.headers.origin || !origins.includes(req.headers.origin) || req.headers["x-admin-request"] !== "1") throw forbidden("The administrator request origin could not be verified.");
    if (this.config.get("NODE_ENV", { infer: true }) === "production" && !req.secure) throw forbidden("HTTPS is required for administrator access.");
  }
  cookie(res: Response, token: string | null) {
    res.cookie(ADMIN_COOKIE, token ?? "", { httpOnly: true, secure: this.config.get("NODE_ENV", { infer: true }) === "production", sameSite: "strict", path: "/", maxAge: token ? 8 * 3600000 : 0 });
    res.setHeader("Cache-Control", "no-store");
  }
  async login(email: string, password: string, req: Request, res: Response) {
    this.checkOrigin(req);
    const found = await this.db.adminCredential.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!found) { await argon2.verify(await this.dummy, password); throw rejectLogin(); }
    const token = randomBytes(32).toString("base64url");
    const outcome = await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM admin_credentials WHERE id = ${found.id}::uuid FOR UPDATE`;
      const credential = await tx.adminCredential.findUniqueOrThrow({ where: { id: found.id }, include: { user: { include: includeUser } } });
      const valid = await argon2.verify(credential.passwordHash, password);
      const now = new Date();
      if (!valid || credential.user.status !== "ACTIVE" || (!credential.user.roles.length || credential.user.roles.some(r => r.role.code === "CANDIDATE")) || (credential.lockedUntil && credential.lockedUntil > now)) {
        const failures = credential.lockedUntil && credential.lockedUntil <= now ? 1 : credential.failedLoginAttempts + 1;
        await tx.adminCredential.update({ where: { id: credential.id }, data: { failedLoginAttempts: Math.min(failures, 5), lockedUntil: credential.lockedUntil && credential.lockedUntil > now ? credential.lockedUntil : failures >= 5 ? new Date(now.getTime() + 15 * 60000) : null } });
        await this.audit.record({ actorUserId: credential.userId, action: "admin.login_failed", entityType: "admin_credential", entityId: credential.id }, tx);
        return false;
      }
      await tx.adminCredential.update({ where: { id: credential.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
      await tx.user.update({ where: { id: credential.userId }, data: { lastLoginAt: now } });
      await tx.adminSession.create({ data: { credentialId: credential.id, tokenHash: sessionHash(token), expiresAt: new Date(now.getTime() + 8 * 3600000) } });
      await this.audit.record({ actorUserId: credential.userId, action: "admin.login", entityType: "admin_credential", entityId: credential.id }, tx);
      return true;
    }, { timeout: 15000 });
    if (!outcome) throw rejectLogin();
    this.cookie(res, token);
    return { authenticated: true };
  }
  async authenticate(req: AdminRequest): Promise<AuthUser | null> {
    const cookie = req.headers.cookie?.split(";").map(x => x.trim()).find(x => x.startsWith(`${ADMIN_COOKIE}=`))?.slice(ADMIN_COOKIE.length + 1);
    if (!cookie || !/^[A-Za-z0-9_-]{43}$/.test(cookie)) return null;
    const session = await this.db.adminSession.findUnique({ where: { tokenHash: sessionHash(cookie) }, include: { credential: { include: { user: { include: includeUser } } } } });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || session.lastSeenAt.getTime() < Date.now() - 30 * 60000 || session.credential.user.status !== "ACTIVE") return null;
    const user = session.credential.user;
    const roles = user.roles.map(r => r.role.code).filter(r => r !== "CANDIDATE");
    if (!roles.length || user.roles.some(r => r.role.code === "CANDIDATE")) return null;
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) this.checkOrigin(req);
    req.adminSessionId = session.id; req.adminCredentialId = session.credentialId; req.mustChangePassword = session.credential.mustChangePassword;
    if (session.lastSeenAt.getTime() < Date.now() - 60000) await this.db.adminSession.updateMany({ where: { id: session.id, revokedAt: null }, data: { lastSeenAt: new Date() } });
    return { id: user.id, firebaseUid: "", email: user.email, displayName: user.displayName, providers: ["admin-password"], roles, permissions: new Set(user.roles.flatMap(r => r.role.permissions.map(p => p.permission.code as PermissionCode))), candidateId: null };
  }
  async logout(req: AdminRequest, res: Response, all = false) {
    await this.db.adminSession.updateMany({ where: all ? { credentialId: req.adminCredentialId, revokedAt: null } : { id: req.adminSessionId }, data: { revokedAt: new Date() } });
    await this.audit.record({ actorUserId: req.user!.id, action: all ? "admin.sessions_revoked" : "admin.logout", entityType: "admin_credential", entityId: req.adminCredentialId! });
    this.cookie(res, null); return { signedOut: true };
  }
  async changePassword(req: AdminRequest, res: Response, current: string, next: string) {
    checkPassword(next);
    const nextHash = await passwordHash(next);
    await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM admin_credentials WHERE id = ${req.adminCredentialId!}::uuid FOR UPDATE`;
      const credential = await tx.adminCredential.findUniqueOrThrow({ where: { id: req.adminCredentialId } });
      if (!await argon2.verify(credential.passwordHash, current)) throw rejectLogin();
      if (await argon2.verify(credential.passwordHash, next)) throw unprocessable("VALIDATION_FAILED", "Choose a password different from your current password.");
      await tx.adminCredential.update({ where: { id: credential.id }, data: { passwordHash: nextHash, passwordChangedAt: new Date(), mustChangePassword: false, failedLoginAttempts: 0, lockedUntil: null } });
      await tx.adminSession.updateMany({ where: { credentialId: credential.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.record({ actorUserId: credential.userId, action: "admin.password_changed", entityType: "admin_credential", entityId: credential.id }, tx);
    }, { timeout: 15000 });
    this.cookie(res, null); return { changed: true, signInRequired: true };
  }
  requireSuper(req: AdminRequest) { if (!req.user?.roles.includes("SUPER_ADMIN")) throw forbidden(); }
  list(req: AdminRequest) {
    this.requireSuper(req);
    return this.db.adminCredential.findMany({ take: 100, orderBy: { createdAt: "desc" }, select: { id: true, email: true, mustChangePassword: true, lockedUntil: true, createdAt: true, user: { select: { id: true, displayName: true, status: true, lastLoginAt: true, roles: { select: { role: { select: { code: true } } } } } } } });
  }
  async create(req: AdminRequest, email: string, fullName: string, password: string, role: RoleCode) {
    this.requireSuper(req); checkPassword(password);
    if (!["HR_MANAGER", "RECRUITER", "REVIEWER"].includes(role)) throw forbidden("Only HR roles can be assigned here.");
    const hash = await passwordHash(password);
    return this.db.$transaction(async tx => {
      const identity = await tx.user.create({ data: { firebaseUid: `admin-local:${randomUUID()}`, email: email.trim().toLowerCase(), displayName: fullName.trim(), roles: { create: { role: { connect: { code: role } }, assignedBy: { connect: { id: req.user!.id } } } } } });
      const c = await tx.adminCredential.create({ data: { userId: identity.id, email: identity.email!, passwordHash: hash } });
      await this.audit.record({ actorUserId: req.user!.id, action: "admin.created", entityType: "admin_credential", entityId: c.id, summary: { role } }, tx);
      return { id: c.id, email: c.email };
    });
  }
  async manage(req: AdminRequest, id: string, input: { role?: RoleCode; active?: boolean; revoke?: boolean }) {
    this.requireSuper(req);
    return this.db.$transaction(async tx => {
      const c = await tx.adminCredential.findUniqueOrThrow({ where: { id }, include: { user: { include: { roles: { include: { role: true } } } } } });
      if (c.userId === req.user!.id || c.user.roles.some(r => r.role.code === "SUPER_ADMIN")) throw conflict("CONFLICT", "Super Admin accounts cannot be modified here. Use your own security screen to revoke sessions.");
      if (input.role) {
        if (!["HR_MANAGER", "RECRUITER", "REVIEWER"].includes(input.role)) throw forbidden();
        await tx.userRole.deleteMany({ where: { userId: c.userId } });
        await tx.userRole.create({ data: { userId: c.userId, roleId: (await tx.role.findUniqueOrThrow({ where: { code: input.role } })).id, assignedById: req.user!.id } });
      }
      if (input.active !== undefined) await tx.user.update({ where: { id: c.userId }, data: { status: input.active ? "ACTIVE" : "DISABLED" } });
      await tx.adminSession.updateMany({ where: { credentialId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.record({ actorUserId: req.user!.id, action: "admin.access_changed", entityType: "admin_credential", entityId: id, summary: { ...input } }, tx);
      return { updated: true };
    });
  }
  history(req: AdminRequest) { this.requireSuper(req); return this.db.auditLog.findMany({ where: { entityType: "admin_credential" }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, action: true, entityId: true, actorUserId: true, createdAt: true } }); }
}
