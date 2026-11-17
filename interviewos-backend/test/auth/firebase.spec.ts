import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigService } from "@nestjs/config";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { validateEnv, type EnvironmentVariables } from "../../src/config/env.validation";
import { readFirebaseServiceAccount } from "../../src/config/firebase.config";
import { FirebaseTokenVerifier, TestTokenVerifier } from "../../src/integrations/firebase/token-verifier";

jest.mock("firebase-admin/app", () => ({ cert: jest.fn(() => ({})), getApps: jest.fn(() => []), initializeApp: jest.fn((options, name) => ({ options, name })) }));
jest.mock("firebase-admin/auth", () => ({ getAuth: jest.fn() }));

const PROJECT = "test-firebase-project";
const DATABASE_URL = "postgresql://unused/unused"; // Validates a string; no DB client is imported or opened.
const token = (alg = "RS256", signature = "fictional-signature") => `${Buffer.from(JSON.stringify({ alg, kid: "fictional-key-id" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: "fictional-uid", aud: PROJECT })).toString("base64url")}.${signature}`;
let directory: string, file: string, broken: string, key: string;
const sdkVerify = jest.fn();
const savedHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;

function env(overrides: Record<string, unknown> = {}) {
  return validateEnv({ DATABASE_URL, NODE_ENV: "development", AUTH_MODE: "firebase", FIREBASE_PROJECT_ID: PROJECT, GOOGLE_APPLICATION_CREDENTIALS: file, ...overrides });
}
function verifier(overrides: Record<string, unknown> = {}) {
  return new FirebaseTokenVerifier(new ConfigService<EnvironmentVariables, true>(env(overrides)));
}

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "interviewos-auth-"));
  file = join(directory, "synthetic-account.json"); broken = join(directory, "invalid.json");
  key = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } }).privateKey;
  writeFileSync(file, JSON.stringify({ type: "service_account", project_id: PROJECT, client_email: "fictional@example.test", private_key: key }));
  writeFileSync(broken, "not JSON: PRIVATE_CONTENT_SENTINEL");
});
beforeEach(() => {
  delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
  jest.clearAllMocks(); (getApps as jest.Mock).mockReturnValue([]);
  (getAuth as jest.Mock).mockReturnValue({ verifyIdToken: sdkVerify }); sdkVerify.mockReset();
});
afterAll(() => {
  if (savedHost === undefined) delete process.env.FIREBASE_AUTH_EMULATOR_HOST; else process.env.FIREBASE_AUTH_EMULATOR_HOST = savedHost;
  unlinkSync(file); unlinkSync(broken); rmdirSync(directory);
});

