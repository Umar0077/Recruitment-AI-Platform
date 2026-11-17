# Firebase Authentication setup

InterviewOS uses **Google Sign-In and Email/Password through Firebase Authentication** for identity and the **NestJS backend + PostgreSQL**
for authorisation (roles, candidate ↔ invitation links). There is no second login system.

```
Browser ──Firebase JS SDK──► Google ──► Firebase ID token (1 h, auto-refreshed by the SDK)
   │  Authorization: Bearer <ID token>
   ▼
NestJS AuthGuard ── Firebase Admin verifyIdToken(token, checkRevoked) ── signature, project, expiry, revoked, disabled
   │  firebase_uid → users (PostgreSQL) → roles/permissions → ownership checks
```

## 1. Create the Firebase project (one-time, Firebase console)

1. Create a project (e.g. `interviewos-prod`; use a separate `interviewos-staging` for testing).
2. **Authentication → Sign-in method**: enable **Google** (set the support email) and **Email/Password**
   (password authentication, not passwordless email links). Leave Apple and other providers disabled;
   the backend accepts only `AUTH_ALLOWED_PROVIDERS=google.com,password` and requires verified email for both.
3. **Authentication → Settings → User account linking**: keep *Link accounts that use the same email*
   (one account per email). The backend never merges users by email.
4. **Authentication → Settings → Authorized domains**: add `localhost` (development) and the real frontend domain(s).
5. **Project settings → General → Your apps → Web app**: register a web app and copy its config.
6. **Project settings → Service accounts → Generate new private key** (backend only — see §3).

## 2. Frontend (`.env.local`, never committed)

```
NEXT_PUBLIC_APP_MODE=api
NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api/v1
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=interviews.example.com      # see "Auth domain" below
NEXT_PUBLIC_FIREBASE_PROJECT_ID=ai-recruitment-4d3e4
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
```

These web-config values identify the project and are public by design (they ship in the browser bundle).
Security comes from authorised domains and server-side token verification, not from hiding them.

### Auth domain (important for redirects)

Sign-in uses a **popup** first and falls back to a **same-tab redirect** when popups are blocked. Modern Chrome,
Safari and Firefox partition third-party storage, so the redirect result is lost if `authDomain` is a different
site (`<project>.firebaseapp.com`) from the app. For production:

- set `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` to the **frontend's own domain**, and
- serve `/__/auth/*` from that domain by proxying it to `https://<project>.firebaseapp.com/__/auth/` (Nginx/Next rewrite)
  or by hosting on Firebase Hosting with a custom domain;
- add `https://<your-domain>/__/auth/handler` to the Google OAuth client's authorised redirect URIs.

If a redirect result is lost anyway, the login page now says so ("Allow pop-ups for this site and try again").

## 3. Backend (`interviewos-backend/.env`, never committed)

```
AUTH_MODE=firebase
AUTH_ALLOWED_PROVIDERS=google.com,password
FIREBASE_PROJECT_ID=ai-recruitment-4d3e4
GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-service-account.json
FIREBASE_AUTH_EMULATOR_HOST=
```

Store the downloaded JSON in the backend's Git-ignored `secrets/` directory. Relative credential paths resolve
from `interviewos-backend`, including after compilation; absolute paths to a securely mounted file also work.
Never put the JSON or private key in frontend variables, source code, logs, or Git. For deployment, mount the
file through the host's secret management facility and make it readable only by the backend identity.
The backend `.dockerignore` also excludes secrets and local environment files from image build contexts.
The existing Linux Compose configuration still supports its legacy inline credential variables; to use the
file approach there, mount the file read-only into both API and worker and set the container path in
`GOOGLE_APPLICATION_CREDENTIALS`, leaving the inline fields empty.

The backend validates the file shape, RSA key, and exact project-ID match before creating a Firebase Admin
certificate credential. The legacy `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` option remains supported
(literal `\n` escapes are accepted); leave both empty when using a file. Mixing the two sources fails startup.
Production refuses `AUTH_MODE=test`, emulator mode, or missing credentials. Development without credentials
refuses every protected request with `503 AUTH_NOT_CONFIGURED` (fail closed).

