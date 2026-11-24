import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PERMISSIONS } from "../../src/common/constants/permissions";
import { REQUIRED_PERMISSIONS } from "../../src/common/decorators";
import type { EnvironmentVariables } from "../../src/config/env.validation";
import type { TokenVerifier } from "../../src/integrations/firebase/token-verifier";
import type { AdminAuthService, AdminRequest } from "../../src/modules/auth/admin-auth.service";
import { AuthGuard } from "../../src/modules/auth/auth.guard";
import type { AuthService } from "../../src/modules/auth/auth.service";
import { SuperAdminModelLabGuard } from "../../src/modules/model-lab/model-lab.controller";
import { ModelLabService } from "../../src/modules/model-lab/model-lab.service";
import type { UploadedImageFile } from "../../src/modules/model-lab/model-lab.types";
import { V5InferenceClient } from "../../src/modules/model-lab/v5-inference.client";

const VALID_PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]),
  Buffer.from([0x00, 0x00, 0x01, 0x40, 0x00, 0x00, 0x00, 0xf0]), // 320x240
  Buffer.from([0x08, 0x02, 0x00, 0x00, 0x00]),
]);

function makeConfig(overrides: Partial<Record<keyof EnvironmentVariables, unknown>> = {}) {
  return new ConfigService<EnvironmentVariables, true>({
    NODE_ENV: "development",
    FRONTEND_ORIGINS: "http://localhost:3000",
    AUTH_MODE: "firebase",
    AUTH_ALLOWED_PROVIDERS: "google.com,password",
    MODEL_LAB_ENABLED: true,
    V5_SERVICE_URL: "http://127.0.0.1:8765",
    V5_SERVICE_TOKEN: "test-v5-secret-token-xyz",
    V5_REQUEST_TIMEOUT_MS: 18000,
    V5_MAX_UPLOAD_BYTES: 10_000_000,
    V5_MAX_CONCURRENT_REQUESTS: 2,
    ...overrides,
  });
}

