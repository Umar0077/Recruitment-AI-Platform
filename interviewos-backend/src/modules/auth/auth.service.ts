import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../database/prisma.service";
import type { AuthUser } from "../../common/auth-user";
import type { PermissionCode } from "../../common/constants/permissions";
import { AppError } from "../../common/errors";
import type { EnvironmentVariables } from "../../config/env.validation";
import type { VerifiedIdentity } from "../../integrations/firebase/token-verifier";

const LAST_LOGIN_WRITE_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  /**
   * Resolves (or provisions) the application user for a verified identity.
   * New users get ONLY the CANDIDATE role. Staff roles are granted solely by an administrator.
   */
  async resolve(identity: VerifiedIdentity): Promise<AuthUser> {
    let user = await this.prisma.user.findUnique({ where: { firebaseUid: identity.uid }, include: this.include });

    if (!user) {
      // Identity is keyed ONLY by the verified Firebase UID. Users are never merged by email.
      const candidateRole = await this.prisma.role.findUniqueOrThrow({ where: { code: "CANDIDATE" } });
      user = await this.prisma.user.create({
        data: {
          firebaseUid: identity.uid,
          email: identity.email,
          emailVerified: identity.emailVerified,
          displayName: identity.name,
          lastLoginAt: new Date(),
          roles: { create: { roleId: candidateRole.id } },
          identities: identity.signInProvider ? { create: { provider: identity.signInProvider, email: identity.email } } : undefined,
        },
        include: this.include,
      }).catch(async (e: unknown) => {
        // Two first requests raced: the unique firebase_uid constraint won, so load the row that exists.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          return this.prisma.user.findUniqueOrThrow({ where: { firebaseUid: identity.uid }, include: this.include });
        }
        throw e;
      });
      this.logger.log(`Signed-in user ${user.id} provisioned with CANDIDATE role`);
    } else {
      if (user.status === "DISABLED") throw new AppError("ACCOUNT_DISABLED", "This account is disabled.", HttpStatus.FORBIDDEN);
      const stale = !user.lastLoginAt || Date.now() - user.lastLoginAt.getTime() > LAST_LOGIN_WRITE_INTERVAL_MS;
      // Keep the stored email when the provider reports none (e.g. phone sign-in).
      const emailChanged = !!identity.email && (user.email !== identity.email || user.emailVerified !== identity.emailVerified);
      // Approved profile sync: email + verification, and the display name only if none is stored yet
      // (staff-edited names are kept).
      const nameMissing = !user.displayName && !!identity.name;
      if (stale || emailChanged || nameMissing) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            lastLoginAt: new Date(),
            ...(emailChanged ? { email: identity.email, emailVerified: identity.emailVerified } : {}),
            ...(nameMissing ? { displayName: identity.name } : {}),
          },
          include: this.include,
        });
      }
      if (identity.signInProvider && !user.identities.some((i) => i.provider === identity.signInProvider)) {
        await this.prisma.authIdentity.upsert({
          where: { userId_provider: { userId: user.id, provider: identity.signInProvider } },
          create: { userId: user.id, provider: identity.signInProvider, email: identity.email },
          update: { email: identity.email },
        });
      }
    }

    let candidateId = user.candidate?.id ?? null;
    const roles = user.roles.map((r) => r.role.code);
    if (!candidateId && roles.includes("CANDIDATE")) candidateId = await this.tryLinkCandidate(user.id, identity);

    return {
      id: user.id,
      firebaseUid: user.firebaseUid,
      email: identity.email ?? user.email,
      displayName: user.displayName,
      providers: [...new Set([...user.identities.map((i) => i.provider), ...(identity.signInProvider ? [identity.signInProvider] : [])])],
      roles,
      permissions: new Set(user.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.code as PermissionCode))),
      candidateId,
    };
  }

  /**
   * Links a candidate login to the matching application record — only when ALL hold:
   *  - Firebase reports a VERIFIED email;
   *  - exactly one unlinked candidate has that email;
   *  - that candidate holds an open interview invitation issued by HR.
   * Otherwise nothing is linked and HR links the account manually (e.g. the Google account uses a different email than the application).
   */
  private async tryLinkCandidate(userId: string, identity: VerifiedIdentity): Promise<string | null> {
    if (!this.config.get("AUTO_LINK_CANDIDATE_BY_VERIFIED_EMAIL", { infer: true }) || !identity.email || !identity.emailVerified) return null;
    const matches = await this.prisma.candidate.findMany({
      where: {
        userId: null,
        email: { equals: identity.email, mode: "insensitive" },
        interviews: { some: { status: { in: ["PENDING", "IN_PROGRESS", "INTERRUPTED"] }, expiresAt: { gt: new Date() } } },
      },
      select: { id: true },
      take: 2,
    });
    if (matches.length !== 1) return null;
    const res = await this.prisma.candidate.updateMany({ where: { id: matches[0]!.id, userId: null }, data: { userId } });
    return res.count === 1 ? matches[0]!.id : null;
  }

  private readonly include = {
    candidate: { select: { id: true } },
    identities: { select: { provider: true } },
    roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
  } as const;
}
