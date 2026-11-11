import { Controller, Get, Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Ctx, type RequestContext } from "../../common/http";
import { isStaff } from "../../common/auth-user";
import type { EnvironmentVariables } from "../../config/env.validation";
import { FirebaseTokenVerifier, TestTokenVerifier, TokenVerifier } from "../../integrations/firebase/token-verifier";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";

@ApiTags("auth")
@ApiBearerAuth()
@Controller("auth")
class AuthController {
  /** The signed-in user as the backend sees them: roles and permissions come from the database. */
  @Get("me")
  me(@Ctx() { user }: RequestContext) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      roles: user.roles,
      permissions: [...user.permissions].sort(),
      candidateId: user.candidateId,
      isStaff: isStaff(user),
      providers: user.providers,
    };
  }
}

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    {
      provide: TokenVerifier,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) =>
        config.get("AUTH_MODE", { infer: true }) === "test" ? new TestTokenVerifier(config) : new FirebaseTokenVerifier(config),
    },
    AuthGuard,
  ],
  exports: [AuthService, TokenVerifier, AuthGuard],
})
export class AuthModule {}