Real mode rejects unsigned/emulator tokens and unexpected changes to the process-wide emulator flag.
Admin app instances are separated by project and real/emulator mode. Revocation and disabled-user checks
remain enabled. See the official [Admin SDK setup](https://firebase.google.com/docs/admin/setup) and
[Auth Emulator documentation](https://firebase.google.com/docs/emulator-suite/connect_auth).

## 4. Who gets access

Candidates may create Firebase accounts at `/candidate/signup`. Staff roles remain assigned only through
authorized administration; there is no public admin signup. Passwords never enter the recruitment database
or NestJS API. Firebase handles password reset and verification emails through its hosted email-action
pages. Verification returns the user to Login for a fresh sign-in, and does not grant an interview. Configure
the project's password policy, authorized deployment domains and branded email templates in Firebase.
Real signup calls `validatePassword` using that project policy. Only non-production `demo-` Auth Emulator
connections use the local 6–4096 character fallback, because the emulator has no password-policy endpoint.

| Situation | Result |
|---|---|
| First verified Google/password sign-in | New `users` row keyed by Firebase UID, role **CANDIDATE only** |
| Same person signs in again | Same row (unique `firebase_uid`); email/verified flag and missing display name synced; `last_login_at` updated |
| Two Firebase accounts with the same email | Two separate users — never merged by the backend |
| Candidate access to an interview | Only if the login is linked to the candidate record: automatically when Firebase reports a **verified** email that matches exactly one unlinked candidate **who has an open invitation**, otherwise by a Super Admin (`PATCH /users/:id/candidate`) |
| Staff access | Only after a role is granted: first admin via `npm run admin:grant -- <uid-or-email> SUPER_ADMIN`, then `PATCH /users/:id/roles` |
| Account disabled in Firebase or in InterviewOS | `403 ACCOUNT_DISABLED` |
| Valid token from another provider (apple.com, anonymous, …) | `403 SIGN_IN_METHOD_NOT_ALLOWED`, no user created |
| Google/password token with unverified or missing email | `403 EMAIL_NOT_VERIFIED`, no user created or candidate linked |
| Expired / revoked / wrong-project / malformed token | `401 UNAUTHENTICATED` (`details.reason` = expired, revoked, invalid) |

## 5. Local development with the Auth Emulator (no real Google accounts)

```bash
cd interviewos-infrastructure/firebase && npm install && npm run emulator   # Auth on :9099, UI on :4001
```

Backend: `AUTH_MODE=firebase FIREBASE_PROJECT_ID=demo-interviewos FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`.
Use a non-production `NODE_ENV`, and clear `GOOGLE_APPLICATION_CREDENTIALS`, `FIREBASE_CLIENT_EMAIL`, and
`FIREBASE_PRIVATE_KEY`. Emulator mode requires a `demo-` project ID; real projects cannot enable it.
Frontend `.env.local`: the values in `.env.example` under "Auth Emulator". Clicking *Continue with Google* opens the
emulator's fake account picker. Emulator tokens are unsigned and are rejected by real Firebase projects; the emulator is
refused in production builds.

## 6. Verification without database changes

Run `npm run test:auth` for isolated authentication, authorization guard, and configuration tests using
fictional identities and an ephemeral synthetic key. This command has no database setup or application bootstrap.
Run `npm run auth:check:live` to validate the local `.env`, initialize Admin, reject fictional unsigned/test tokens,
obtain a Google OAuth access token, and read the project's Auth and Google-provider configuration. It reports
only status flags, timing, and HTTP status; it never prints credentials, OAuth tokens, or raw API responses.
It also verifies that Google and password authentication are enabled and reports email enumeration protection.
It neither reads user records nor changes Firebase settings or PostgreSQL data.

The general `npm test` / `test:e2e` setup resets and seeds the test database; use it only with an explicitly
disposable database. Its Firebase integration test runs against the emulator when available.
