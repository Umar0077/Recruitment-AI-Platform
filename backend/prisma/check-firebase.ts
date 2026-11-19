/** Read-only Firebase readiness check. Never imports AppModule, Prisma, or user data. */
import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { deleteApp, getApps } from "firebase-admin/app";
import { validateEnv, type EnvironmentVariables } from "../src/config/env.validation";
import { FirebaseTokenVerifier } from "../src/integrations/firebase/token-verifier";

async function main() {
  const report: Record<string, unknown> = {};
  let stage = "environment_validation";
  try {
    const env = validateEnv(process.env);
    if (env.AUTH_MODE !== "firebase" || env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error();
    validateEnv({ ...process.env, NODE_ENV: "production" });
    report.productionEnvironmentValid = true;
    report.projectId = env.FIREBASE_PROJECT_ID;
    stage = "admin_initialization";
    const verifier = new FirebaseTokenVerifier(new ConfigService<EnvironmentVariables, true>(env));
    if (!verifier.configured) throw new Error();
    const app = getApps().find(a => a.name === `interviewos:${env.FIREBASE_PROJECT_ID}:real`);
    if (!app?.options.credential) throw new Error();
    report.adminInitialized = true;
    const unsigned = `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: "fictional-smoke-user", aud: env.FIREBASE_PROJECT_ID })).toString("base64url")}.`;
    report.unsignedEmulatorTokenRejected = !(await verifier.verify(unsigned)).ok;
    report.testTokenRejected = !(await verifier.verify("test:fictional-smoke-user")).ok;
    stage = "google_oauth";
    const started = performance.now();
    // Do not log this object, raw SDK errors, HTTP bodies, or request headers.
    const access = await app.options.credential.getAccessToken();
    report.oauthCredentialAccepted = !!access.access_token;
    report.oauthElapsedMs = Math.round(performance.now() - started);
    const headers = { Authorization: `Bearer ${access.access_token}` };
    const base = `https://identitytoolkit.googleapis.com/admin/v2/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID!)}`;
    stage = "project_config_read";
    const configStarted = performance.now();
    const configResponse = await fetch(`${base}/config`, { headers, signal: AbortSignal.timeout(15000), redirect: "error" });
    report.projectConfigHttpStatus = configResponse.status;
    report.projectConfigElapsedMs = Math.round(performance.now() - configStarted);
    if (configResponse.ok) {
      const data = await configResponse.json() as { authorizedDomains?: string[]; signIn?: { email?: { enabled?: boolean; passwordRequired?: boolean } }; emailPrivacyConfig?: { enableImprovedEmailPrivacy?: boolean } };
      const domains = data.authorizedDomains ?? [];
      report.localhostAuthorized = domains.includes("localhost");
      report.authorizedDomainCount = domains.length;
      report.emailPasswordEnabled = data.signIn?.email?.enabled === true && data.signIn.email.passwordRequired === true;
      report.emailEnumerationProtectionEnabled = data.emailPrivacyConfig?.enableImprovedEmailPrivacy === true;
      report.configuredFrontendOriginsAuthorized = env.FRONTEND_ORIGINS.split(",").every(origin => {
        try { return domains.includes(new URL(origin.trim()).hostname); } catch { return false; }
      });
    }
    stage = "google_provider_read";
    const providerStarted = performance.now();
    const providerResponse = await fetch(`${base}/defaultSupportedIdpConfigs/google.com`, { headers, signal: AbortSignal.timeout(15000), redirect: "error" });
    report.googleProviderHttpStatus = providerResponse.status;
    report.googleProviderElapsedMs = Math.round(performance.now() - providerStarted);
    if (providerResponse.ok) {
      const data = await providerResponse.json() as { enabled?: boolean };
      report.googleProviderEnabled = data.enabled === true;
    }
    if (!configResponse.ok || !providerResponse.ok || report.googleProviderEnabled !== true || report.emailPasswordEnabled !== true || report.unsignedEmulatorTokenRejected !== true || report.testTokenRejected !== true) process.exitCode = 1;
  } catch {
    // Exception messages may contain credentials, access tokens, or response bodies.
    report.failedStage = stage;
    report.error = "Check failed; sensitive diagnostic details withheld.";
    process.exitCode = 1;
  } finally {
    await Promise.allSettled(getApps().map(app => deleteApp(app)));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
}

void main();
