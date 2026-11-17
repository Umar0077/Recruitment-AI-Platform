import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import type { ExecutionContext } from "@nestjs/common";
import type { Response } from "express";
import { AuthGuard } from "../../src/modules/auth/auth.guard";
import { AdminAuthService, checkPassword, type AdminRequest } from "../../src/modules/auth/admin-auth.service";
import type { PrismaService } from "../../src/database/prisma.service";
import type { AuditService } from "../../src/modules/audit/audit.module";
import type { AuthService } from "../../src/modules/auth/auth.service";
import type { TokenVerifier } from "../../src/integrations/firebase/token-verifier";
import type { EnvironmentVariables } from "../../src/config/env.validation";
import { REQUIRED_PERMISSIONS } from "../../src/common/decorators";

const config = (prod = false) => new ConfigService<EnvironmentVariables, true>({ NODE_ENV: prod ? "production" : "development", FRONTEND_ORIGINS: "https://interviews.example.test", AUTH_MODE: "firebase", AUTH_ALLOWED_PROVIDERS: "google.com,password" });
describe("administrator boundary and CSRF", () => {
  const service = new AdminAuthService({} as PrismaService, {} as AuditService, config(true));
  it.each([
    { headers: {}, secure: true },
    { headers: { origin: "https://evil.example.test", "x-admin-request": "1" }, secure: true },
    { headers: { origin: "https://interviews.example.test" }, secure: true },
    { headers: { origin: "https://interviews.example.test", "x-admin-request": "1" }, secure: false },
  ])("rejects untrusted/missing origin, missing custom header and insecure production transport", req => {
    expect(() => service.checkOrigin(req as AdminRequest)).toThrow();
  });
  it("accepts exact origin with custom header over HTTPS and sets secure HttpOnly strict cookie", () => {
    expect(() => service.checkOrigin({ headers: { origin: "https://interviews.example.test", "x-admin-request": "1" }, secure: true } as unknown as AdminRequest)).not.toThrow();
    const cookie = jest.fn(); service.cookie({ cookie, setHeader: jest.fn() } as unknown as Response, "fictional");
    expect(cookie.mock.calls[0][2]).toMatchObject({ httpOnly: true, secure: true, sameSite: "strict", maxAge: 28800000 });
  });
  it.each(["123456", "alllowercasepassword!1", "NoNumberPassword!!", "NoSymbolPassword123"])("rejects weak password %s", value => expect(() => checkPassword(value)).toThrow());
  function setup(path: string, firstChange = false, authorization?: string, permissions: string[] = []) {
    const req = { path, headers: { authorization }, mustChangePassword: firstChange };
    const staff = { id: "staff", roles: ["REVIEWER"], permissions: new Set(["interviews:read"]) };
    const authenticate = jest.fn().mockResolvedValue(staff), verify = jest.fn();
    const resolve = jest.fn().mockResolvedValue({ ...staff, roles: ["SUPER_ADMIN"], providers: ["google.com"] });
    verify.mockResolvedValue({ ok: true, identity: { signInProvider: "google.com", email: "fictional@example.test", emailVerified: true } });
    const handler = () => undefined;
    Reflect.defineMetadata(REQUIRED_PERMISSIONS, permissions, handler);
    const ctx = { getHandler: () => handler, getClass: () => AuthGuard, switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
    const guard = new AuthGuard(new Reflector(), { configured: true, verify } as unknown as TokenVerifier, { resolve } as unknown as AuthService, config(), { authenticate } as unknown as AdminAuthService);
    return { guard, ctx, authenticate, verify };
  }
  it("rejects Firebase bearer on administrator auth routes", async () => {
    const t = setup("/api/v1/admin-auth/me", false, "Bearer candidate");
    await expect(t.guard.canActivate(t.ctx)).rejects.toMatchObject({ code: "UNAUTHENTICATED" }); expect(t.verify).not.toHaveBeenCalled(); expect(t.authenticate).not.toHaveBeenCalled();
  });
  it("rejects a historical Firebase identity with Super Admin role", async () => {
    const t = setup("/api/v1/users", false, "Bearer historical-staff");
    await expect(t.guard.canActivate(t.ctx)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it.each(["me", "change-password", "logout"])("permits only first-login security route %s", async route => {
    const t = setup(`/api/v1/admin-auth/${route}`, true); expect(await t.guard.canActivate(t.ctx)).toBe(true); expect(t.verify).not.toHaveBeenCalled();
  });
  it.each(["/api/v1/users", "/api/v1/admin-auth/accounts"])("blocks first-login access to %s", async path => {
    const t = setup(path, true); await expect(t.guard.canActivate(t.ctx)).rejects.toMatchObject({ code: "PASSWORD_CHANGE_REQUIRED" });
  });
  it("enforces PostgreSQL permissions for cookie sessions", async () => {
    const t = setup("/api/v1/users", false, undefined, ["users:manage"]); await expect(t.guard.canActivate(t.ctx)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
