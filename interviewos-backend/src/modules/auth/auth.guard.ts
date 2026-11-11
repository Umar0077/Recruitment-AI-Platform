import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import type { EnvironmentVariables } from "../../config/env.validation";
import type { Request } from "express";
import { IS_PUBLIC, REQUIRED_PERMISSIONS } from "../../common/decorators";
import { AppError } from "../../common/errors";
import type { AuthUser } from "../../common/auth-user";
import type { PermissionCode } from "../../common/constants/permissions";
import { TokenVerifier } from "../../integrations/firebase/token-verifier";
import { AuthService } from "./auth.service";

/**
 * Global guard: every route requires a verified bearer token unless marked @Public().
 * Then checks @RequirePermissions(). Ownership checks happen in services.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: TokenVerifier,
    private readonly auth: AuthService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.allowedProviders = new Set(config.get("AUTH_ALLOWED_PROVIDERS", { infer: true }).split(",").map((p) => p.trim()).filter(Boolean));
    // Development test tokens ("test:<uid>") carry the "test" provider; AUTH_MODE=test is refused in production.
    if (config.get("AUTH_MODE", { infer: true }) === "test") this.allowedProviders.add("test");
  }
  private readonly allowedProviders: Set<string>;

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    if (!this.verifier.configured) {
      throw new AppError("AUTH_NOT_CONFIGURED", "Authentication is not configured on this server.", HttpStatus.SERVICE_UNAVAILABLE);
    }
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token || token.length > 4096) throw new AppError("UNAUTHENTICATED", "A valid sign-in is required.", HttpStatus.UNAUTHORIZED);

    const result = await this.verifier.verify(token);
    if (!result.ok) {
      if (result.reason === "disabled") throw new AppError("ACCOUNT_DISABLED", "This account is disabled.", HttpStatus.FORBIDDEN);
      const message = result.reason === "expired" ? "Your session has expired. Please sign in again." : result.reason === "revoked" ? "Your session was signed out. Please sign in again." : "A valid sign-in is required.";
      throw new AppError("UNAUTHENTICATED", message, HttpStatus.UNAUTHORIZED, { reason: result.reason });
    }

    const provider = result.identity.signInProvider ?? "";
    if (!this.allowedProviders.has(provider)) {
      // Existing records (e.g. historical apple.com identities) are kept; they just can't open new sessions.
      throw new AppError("SIGN_IN_METHOD_NOT_ALLOWED", "Please sign in with Google.", HttpStatus.FORBIDDEN);
    }

    const user = await this.auth.resolve(result.identity);
    req.user = user;

    const required = this.reflector.getAllAndOverride<PermissionCode[]>(REQUIRED_PERMISSIONS, targets) ?? [];
    if (required.some((p) => !user.permissions.has(p))) {
      throw new AppError("FORBIDDEN", "You do not have permission to perform this action.", HttpStatus.FORBIDDEN);
    }
    return true;
  }
}
