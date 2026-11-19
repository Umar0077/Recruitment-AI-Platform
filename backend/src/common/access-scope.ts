import { Global, Injectable, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "@prisma/client";
import type { AuthUser } from "./auth-user";
import type { EnvironmentVariables } from "../config/env.validation";

/**
 * Row-level visibility for staff. With RECRUITER_SCOPE=assigned, a recruiter (who is not also a
 * manager/admin) only sees applications assigned to them. Other staff roles see all applications.
 */
@Injectable()
export class AccessScope {
  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {}

  applicationWhere(user: AuthUser): Prisma.ApplicationWhereInput {
    const limited =
      this.config.get("RECRUITER_SCOPE", { infer: true }) === "assigned" &&
      user.roles.includes("RECRUITER") &&
      !user.roles.some((r) => r === "SUPER_ADMIN" || r === "HR_MANAGER");
    return limited ? { assignedRecruiterId: user.id } : {};
  }
}

@Global()
@Module({ providers: [AccessScope], exports: [AccessScope] })
export class AccessScopeModule {}
