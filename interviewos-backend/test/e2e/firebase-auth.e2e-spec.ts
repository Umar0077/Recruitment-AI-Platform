/**
 * Real Firebase ID tokens from the Firebase Auth Emulator, verified by the Firebase Admin SDK
 * (AUTH_MODE=firebase — no test-token shortcut). Google sign-in is simulated by the emulator's IdP
 * endpoint, so no real Google accounts are involved. InterviewOS accepts Google sign-in only.
 *
 * Start the emulator first:  cd ../interviewos-infrastructure/firebase && npm run emulator
 * The suite is skipped (not failed) when the emulator is not running.
 *
 * Note: emulator tokens are unsigned, and the Admin SDK skips signature checks in emulator mode.
 * Signature verification is covered by Firebase Admin itself against a real project.
 */
import { execFileSync } from "node:child_process";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";

const HOST = "127.0.0.1:9099";
const PROJECT = "demo-interviewos";
const BASE = `http://${HOST}`;

function emulatorUp(): boolean {
  try {
    execFileSync(process.execPath, ["-e", `fetch("${BASE}/").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))`], { timeout: 5000, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const UP = emulatorUp();
if (!UP) console.warn(`Firebase Auth Emulator not reachable at ${HOST} — skipping Firebase auth e2e tests.`);
const suite = UP ? describe : describe.skip;

// Must be set before the app (and firebase-admin) is loaded.
Object.assign(process.env, { AUTH_MODE: "firebase", FIREBASE_PROJECT_ID: PROJECT, FIREBASE_AUTH_EMULATOR_HOST: HOST, FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "" });

async function idp(provider: "google.com" | "apple.com", sub: string, email: string, name?: string) {
  const claims = JSON.stringify({ sub, email, email_verified: true, ...(name ? { name } : {}) });
  const res = await fetch(`${BASE}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=fake-api-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestUri: "http://localhost", returnSecureToken: true, postBody: `id_token=${encodeURIComponent(claims)}&providerId=${provider}` }),
  });
  const body = (await res.json()) as { idToken: string; localId: string; error?: unknown };
  if (!res.ok) throw new Error(`emulator sign-in failed: ${JSON.stringify(body.error)}`);
  return { token: body.idToken, uid: body.localId };
}

async function adminUpdate(localId: string, patch: Record<string, unknown>) {
  const res = await fetch(`${BASE}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
    body: JSON.stringify({ localId, ...patch }),
  });
  if (!res.ok) throw new Error(`emulator update failed: ${await res.text()}`);
}

/** Re-encodes an (unsigned) emulator token with modified claims. */
function withClaims(token: string, patch: Record<string, unknown>) {
  const [h, p, s] = token.split(".");
  const payload = { ...JSON.parse(Buffer.from(p!, "base64url").toString()), ...patch };
  return `${h}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${s ?? ""}`;
}

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

suite("Firebase Authentication (emulator, Admin SDK verification)", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let prisma: import("../../src/database/prisma.service").PrismaService;

  beforeAll(async () => {
    await fetch(`${BASE}/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
    const { Test } = await import("@nestjs/testing");
    const { AppModule } = await import("../../src/app.module");
    const { configureApp } = await import("../../src/bootstrap");
    const { PrismaService } = await import("../../src/database/prisma.service");
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication({ bufferLogs: true });
    configureApp(app as never);
    await app.init();
    prisma = app.get(PrismaService);
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  it("Google sign-in creates one CANDIDATE user and syncs profile fields", async () => {
    const g = await idp("google.com", "g-sub-1", "fb.google@example.test", "Gina Google");
    const me = await http.get("/api/v1/auth/me").set(bearer(g.token)).expect(200);
    expect(me.body.data).toMatchObject({ roles: ["CANDIDATE"], permissions: ["interviews:take"], email: "fb.google@example.test", displayName: "Gina Google", isStaff: false, candidateId: null });
    expect(me.body.data.providers).toContain("google.com");

    const again = await idp("google.com", "g-sub-1", "fb.google@example.test");
    const me2 = await http.get("/api/v1/auth/me").set(bearer(again.token)).expect(200);
    expect(me2.body.data.id).toBe(me.body.data.id);
    expect(await prisma.user.count({ where: { firebaseUid: g.uid } })).toBe(1);
  });

  it("a valid Firebase token from another provider (apple.com) is refused and creates no user", async () => {
    const a = await idp("apple.com", "apple-sub-1", "someone@privaterelay.appleid.com");
    expect((await http.get("/api/v1/auth/me").set(bearer(a.token)).expect(403)).body.error.code).toBe("SIGN_IN_METHOD_NOT_ALLOWED");
    expect(await prisma.user.count({ where: { firebaseUid: a.uid } })).toBe(0);
  });

  it("rejects missing, malformed, expired and wrong-project tokens with 401", async () => {
    await http.get("/api/v1/auth/me").expect(401);
    await http.get("/api/v1/auth/me").set(bearer("not.a.jwt")).expect(401);
    await http.get("/api/v1/auth/me").set(bearer("test:dev-super-admin")).expect(401); // test tokens are refused in firebase mode
    const g = await idp("google.com", "g-sub-exp", "fb.exp@example.test");
    const now = Math.floor(Date.now() / 1000);
    const expired = await http.get("/api/v1/auth/me").set(bearer(withClaims(g.token, { iat: now - 7200, exp: now - 3600 }))).expect(401);
    expect(expired.body.error.details).toMatchObject({ reason: "expired" });
    const otherProject = await http.get("/api/v1/auth/me").set(bearer(withClaims(g.token, { aud: "some-other-project", iss: "https://securetoken.google.com/some-other-project" }))).expect(401);
    expect(otherProject.body.error.details).toMatchObject({ reason: "invalid" });
  });

  it("a user disabled in Firebase gets 403 ACCOUNT_DISABLED", async () => {
    const g = await idp("google.com", "g-sub-dis", "fb.disabled@example.test");
    await http.get("/api/v1/auth/me").set(bearer(g.token)).expect(200);
    await adminUpdate(g.uid, { disableUser: true });
    expect((await http.get("/api/v1/auth/me").set(bearer(g.token)).expect(403)).body.error.code).toBe("ACCOUNT_DISABLED");
  });

  it("revoked sessions (sign out everywhere) are rejected", async () => {
    const g = await idp("google.com", "g-sub-rev", "fb.revoked@example.test");
    await http.get("/api/v1/auth/me").set(bearer(g.token)).expect(200);
    await adminUpdate(g.uid, { validSince: String(Math.floor(Date.now() / 1000) + 5) });
    const res = await http.get("/api/v1/auth/me").set(bearer(g.token)).expect(401);
    expect(res.body.error.details).toMatchObject({ reason: "revoked" });
  });

  it("signing in never grants staff access, even with an admin-looking email", async () => {
    const g = await idp("google.com", "g-sub-adm", "admin@bali-tech.example");
    await http.get("/api/v1/auth/me").set(bearer(g.token)).expect(200);
    await http.get("/api/v1/candidates").set(bearer(g.token)).expect(403);
    await http.get("/api/v1/users").set(bearer(g.token)).expect(403);
  });

  it("only the invited candidate's verified login gets their interview", async () => {
    // A staff member: signs in, then an administrator grants a role (simulates `npm run admin:grant`).
    const staff = await idp("google.com", "g-sub-hr", "fb.recruiter@example.test");
    await http.get("/api/v1/auth/me").set(bearer(staff.token)).expect(200);
    const recruiterRole = await prisma.role.findUniqueOrThrow({ where: { code: "RECRUITER" } });
    const staffUser = await prisma.user.findUniqueOrThrow({ where: { firebaseUid: staff.uid } });
    await prisma.userRole.deleteMany({ where: { userId: staffUser.id } });
    await prisma.userRole.create({ data: { userId: staffUser.id, roleId: recruiterRole.id } });
    expect((await http.get("/api/v1/auth/me").set(bearer(staff.token)).expect(200)).body.data.isStaff).toBe(true);

    const roles = await http.get("/api/v1/job-roles").set(bearer(staff.token)).expect(200);
    const jobRoleId = roles.body.data.find((r: { code: string }) => r.code === "FE-CLOSER").id;
    const c = await http.post("/api/v1/candidates").set(bearer(staff.token)).send({ fullName: "Invited Person", email: "invited.person@example.test", category: "EXPERIENCED_FE_CLOSER", jobRoleId }).expect(201);
    const iv = await http.post("/api/v1/interviews").set(bearer(staff.token)).send({ applicationId: c.body.data.applications[0].id }).expect(201);
    const interviewId = iv.body.data.interviewId;

    const stranger = await idp("google.com", "g-sub-stranger", "someone.else@example.test");
    await http.get(`/api/v1/interviews/${interviewId}`).set(bearer(stranger.token)).expect(404);
    await http.post(`/api/v1/interviews/${interviewId}/start`).set(bearer(stranger.token)).expect(404);

    const invited = await idp("google.com", "g-sub-invited", "invited.person@example.test");
    const me = await http.get("/api/v1/auth/me").set(bearer(invited.token)).expect(200);
    expect(me.body.data.candidateId).toBe(c.body.data.id);
    const started = await http.post(`/api/v1/interviews/${interviewId}/start`).set(bearer(invited.token)).send({ consent: true }).expect(200);
    expect(started.body.data).toMatchObject({ status: "IN_PROGRESS", questionSetVersion: expect.stringMatching(/^HR-FE-V\d+$/), nextQuestion: { code: "FE-001" } });

    // The recruiter (staff) still cannot answer on the candidate's behalf.
    await http.put(`/api/v1/interviews/${interviewId}/answers/FE-001`).set(bearer(staff.token)).send({ transcript: "x", source: "TYPED_FALLBACK", responseDurationSec: 5 }).expect(403);
  });
});