describe("Firebase credential/environment validation", () => {
  it("accepts only the two supported real providers", () => {
    expect(env().AUTH_ALLOWED_PROVIDERS).toBe("google.com,password");
    expect(() => env({ AUTH_ALLOWED_PROVIDERS: "google.com,password,apple.com" })).toThrow("only google.com and/or password");
    expect(() => env({ AUTH_ALLOWED_PROVIDERS: "test" })).toThrow("only google.com and/or password");
  });
  it("accepts a matching service-account file in production", () => {
    expect(env({ NODE_ENV: "production" }).FIREBASE_PROJECT_ID).toBe(PROJECT);
    expect(readFirebaseServiceAccount(file, PROJECT).projectId).toBe(PROJECT);
  });
  it("preserves the legacy inline credential option", () => {
    expect(env({ NODE_ENV: "production", GOOGLE_APPLICATION_CREDENTIALS: "", FIREBASE_CLIENT_EMAIL: "fictional@example.test", FIREBASE_PRIVATE_KEY: key }).AUTH_MODE).toBe("firebase");
  });
  it("refuses a different project", () => expect(() => env({ FIREBASE_PROJECT_ID: "other-project" })).toThrow("project does not match"));
  it("refuses an unreadable credential file", () => expect(() => env({ GOOGLE_APPLICATION_CREDENTIALS: join(directory, "missing.json") })).toThrow("readable service-account"));
  it("does not include JSON parser details or file contents in errors", () => {
    try { env({ GOOGLE_APPLICATION_CREDENTIALS: broken }); throw new Error("expected rejection"); }
    catch (e) { expect((e as Error).message).toBe("GOOGLE_APPLICATION_CREDENTIALS must reference a readable service-account JSON file; contents withheld."); }
  });
  it("refuses competing file and inline credentials", () => expect(() => env({ FIREBASE_CLIENT_EMAIL: "fictional@example.test" })).toThrow("not both"));
  it("refuses incomplete inline credentials", () => expect(() => env({ GOOGLE_APPLICATION_CREDENTIALS: "", FIREBASE_CLIENT_EMAIL: "fictional@example.test" })).toThrow("both FIREBASE_CLIENT_EMAIL"));
  it("refuses invalid inline private keys without echoing them", () => expect(() => env({ GOOGLE_APPLICATION_CREDENTIALS: "", FIREBASE_CLIENT_EMAIL: "fictional@example.test", FIREBASE_PRIVATE_KEY: "PRIVATE_CONTENT_SENTINEL" })).toThrow("private key is invalid; credential contents withheld"));
  it("requires the explicit project binding", () => expect(() => env({ FIREBASE_PROJECT_ID: "" })).toThrow("FIREBASE_PROJECT_ID is required"));
  it("refuses missing production credentials", () => expect(() => env({ NODE_ENV: "production", GOOGLE_APPLICATION_CREDENTIALS: "" })).toThrow("Production requires"));
  it("refuses test-token mode in production", () => expect(() => env({ NODE_ENV: "production", AUTH_MODE: "test" })).toThrow("not allowed in production"));
  it("refuses emulator mode in production, even with valid credentials", () => expect(() => env({ NODE_ENV: "production", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099" })).toThrow("forbidden in production"));
  it("refuses a real project with the emulator flag even in development", () => expect(() => env({ FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099" })).toThrow("real projects cannot use emulator"));
  it("preserves explicit demo-project emulator configuration", () => expect(env({ FIREBASE_PROJECT_ID: "demo-interviewos", GOOGLE_APPLICATION_CREDENTIALS: "", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099" }).FIREBASE_PROJECT_ID).toBe("demo-interviewos"));
  it("rejects mixing emulator and real credential material", () => expect(() => env({ FIREBASE_PROJECT_ID: "demo-interviewos", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099" })).toThrow("Remove real Firebase credentials"));
  it("rejects emulator URLs instead of host:port", () => expect(() => env({ GOOGLE_APPLICATION_CREDENTIALS: "", FIREBASE_PROJECT_ID: "demo-interviewos", FIREBASE_AUTH_EMULATOR_HOST: "http://127.0.0.1:9099" })).toThrow("host:port"));
  it("rejects whitespace emulator flags that the SDK would treat as enabled", () => expect(() => env({ FIREBASE_AUTH_EMULATOR_HOST: " " })).toThrow("whitespace"));
});

describe("Firebase verifier security boundary", () => {
  it("initializes the intended project using a separate real-mode app name", () => {
    expect(verifier().configured).toBe(true);
    expect((initializeApp as jest.Mock).mock.calls[0][0].projectId).toBe(PROJECT);
    expect((initializeApp as jest.Mock).mock.calls[0][1]).toBe(`interviewos:${PROJECT}:real`);
  });
  it("cannot reuse the old generic emulator app", () => {
    (getApps as jest.Mock).mockReturnValue([{ name: "interviewos", options: { projectId: "demo-interviewos" } }]);
    verifier(); expect(initializeApp).toHaveBeenCalledTimes(1);
  });
  it("rejects inherited emulator state absent from validated config", () => {
    process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
    expect(() => verifier({ FIREBASE_AUTH_EMULATOR_HOST: "" })).toThrow("differs from validated configuration");
  });
  it("rejects emulator state injected after initialization", async () => {
    const v = verifier(); process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
    expect((await v.verify(token())).ok).toBe(false); expect(sdkVerify).not.toHaveBeenCalled();
  });
  it("rejects whitespace emulator state injected after initialization", async () => {
    const v = verifier(); process.env.FIREBASE_AUTH_EMULATOR_HOST = " ";
    expect((await v.verify(token())).ok).toBe(false); expect(sdkVerify).not.toHaveBeenCalled();
  });
  it.each(["test:fictional", "broken", token("none", ""), token("HS256"), token("RS256", "")])("rejects unsupported or unsigned token format without calling Admin", async t => {
    expect((await verifier().verify(t)).ok).toBe(false); expect(sdkVerify).not.toHaveBeenCalled();
  });
  it("always checks revocation/disabled state and returns SDK-verified identity", async () => {
    sdkVerify.mockResolvedValue({ uid: "verified-uid", email_verified: true, firebase: { sign_in_provider: "google.com" } });
    const result = await verifier().verify(token());
    expect(result.ok && result.identity.uid).toBe("verified-uid");
    expect(sdkVerify.mock.calls[0][1]).toBe(true);
  });
  it.each([["auth/id-token-expired", "expired"], ["auth/id-token-revoked", "revoked"], ["auth/user-disabled", "disabled"], ["auth/argument-error", "invalid"], ["auth/invalid-id-token", "invalid"]])("maps SDK rejection %s safely", async (code, reason) => {
    sdkVerify.mockRejectedValue({ code }); expect(await verifier().verify(token())).toEqual({ ok: false, reason });
  });
  it("keeps emulator verification available only for an explicitly configured demo project", async () => {
    process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
    sdkVerify.mockResolvedValue({ uid: "fictional-emulator-user", firebase: { sign_in_provider: "google.com" } });
    const v = verifier({ FIREBASE_PROJECT_ID: "demo-interviewos", GOOGLE_APPLICATION_CREDENTIALS: "", FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST });
    expect((await v.verify(token("none", ""))).ok).toBe(true);
    process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9098";
    expect((await v.verify(token("none", ""))).ok).toBe(false);
  });
  it("test verifier rejects tokens in production", async () => {
    const v = new TestTokenVerifier(new ConfigService<EnvironmentVariables, true>({ NODE_ENV: "production" }));
    expect((await v.verify("test:fictional")).ok).toBe(false);
  });
});
