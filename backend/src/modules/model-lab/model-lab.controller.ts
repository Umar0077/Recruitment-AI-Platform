import {
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  HttpCode,
  Injectable,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { PERMISSIONS } from "../../common/constants/permissions";
import { RequirePermissions } from "../../common/decorators";
import { forbidden } from "../../common/errors";
import type { EnvironmentVariables } from "../../config/env.validation";
import type { AdminRequest } from "../auth/admin-auth.service";
import { ModelLabService } from "./model-lab.service";
import type { UploadedImageFile } from "./model-lab.types";

@Injectable()
export class SuperAdminModelLabGuard implements CanActivate {
  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AdminRequest>();
    const user = req.user;
    if (!user || !user.providers.includes("admin-password") || !user.roles.includes("SUPER_ADMIN")) {
      throw forbidden("Model Lab access is restricted to authorized Super Administrators.");
    }
    if (req.headers["x-admin-request"] !== "1") {
      throw forbidden("The administrator request header could not be verified.");
    }
    const origin = req.headers.origin;
    if (origin) {
      const allowedOrigins = this.config
        .get("FRONTEND_ORIGINS", { infer: true })
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      if (!allowedOrigins.includes(origin)) {
        throw forbidden("The administrator request origin could not be verified.");
      }
    }
    return true;
  }
}

@ApiTags("admin-model-lab")
@Controller("admin/model-lab")
@RequirePermissions(PERMISSIONS.USERS_MANAGE)
@UseGuards(SuperAdminModelLabGuard)
export class ModelLabController {
  constructor(private readonly service: ModelLabService) {}

  @Get("health")
  health(@Res({ passthrough: true }) res: Response) {
    res.setHeader("Cache-Control", "no-store");
    return this.service.getHealth();
  }

  @Get("model-info")
  modelInfo(@Res({ passthrough: true }) res: Response) {
    res.setHeader("Cache-Control", "no-store");
    return this.service.getModelInfo();
  }

  @Get("metrics")
  metrics(@Res({ passthrough: true }) res: Response) {
    res.setHeader("Cache-Control", "no-store");
    return this.service.getMetrics();
  }

  @Post("infer/frame")
  @HttpCode(200)
  @Throttle({ default: { limit: 180, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 20_000_000, files: 1 },
    }),
  )
  inferFrame(@UploadedFile() file: UploadedImageFile | undefined, @Res({ passthrough: true }) res: Response) {
    res.setHeader("Cache-Control", "no-store");
    return this.service.inferFrame(file);
  }
}
