# Firebase readiness verification — 2026-11-17

This is the initial Google Sign-In configuration snapshot. The later
[Google + Email/Password verification](../../docs/email-password-auth.md) supersedes its provider,
frontend configuration, and test-count details.

The backend credential and authentication configuration are ready for real Firebase Google Sign-In for
`ai-recruitment-4d3e4`. Google accepted the service account, and read-only project checks confirmed that
Google Sign-In is enabled. A complete browser-to-backend login remains to be tested after frontend setup.

## Local configuration

The downloaded file had a duplicate `.json.json` extension; it was renamed to
`secrets/firebase-service-account.json`. The ignored backend `.env` now selects:

```dotenv
AUTH_MODE=firebase
FIREBASE_PROJECT_ID=ai-recruitment-4d3e4
GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-service-account.json
FIREBASE_AUTH_EMULATOR_HOST=
```

Legacy `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` remain empty. Other environment settings and
application permissions were preserved. `NODE_ENV` remains `development` locally; the same credential
configuration also passed production environment validation.

The service-account project ID exactly matches the configured project. Startup validates the file and key,
refuses conflicting credential sources, and creates an explicitly project-bound Admin certificate credential.
Errors omit credential contents. Relative paths resolve from the backend root in both source and compiled code.

## Security verification

- `secrets/` is Git-ignored. The credential path is ignored, and no credential file is tracked. A scan of tracked
  working files found no JSON containing both service-account type and private-key fields. No commit was made.
- `.dockerignore` excludes secrets, private-key files, and local `.env` files from Docker build contexts.
- Real mode rejects unsigned emulator tokens, `test:` tokens, and changed/inherited emulator flags.
- Emulator support remains available in development/test with a `demo-` project ID and no real credentials.
  Production refuses both emulator mode and `AUTH_MODE=test`.
- Firebase revocation/disabled-account checks remain enabled. Provider filtering and existing database-driven
  authorization remain unchanged. No Firebase users, provider settings, PostgreSQL records, or roles were modified.

## Checks performed

| Check | Result |
|---|---|
| TypeScript (`npm run typecheck`) | Passed |
| ESLint (`npm run lint`) | Passed |
| Isolated auth tests (`npm run test:auth`) | 49 passed across 2 suites; no database access |
| Backend production compilation (`npm run build`) | Passed |
| Compiled Admin initialization + production env validation | Passed; project matched and test token rejected |
| Google OAuth credential exchange | Passed; 1,460 ms |
| Read-only Auth project configuration | HTTP 200; 620 ms |
| Read-only Google provider configuration | HTTP 200; enabled; 336 ms |
| Authorized domains | `localhost` authorized; configured backend frontend origins match; 3 domains total |

The first network check failed inside the restricted execution environment. The retry with network access
succeeded. No credential/API error remained. Private credentials, OAuth tokens, and raw API responses were
never printed or logged. The general Jest setup was deliberately not run because it migrates, truncates,
and seeds a test database. The full Nest application was not started, avoiding background jobs and login
provisioning writes. Admin initialization and invalid-token rejection were checked independently.

## Remaining frontend setup

No frontend environment files or inherited Firebase web variables were present during verification.
Create the project-root `.env.local` from the Firebase **Web app** configuration, using this project's values:

```dotenv
NEXT_PUBLIC_APP_MODE=api
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1
NEXT_PUBLIC_FIREBASE_PROJECT_ID=ai-recruitment-4d3e4
NEXT_PUBLIC_FIREBASE_API_KEY=<Firebase Web app API key>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<Firebase Web app auth domain>
NEXT_PUBLIC_FIREBASE_APP_ID=<Firebase Web app app ID>
# Optional in the current frontend implementation:
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=<Firebase Web app sender ID>
```

Keep `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST` unset for real sign-in. Service-account credentials belong
only in the backend. The frontend requires API key, auth domain, project ID, and app ID. Google is already
enabled and localhost already authorized; authorize the deployed frontend domain when deploying.

Use `npm run dev` for the local HTTP API URL above. A production frontend build requires an HTTPS API URL.
Set backend `FRONTEND_ORIGINS` to the exact browser origin, including its port (default is localhost:3000).
Restart the backend to load its changed environment; restart/rebuild the frontend after setting public variables.
Then complete a real Google login to verify the browser flow. Normal successful application login can provision
or update a PostgreSQL user, so it was outside this no-database-write verification.

The standalone `npm run auth:check:live` command can repeat the read-only check without importing the
application or database. For deployment with file credentials, mount the JSON securely into the API and
worker; the existing Compose file still uses the supported legacy inline configuration.

References: [Firebase Admin setup](https://firebase.google.com/docs/admin/setup),
[Google Sign-In for web](https://firebase.google.com/docs/auth/web/google-signin),
[Auth Emulator behavior](https://firebase.google.com/docs/emulator-suite/connect_auth),
[project configuration GET](https://cloud.google.com/identity-platform/docs/reference/rest/v2/projects/getConfig),
[Google provider configuration GET](https://cloud.google.com/identity-platform/docs/reference/rest/v2/projects.defaultSupportedIdpConfigs/get).
