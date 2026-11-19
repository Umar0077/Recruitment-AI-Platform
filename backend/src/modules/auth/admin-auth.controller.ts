import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import type { Response } from "express";
import type { RoleCode } from "@prisma/client";
import { Public } from "../../common/decorators";
import { AdminAuthService, type AdminRequest } from "./admin-auth.service";
class LoginDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(1) @MaxLength(128) password!: string;
}
class ChangeDto {
  @IsString() @MinLength(1) @MaxLength(128) currentPassword!: string;
  @IsString() @MinLength(14) @MaxLength(128) newPassword!: string;
}
class CreateDto extends LoginDto {
  @IsString() @MinLength(2) @MaxLength(120) fullName!: string;
  @IsIn(["HR_MANAGER", "RECRUITER", "REVIEWER"]) role!: RoleCode;
}
class ManageDto {
  @IsOptional() @IsIn(["HR_MANAGER", "RECRUITER", "REVIEWER"]) role?: RoleCode;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsBoolean() revoke?: boolean;
}
@Controller("admin-auth")
export class AdminAuthController {
  constructor(private readonly service: AdminAuthService) {}
  @Public() @Post("login") @HttpCode(200) @Throttle({ default: { limit: 10, ttl: 60000 } })
  login(@Body() dto: LoginDto, @Req() req: AdminRequest, @Res({ passthrough: true }) res: Response) { return this.service.login(dto.email, dto.password, req, res); }
  @Get("me") me(@Req() req: AdminRequest, @Res({ passthrough: true }) res: Response) {
    res.setHeader("Cache-Control", "no-store"); const u = req.user!;
    return { id: u.id, email: u.email, displayName: u.displayName, roles: u.roles, permissions: [...u.permissions], providers: u.providers, candidateId: null, isStaff: true, mustChangePassword: req.mustChangePassword };
  }
  @Post("logout") @HttpCode(200) logout(@Req() req: AdminRequest, @Res({ passthrough: true }) res: Response) { return this.service.logout(req, res); }
  @Post("revoke-sessions") @HttpCode(200) revoke(@Req() req: AdminRequest, @Res({ passthrough: true }) res: Response) { return this.service.logout(req, res, true); }
  @Post("change-password") @HttpCode(200) @Throttle({ default: { limit: 5, ttl: 60000 } })
  change(@Body() dto: ChangeDto, @Req() req: AdminRequest, @Res({ passthrough: true }) res: Response) { return this.service.changePassword(req, res, dto.currentPassword, dto.newPassword); }
  @Get("accounts") list(@Req() req: AdminRequest) { return this.service.list(req); }
  @Post("accounts") create(@Body() dto: CreateDto, @Req() req: AdminRequest) { return this.service.create(req, dto.email, dto.fullName, dto.password, dto.role); }
  @Patch("accounts/:id") manage(@Param("id", ParseUUIDPipe) id: string, @Body() dto: ManageDto, @Req() req: AdminRequest) { return this.service.manage(req, id, dto); }
  @Get("audit") history(@Req() req: AdminRequest) { return this.service.history(req); }
}