describe("Model Lab authorization, origin, and proxy resilience", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function makeAuthSetup(user: { roles: string[]; permissions: string[]; providers: string[] } | null, headers: Record<string, string>) {
    const req = {
      path: "/api/v1/admin/model-lab/health",
      method: "GET",
      headers,
      mustChangePassword: false,
    } as unknown as AdminRequest;
    const handler = () => undefined;
    Reflect.defineMetadata(REQUIRED_PERMISSIONS, [PERMISSIONS.USERS_MANAGE], handler);
    const ctx = {
      getHandler: () => handler,
      getClass: () => class Dummy {},
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    const authenticate = jest.fn().mockResolvedValue(
      user
        ? {
            id: "u1",
            firebaseUid: "",
            email: "admin@balitech.com",
            displayName: "Admin",
            providers: user.providers,
            roles: user.roles,
            permissions: new Set(user.permissions),
            candidateId: null,
          }
        : null,
    );
    const verify = jest.fn().mockResolvedValue({
      ok: true,
      identity: { uid: "cand-1", email: "cand@example.test", emailVerified: true, signInProvider: "google.com" },
    });
    const resolve = jest.fn().mockResolvedValue({
      id: "c1",
      firebaseUid: "cand-1",
      email: "cand@example.test",
      displayName: "Candidate",
      providers: ["google.com"],
      roles: ["CANDIDATE"],
      permissions: new Set(["interviews:take"]),
      candidateId: "cand-rec",
    });

    const authGuard = new AuthGuard(
      new Reflector(),
      { configured: true, verify } as unknown as TokenVerifier,
      { resolve } as unknown as AuthService,
      makeConfig(),
      { authenticate } as unknown as AdminAuthService,
    );
    const modelLabGuard = new SuperAdminModelLabGuard(makeConfig());
    return { authGuard, modelLabGuard, ctx };
  }

  it("allows authorized SUPER_ADMIN with valid admin headers and origin", async () => {
    const { authGuard, modelLabGuard, ctx } = makeAuthSetup(
      { roles: ["SUPER_ADMIN"], permissions: [PERMISSIONS.USERS_MANAGE], providers: ["admin-password"] },
      { origin: "http://localhost:3000", "x-admin-request": "1" },
    );
    expect(await authGuard.canActivate(ctx)).toBe(true);
    expect(modelLabGuard.canActivate(ctx)).toBe(true);
  });

  it("rejects unauthenticated requests, candidate tokens, non-super-admin staff, and invalid headers/origins", async () => {
    const unauth = makeAuthSetup(null, { "x-admin-request": "1" });
    await expect(unauth.authGuard.canActivate(unauth.ctx)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });

    const candidate = makeAuthSetup(null, { authorization: "Bearer firebase-cand", "x-admin-request": "1" });
    await expect(candidate.authGuard.canActivate(candidate.ctx)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const hrManager = makeAuthSetup(
      { roles: ["HR_MANAGER"], permissions: [PERMISSIONS.CANDIDATES_READ], providers: ["admin-password"] },
      { origin: "http://localhost:3000", "x-admin-request": "1" },
    );
    await expect(hrManager.authGuard.canActivate(hrManager.ctx)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const missingHeader = makeAuthSetup(
      { roles: ["SUPER_ADMIN"], permissions: [PERMISSIONS.USERS_MANAGE], providers: ["admin-password"] },
      { origin: "http://localhost:3000" },
    );
    expect(await missingHeader.authGuard.canActivate(missingHeader.ctx)).toBe(true);
    expect(() => missingHeader.modelLabGuard.canActivate(missingHeader.ctx)).toThrow();

    const evilOrigin = makeAuthSetup(
      { roles: ["SUPER_ADMIN"], permissions: [PERMISSIONS.USERS_MANAGE], providers: ["admin-password"] },
      { origin: "https://evil.example.test", "x-admin-request": "1" },
    );
    expect(await evilOrigin.authGuard.canActivate(evilOrigin.ctx)).toBe(true);
    expect(() => evilOrigin.modelLabGuard.canActivate(evilOrigin.ctx)).toThrow();
  });

  it("blocks access cleanly when MODEL_LAB_ENABLED=false", async () => {
    const service = new ModelLabService(new V5InferenceClient(makeConfig({ MODEL_LAB_ENABLED: false })));
    const health = await service.getHealth();
    expect(health.enabled).toBe(false);
    expect(health.status).toBe("disabled");
    await expect(service.getModelInfo()).rejects.toMatchObject({ code: "MODEL_LAB_DISABLED" });
  });

  it("fails safely when V5_SERVICE_TOKEN is missing or FastAPI is offline", async () => {
    const noTokenSvc = new ModelLabService(new V5InferenceClient(makeConfig({ V5_SERVICE_TOKEN: "" })));
    global.fetch = jest.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));
    const offlineHealth = await noTokenSvc.getHealth();
    expect(offlineHealth.status).toBe("offline");

    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ ready: true, status: "ready", model_version: "v5", device: "cpu", classes_count: 7, ensemble_members_loaded: 3 }), { status: 200 }),
    );
    const unconfiguredHealth = await noTokenSvc.getHealth();
    expect(unconfiguredHealth.status).toBe("unconfigured");
    await expect(noTokenSvc.getModelInfo()).rejects.toMatchObject({ code: "MODEL_SERVICE_UNAVAILABLE" });
  });

  it("handles upstream timeout, oversized uploads, and invalid image bytes", async () => {
    const service = new ModelLabService(new V5InferenceClient(makeConfig({ V5_MAX_UPLOAD_BYTES: 1024 })));

    await expect(service.inferFrame(undefined)).rejects.toMatchObject({ code: "INVALID_IMAGE_UPLOAD" });
    await expect(
      service.inferFrame({ buffer: Buffer.from("not-an-image"), mimetype: "text/plain", originalname: "bad.txt", size: 12 }),
    ).rejects.toMatchObject({ code: "INVALID_IMAGE_UPLOAD" });

    const oversized: UploadedImageFile = {
      buffer: Buffer.concat([VALID_PNG_BYTES, Buffer.alloc(2048)]),
      mimetype: "image/png",
      originalname: "huge.png",
      size: 2077,
    };
    await expect(service.inferFrame(oversized)).rejects.toMatchObject({ code: "IMAGE_TOO_LARGE" });

    const smallValidSvc = new ModelLabService(new V5InferenceClient(makeConfig()));
    global.fetch = jest.fn().mockRejectedValue(new DOMException("Timed out", "TimeoutError"));
    await expect(
      smallValidSvc.inferFrame({ buffer: VALID_PNG_BYTES, mimetype: "image/png", originalname: "ok.png", size: VALID_PNG_BYTES.length }),
    ).rejects.toMatchObject({ code: "MODEL_INFERENCE_TIMEOUT" });
  });

  it("forwards authorized frames with Bearer token server-side and returns inference output without leaking token", async () => {
    const token = "super-secret-v5-token-999";
    const service = new ModelLabService(new V5InferenceClient(makeConfig({ V5_SERVICE_TOKEN: token })));
    const payload = {
      request_id: "req-1",
      status: "OK",
      model_version: "v5",
      face_detected: true,
      face_count: 1,
      expression_label: "happy",
      confidence: 0.91,
      probabilities: { angry: 0.01, disgust: 0.01, fear: 0.01, happy: 0.91, neutral: 0.03, sad: 0.02, surprise: 0.01 },
      top_predictions: [{ label: "happy", confidence: 0.91 }, { label: "neutral", confidence: 0.03 }, { label: "sad", confidence: 0.02 }],
      face_bbox: { x: 40, y: 30, width: 120, height: 120, image_width: 320, image_height: 240, coordinate_space: "pixel_xywh_top_left" },
      processing_ms: 810.5,
      device: "cpu",
      quality_warning: null,
      uncertain: false,
      responsible_use_notice: "Demo only",
      timestamp: "2026-11-24T18:00:00Z",
    };

    const fetchMock = jest.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    global.fetch = fetchMock;

    const result = await service.inferFrame({
      buffer: VALID_PNG_BYTES,
      mimetype: "image/png",
      originalname: "frame.png",
      size: VALID_PNG_BYTES.length,
    });

    expect(result.expression_label).toBe("happy");
    expect(JSON.stringify(result)).not.toContain(token);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:8765/api/v1/infer/frame");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${token}`);
  });
});
