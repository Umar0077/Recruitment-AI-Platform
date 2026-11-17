import "reflect-metadata";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import type { EnvironmentVariables } from "../../src/config/env.validation";
import type { AuthUser } from "../../src/common/auth-user";
import { IS_PUBLIC, REQUIRED_PERMISSIONS } from "../../src/common/decorators";
import { PERMISSIONS } from "../../src/common/constants/permissions";
import { AuthGuard } from "../../src/modules/auth/auth.guard";
import type { AuthService } from "../../src/modules/auth/auth.service";
import type { TokenVerifier } from "../../src/integrations/firebase/token-verifier";

describe("authentication/authorization guard (no database)", () => {
  const verify = jest.fn(), resolve = jest.fn();
  const verifier = { configured: true, verify };
  const config = new ConfigService<EnvironmentVariables, true>({ AUTH_MODE: "firebase", AUTH_ALLOWED_PROVIDERS: "google.com,password" });
  const guard = new AuthGuard(new Reflector(), verifier as TokenVerifier, { resolve } as unknown as AuthService, config);
  let user: AuthUser;
  const identity = { uid: "fictional-google-uid", email: "invited@example.test", emailVerified: true, name: null, signInProvider: "google.com" };
  function context(header = "Bearer fictional", permissions?: string[], publicRoute = false) {
    const handler = () => undefined;
    class TestController {}
    if (permissions) Reflect.defineMetadata(REQUIRED_PERMISSIONS, permissions, handler);
    if (publicRoute) Reflect.defineMetadata(IS_PUBLIC, true, handler);
    const request: { headers: { authorization: string }; user?: AuthUser } = { headers: { authorization: header } };
    return { request, ctx: { getHandler: () => handler, getClass: () => TestController, switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext };
  }
  beforeEach(() => {
    verifier.configured = true; verify.mockReset(); resolve.mockReset();
    user = { id: "fictional-app-user", firebaseUid: identity.uid, email: null, displayName: null, providers: ["google.com"], roles: ["CANDIDATE"], permissions: new Set(), candidateId: null };
    verify.mockResolvedValue({ ok: true, identity }); resolve.mockResolvedValue(user);
  });
  it.each(["google.com", "password"])("accepts verified %s identity with unchanged application permissions", async signInProvider => {
    verify.mockResolvedValue({ ok: true, identity: { ...identity, signInProvider } });
    const c = context(); expect(await guard.canActivate(c.ctx)).toBe(true);
    expect(c.request.user?.roles).toEqual(["CANDIDATE"]); expect(c.request.user?.permissions.size).toBe(0);
  });
  it("rejects missing bearer credentials without user resolution", async () => {
    await expect(guard.canActivate(context("").ctx)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(resolve).not.toHaveBeenCalled();
  });
  it.each(["invalid", "expired", "revoked"])("rejects %s tokens before user resolution", async reason => {
    verify.mockResolvedValue({ ok: false, reason });
    await expect(guard.canActivate(context().ctx)).rejects.toMatchObject({ code: "UNAUTHENTICATED", details: { reason } });
    expect(resolve).not.toHaveBeenCalled();
  });
  it("rejects disabled accounts", async () => {
    verify.mockResolvedValue({ ok: false, reason: "disabled" });
    await expect(guard.canActivate(context().ctx)).rejects.toMatchObject({ code: "ACCOUNT_DISABLED" });
    expect(resolve).not.toHaveBeenCalled();
  });
  it.each(["apple.com", "custom", "anonymous", "test", null])("rejects unsupported provider %s without provisioning", async signInProvider => {
    verify.mockResolvedValue({ ok: true, identity: { ...identity, signInProvider } });
    await expect(guard.canActivate(context().ctx)).rejects.toMatchObject({ code: "SIGN_IN_METHOD_NOT_ALLOWED" });
    expect(resolve).not.toHaveBeenCalled();
  });
  it.each(["google.com", "password"])("rejects unverified %s email before provisioning", async signInProvider => {
    verify.mockResolvedValue({ ok: true, identity: { ...identity, signInProvider, emailVerified: false } });
    await expect(guard.canActivate(context().ctx)).rejects.toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
    expect(resolve).not.toHaveBeenCalled();
  });
  it("refuses a missing email even when the verified flag is set", async () => {
    verify.mockResolvedValue({ ok: true, identity: { ...identity, email: null } });
    await expect(guard.canActivate(context().ctx)).rejects.toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
    expect(resolve).not.toHaveBeenCalled();
  });
  it.each(["google.com", "password"])("does not grant admin permission merely for %s sign-in", async signInProvider => {
    verify.mockResolvedValue({ ok: true, identity: { ...identity, signInProvider } });
    await expect(guard.canActivate(context("Bearer fictional", [PERMISSIONS.USERS_MANAGE]).ctx)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("strips staff permissions from a Firebase candidate identity", async () => {
    user.permissions.add(PERMISSIONS.USERS_MANAGE);
    await expect(guard.canActivate(context("Bearer fictional", [PERMISSIONS.USERS_MANAGE]).ctx)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("fails closed when Firebase is unconfigured", async () => {
    verifier.configured = false;
    await expect(guard.canActivate(context().ctx)).rejects.toMatchObject({ code: "AUTH_NOT_CONFIGURED" });
    expect(resolve).not.toHaveBeenCalled();
  });
  it("preserves public routes without touching auth or persistence", async () => {
    verifier.configured = false; expect(await guard.canActivate(context("", undefined, true).ctx)).toBe(true);
    expect(verify).not.toHaveBeenCalled(); expect(resolve).not.toHaveBeenCalled();
  });
});
