import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import type { EnvironmentVariables } from "../../src/config/env.validation";
import { PERMISSIONS } from "../../src/common/constants/permissions";
import type { AuthService } from "../../src/modules/auth/auth.service";
import type { TokenVerifier } from "../../src/integrations/firebase/token-verifier";
import type { AdminAuthService } from "../../src/modules/auth/admin-auth.service";
import { AuthGuard } from "../../src/modules/auth/auth.guard";
import { ApiUsageController } from "../../src/modules/assessment/api-usage.controller";
import { ApiUsageService } from "../../src/modules/assessment/api-usage.service";
import { ProviderMetadataService } from "../../src/modules/assessment/provider-metadata.service";

describe("API usage HTTP authentication and permissions (no database)", () => {
  let app: INestApplication;
  const permissions = new Set<string>();
  const overview = jest.fn().mockResolvedValue({ timezone: "UTC" }), history = jest.fn().mockResolvedValue([]), get = jest.fn().mockResolvedValue({ status: "unavailable" });
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [ApiUsageController], providers: [{ provide: ApiUsageService, useValue: { overview, history } }, { provide: ProviderMetadataService, useValue: { get } }] }).compile();
    app = module.createNestApplication({ logger: false });
    const verifier = { configured: true, verify: jest.fn().mockResolvedValue({ ok: true, identity: { uid: "fictional", email: "fictional@example.test", emailVerified: true, signInProvider: "google.com" } }) };
    const auth = { resolve: jest.fn().mockResolvedValue({ permissions, roles: ["CANDIDATE"] }) };
    app.useGlobalGuards(new AuthGuard(new Reflector(), verifier as unknown as TokenVerifier, auth as unknown as AuthService, new ConfigService<EnvironmentVariables, true>({ AUTH_MODE: "firebase", AUTH_ALLOWED_PROVIDERS: "google.com,password" }), { authenticate: async (req: { headers: { cookie?: string } }) => req.headers.cookie === "fictional-admin-session=valid" ? { roles: ["SUPER_ADMIN"], permissions } : null } as unknown as AdminAuthService));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => { permissions.clear(); jest.clearAllMocks(); });
  it.each(["overview", "history", "provider"])("rejects anonymous and non-admin access to %s before reading billing data", async endpoint => {
    await request(app.getHttpServer()).get(`/api-usage/${endpoint}`).expect(401);
    await request(app.getHttpServer()).get(`/api-usage/${endpoint}`).set("Authorization", "Bearer fictional").expect(403);
    expect(overview).not.toHaveBeenCalled(); expect(history).not.toHaveBeenCalled(); expect(get).not.toHaveBeenCalled();
  });
  it.each(["overview", "history", "provider"])("allows admin session with users:manage permission for %s", async endpoint => {
    permissions.add(PERMISSIONS.USERS_MANAGE);
    await request(app.getHttpServer()).get(`/api-usage/${endpoint}`).set("Cookie", "fictional-admin-session=valid").expect(200);
  });
  it("rejects oversized pagination and unsupported filters", async () => {
    permissions.add(PERMISSIONS.USERS_MANAGE);
    await request(app.getHttpServer()).get("/api-usage/history?limit=1000&status=anything").set("Cookie", "fictional-admin-session=valid").expect(400);
    expect(history).not.toHaveBeenCalled();
  });
});
