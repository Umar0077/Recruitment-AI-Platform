// @vitest-environment node
// Opt-in, isolated demo project only. Uses real Firebase SDKs; never imports Prisma/AppModule.
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteApp, initializeApp } from "firebase/app";
import { applyActionCode, confirmPasswordReset, connectAuthEmulator, createUserWithEmailAndPassword, GoogleAuthProvider, inMemoryPersistence, initializeAuth, sendEmailVerification, sendPasswordResetEmail, signInWithCredential, signInWithEmailAndPassword, signOut, updateProfile } from "firebase/auth";

const requireBackend = createRequire(new URL("../../../backend/package.json", import.meta.url));
const suite = process.env.AUTH_EMULATOR_TESTS === "1" ? describe : describe.skip;
const PROJECT = "demo-interviewos-auth-tests", HOST = "127.0.0.1:9199";
suite("real Firebase SDKs against isolated Auth Emulator", () => {
  let app, auth, admin, verifier, guard, ConfigService, FirebaseTokenVerifier;
  const savedHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const users = new Set();
  let passwordUser, passwordToken;
  const email = `fictional-${Date.now()}@example.test`, password = "Fictional-only-password-42!";
  beforeAll(async () => {
    process.env.FIREBASE_AUTH_EMULATOR_HOST = HOST;
    ({ ConfigService } = requireBackend("@nestjs/config"));
    ({ FirebaseTokenVerifier } = requireBackend("./dist/integrations/firebase/token-verifier"));
    const { AuthGuard } = requireBackend("./dist/modules/auth/auth.guard");
    const { Reflector } = requireBackend("@nestjs/core");
    const config = new ConfigService({ NODE_ENV: "test", AUTH_MODE: "firebase", AUTH_ALLOWED_PROVIDERS: "google.com,password", FIREBASE_PROJECT_ID: PROJECT, FIREBASE_AUTH_EMULATOR_HOST: HOST, GOOGLE_APPLICATION_CREDENTIALS: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "" });
    verifier = new FirebaseTokenVerifier(config);
    const adminApp = requireBackend("firebase-admin/app").getApps().find(a => a.name === `interviewos:${PROJECT}:emulator`);
    admin = requireBackend("firebase-admin/auth").getAuth(adminApp);
    // Persistence is a fixture, so login verification cannot write PostgreSQL.
    guard = new AuthGuard(new Reflector(), verifier, { resolve: async identity => ({ id: identity.uid, roles: ["CANDIDATE"], permissions: new Set(), candidateId: null }) }, config);
    app = initializeApp({ projectId: PROJECT, apiKey: "fake-api-key", authDomain: "localhost" }, "auth-smoke");
    auth = initializeAuth(app, { persistence: inMemoryPersistence });
    connectAuthEmulator(auth, `http://${HOST}`, { disableWarnings: true });
    const result = await createUserWithEmailAndPassword(auth, email, password); passwordUser = result.user; users.add(passwordUser.uid);
  }, 30000);
  afterAll(async () => {
    if (admin) await Promise.allSettled([...users].map(uid => admin.deleteUser(uid)));
    if (auth) await signOut(auth);
    if (app) await deleteApp(app);
    const sdk = requireBackend("firebase-admin/app");
    await Promise.allSettled(sdk.getApps().filter(a => a.name === `interviewos:${PROJECT}:emulator`).map(a => sdk.deleteApp(a)));
    if (savedHost === undefined) delete process.env.FIREBASE_AUTH_EMULATOR_HOST; else process.env.FIREBASE_AUTH_EMULATOR_HOST = savedHost;
  });
  function context(token) {
    return { getHandler: () => context, getClass: () => class Fixture {}, switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: `Bearer ${token}` } }) }) };
  }
  async function oobCode(type) {
    const response = await fetch(`http://${HOST}/emulator/v1/projects/${PROJECT}/oobCodes`);
    const data = await response.json();
    return data.oobCodes.filter(c => c.email === email && c.requestType === type).at(-1).oobCode;
  }
  it("saves the submitted full name in Firebase before verification", async () => {
    await updateProfile(passwordUser, { displayName: "Fictional Signup Person" }); await passwordUser.reload();
    expect(passwordUser.displayName).toBe("Fictional Signup Person");
  });
  it("rejects incorrect credentials in the real Firebase password SDK", async () => {
    await signOut(auth);
    await expect(signInWithEmailAndPassword(auth, email, "incorrect-fictional-password")).rejects.toHaveProperty("code");
    expect(auth.currentUser).toBeNull();
  });
  it("authenticates password identity but backend blocks an unverified email", async () => {
    const result = await signInWithEmailAndPassword(auth, email, password); passwordUser = result.user;
    passwordToken = await passwordUser.getIdToken(true);
    const verified = await verifier.verify(passwordToken);
    expect(verified).toMatchObject({ ok: true, identity: { signInProvider: "password", emailVerified: false } });
    await expect(guard.canActivate(context(passwordToken))).rejects.toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
  });
  it("completes email verification and refreshes a token accepted by the backend guard", async () => {
    await sendEmailVerification(passwordUser); await applyActionCode(auth, await oobCode("VERIFY_EMAIL"));
    await passwordUser.reload(); passwordToken = await passwordUser.getIdToken(true);
    expect((await verifier.verify(passwordToken)).identity.emailVerified).toBe(true);
    await signOut(auth); expect(auth.currentUser).toBeNull();
    const fresh = await signInWithEmailAndPassword(auth, email, password); passwordToken = await fresh.user.getIdToken(true);
    expect(fresh.user.displayName).toBe("Fictional Signup Person");
    expect(await guard.canActivate(context(passwordToken))).toBe(true);
  });
  it("completes a reset in the emulator and accepts only the new password", async () => {
    await sendPasswordResetEmail(auth, email);
    await confirmPasswordReset(auth, await oobCode("PASSWORD_RESET"), "New-fictional-password-43!");
    await signOut(auth); expect(auth.currentUser).toBeNull();
    await expect(signInWithEmailAndPassword(auth, email, password)).rejects.toHaveProperty("code");
    const result = await signInWithEmailAndPassword(auth, email, "New-fictional-password-43!");
    expect(result.user.uid).toBe(passwordUser.uid);
  });
  it("preserves Google sign-in through the same Admin verifier and guard", async () => {
    await signOut(auth);
    const credential = GoogleAuthProvider.credential(JSON.stringify({ sub: `fictional-google-${Date.now()}`, email: "fictional-google@example.test", email_verified: true, name: "Fictional Google Person", picture: "https://lh3.googleusercontent.com/fictional" }));
    const result = await signInWithCredential(auth, credential); users.add(result.user.uid);
    const token = await result.user.getIdToken();
    expect((await verifier.verify(token)).identity).toMatchObject({ signInProvider: "google.com", name: "Fictional Google Person" });
    expect(result.user.displayName).toBe("Fictional Google Person"); expect(result.user.photoURL).toBe("https://lh3.googleusercontent.com/fictional");
    expect(await guard.canActivate(context(token))).toBe(true);
  });
  it("rejects wrong-project tokens even in explicit emulator mode", async () => {
    const parts = passwordToken.split("."); const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    claims.aud = "demo-wrong-project"; parts[1] = Buffer.from(JSON.stringify(claims)).toString("base64url");
    expect((await verifier.verify(parts.join("."))).ok).toBe(false);
  });
  it("rejects disabled Firebase users", async () => {
    await admin.updateUser(passwordUser.uid, { disabled: true });
    expect(await verifier.verify(passwordToken)).toEqual({ ok: false, reason: "disabled" });
  });
}, 15000);

