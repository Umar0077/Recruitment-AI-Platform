// Browser test fixture ONLY. Real compiled NestJS verifier/guard; in-memory candidate profile.
// No .env, Prisma, AppModule, production users or application records are loaded.
if (!process.argv.includes("--emulator-only")) throw new Error("Explicit --emulator-only flag required");
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9199";
import { createRequire } from "node:module";
import { createServer } from "node:http";
const backend = createRequire(new URL("../../interviewos-backend/package.json", import.meta.url));
const { ConfigService } = backend("@nestjs/config");
const { Reflector } = backend("@nestjs/core");
const { FirebaseTokenVerifier } = backend("./dist/integrations/firebase/token-verifier");
const { AuthGuard } = backend("./dist/modules/auth/auth.guard");
const config = new ConfigService({ NODE_ENV: "test", AUTH_MODE: "firebase", AUTH_ALLOWED_PROVIDERS: "google.com,password", FIREBASE_PROJECT_ID: "demo-interviewos-auth-tests", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9199", GOOGLE_APPLICATION_CREDENTIALS: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "" });
let profileRequests = 0;
const guard = new AuthGuard(new Reflector(), new FirebaseTokenVerifier(config), {
  resolve: async identity => ({ id: identity.uid, email: identity.email, displayName: identity.name, roles: ["CANDIDATE"], permissions: new Set(), candidateId: null, providers: [identity.signInProvider], isStaff: false }),
}, config);
const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:3100");
  res.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type");
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  if (req.url === "/__test/status") { res.end(JSON.stringify({ profileRequests })); return; }
  if (req.method !== "GET" || req.url !== "/api/v1/auth/me") { res.writeHead(404); res.end("{}"); return; }
  profileRequests++;
  try {
    const context = { getHandler: () => server, getClass: () => class Fixture {}, switchToHttp: () => ({ getRequest: () => req }) };
    await guard.canActivate(context);
    res.end(JSON.stringify({ success: true, data: { ...req.user, permissions: [] }, meta: {} }));
  } catch { res.writeHead(401); res.end(JSON.stringify({ success: false, error: { code: "UNAUTHENTICATED", message: "Fictional test session required." } })); }
});
server.listen(3198, "127.0.0.1", () => process.stdout.write("Fictional Auth Emulator API fixture ready on port 3198\n"));
