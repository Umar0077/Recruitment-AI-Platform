# Firebase Authentication setup

InterviewOS uses **Google Sign-In through Firebase Authentication** for identity and the **NestJS backend + PostgreSQL**
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
2. **Authentication → Sign-in method**: enable **Google** (set the support email). Leave every other provider disabled;
   the backend also refuses non-Google tokens (`AUTH_ALLOWED_PROVIDERS=google.com`).
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
NEXT_PUBLIC_FIREBASE_PROJECT_ID=interviewos-prod
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
FIREBASE_PROJECT_ID=interviewos-prod
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxx@interviewos-prod.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Take the three values from the downloaded service-account JSON, then delete that file. Keep the `\n` escapes on one line.
Production refuses to start with `AUTH_MODE=test` or missing credentials. Without credentials, every protected
request is refused with `503 AUTH_NOT_CONFIGURED` (fail closed).

## 4. Who gets access

| Situation | Result |
|---|---|
| First Google sign-in | New `users` row keyed by Firebase UID, role **CANDIDATE only** |
| Same person signs in again | Same row (unique `firebase_uid`); email/verified flag and missing display name synced; `last_login_at` updated |
| Two Firebase accounts with the same email | Two separate users — never merged by the backend |
| Candidate access to an interview | Only if the login is linked to the candidate record: automatically when Firebase reports a **verified** email that matches exactly one unlinked candidate **who has an open invitation**, otherwise by a Super Admin (`PATCH /users/:id/candidate`) |
| Staff access | Only after a role is granted: first admin via `npm run admin:grant -- <uid-or-email> SUPER_ADMIN`, then `PATCH /users/:id/roles` |
| Account disabled in Firebase or in InterviewOS | `403 ACCOUNT_DISABLED` |
| Valid token from another provider (apple.com, password, …) | `403 SIGN_IN_METHOD_NOT_ALLOWED`, no user created |
| Expired / revoked / wrong-project / malformed token | `401 UNAUTHENTICATED` (`details.reason` = expired, revoked, invalid) |

## 5. Local development with the Auth Emulator (no real Google accounts)

```bash
cd interviewos-infrastructure/firebase && npm install && npm run emulator   # Auth on :9099, UI on :4001
```

Backend: `AUTH_MODE=firebase FIREBASE_PROJECT_ID=demo-interviewos FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` (no service account needed).
Frontend `.env.local`: the values in `.env.example` under "Auth Emulator". Clicking *Continue with Google* opens the
emulator's fake account picker. Emulator tokens are unsigned and are rejected by real Firebase projects; the emulator is
refused in production builds.

`npm test` in the backend runs `test/e2e/firebase-auth.e2e-spec.ts` against the emulator when it is running (skipped otherwise).
