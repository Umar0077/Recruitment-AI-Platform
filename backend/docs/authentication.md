> Administrator authentication now uses independent password/cookie sessions. See [Admin authentication and speech upgrade](../../docs/admin-auth-speech-upgrade.md). Firebase tokens are candidate-only, including historical staff identities.

# Authentication & roles

## Flow

1. The frontend signs the user in with **Firebase Google Sign-In or Email/Password**. Passwords go directly to Firebase, never to NestJS or PostgreSQL.
2. It sends `Authorization: Bearer <Firebase ID token>` on every request.
3. `AuthGuard` verifies the token with the Firebase Admin SDK (`verifyIdToken(token, checkRevoked=true)`:
   signature, issuer, audience, expiry, revocation). Decoded-but-unverified payloads are never trusted.
4. The user is looked up by `firebase_uid`. **Roles and permissions come only from the database** — never
   from the token, headers or request body.

Both real providers require a verified email before user synchronization or access (`403 EMAIL_NOT_VERIFIED`).
Unverified sessions go to `/candidate/verify-email`, with resend, manual checking and bounded polling
(15 seconds, up to 10 minutes, paused while hidden). A verified registration session refreshes its token,
signs out and returns to Login; it never loads `/auth/me` before a fresh sign-in. A non-secret UID marker
preserves this requirement across refreshes. Local persistence and SDK token refresh apply to both
providers. Sign-out clears cached application records and permissions.

If Firebase Admin is not configured the API rejects Firebase candidate requests (`503 AUTH_NOT_CONFIGURED`) — fail closed.
Production startup refuses `AUTH_MODE=test` and missing Firebase credentials.
Use `GOOGLE_APPLICATION_CREDENTIALS` for the backend-only service-account JSON and set an explicit matching
`FIREBASE_PROJECT_ID`. Real mode rejects unsigned emulator tokens and inherited/changed emulator flags.
The emulator requires a non-production `demo-` project and no real credentials. See
[Firebase setup](firebase-setup.md) for environment values and database-free verification commands.

## New users

A first sign-in creates a user with **only** the `CANDIDATE` role. Google sign-in never grants staff access.
A candidate login is linked to its candidate record automatically only when Firebase reports a **verified**
email that matches exactly one unlinked candidate **who holds an open interview invitation**; otherwise a Super Admin
links it (`PATCH /users/:id/candidate`). Users are keyed by Firebase UID only — two accounts with the same email are
never merged by the backend. Tokens from providers other than Google or password are refused with
`403 SIGN_IN_METHOD_NOT_ALLOWED` (`AUTH_ALLOWED_PROVIDERS=google.com,password`). Environment validation
does not permit Apple, custom, anonymous, or other providers in this allowlist. See [firebase-setup.md](firebase-setup.md).

Public **candidate** registration at `/candidate/signup` calls Firebase directly; there is no password or
registration endpoint in NestJS and no public admin signup. Registration saves the exact trimmed full name
in Firebase, sends verification, then requires a fresh login. Backend synchronization stores that initial name
in `User.displayName`, or fills a missing name on an existing UID. Stored names and `Candidate.fullName`
are preserved; a compare-and-set protects concurrent edits. Profile initialization/completion and their
audit rows share a transaction. Audit summaries contain field names, not profile values.

Google uses the same sync path; accounts missing a stored name use the Complete Your Profile screen.
The shared frontend account profile drives greetings and account menus; official applicant names and
activity actors remain separate. An authenticated account still requires an eligible invitation/candidate
link or existing staff roles. Password reset uses Firebase directly and shows the same confirmation for
existing, missing, and disabled accounts. No schema migration is required.

### Accounts created with a removed sign-in method

Apple Sign-In was removed. Users and data created through it are **kept** (no deletion, no automatic email merge),
but those identities can no longer open sessions. To move such a person to a supported method: they sign in once with Google or a provisioned email/password account
(this creates a new CANDIDATE user), then a Super Admin links their candidate record to the new user
(`PATCH /users/:id/candidate`, after unlinking it from the old one) (staff credentials instead use the separate operator recovery command). Both steps are audited.

## Provisioning staff access

Run `npm run admin:bootstrap` from the project root (or backend folder) in an interactive terminal. Supply a strong temporary password at the hidden prompt. Initial identity: `admin@balitech.com`; mandatory first-login change. Then create HR accounts in `/admin/settings/accounts`. `admin:grant` no longer enables Firebase staff login; old identities and history remain preserved. Use `npm run admin:recover -- EMAIL --confirm-recovery` from the backend folder for audited operator recovery.

## Role matrix (`src/common/constants/permissions.ts`)

| Permission | Super Admin | HR Manager | Recruiter | Reviewer | Candidate |
|---|:-:|:-:|:-:|:-:|:-:|
| candidates:read / applications:read | ✓ | ✓ | ✓ | ✓ | |
| candidates:write / applications:update_status / interviews:invite | ✓ | ✓ | ✓ | | |
| interviews:read / interviews:review / hr_remarks:write / assessments:read / question_sets:read | ✓ | ✓ | ✓ | ✓ | |
| analytics:read | ✓ | ✓ | ✓ | | |
| question_sets:manage / audit:read | ✓ | ✓ | | | |
| users:manage | ✓ | | | | |
| interviews:take (own sessions only) | | | | | ✓ |

`RECRUITER_SCOPE=assigned` limits recruiters to applications assigned to them.

## Development test mode

`AUTH_MODE=test` accepts `test:<uid>` or `test:<uid>:<email>` tokens so the API can be exercised without
Firebase. It is refused when `NODE_ENV=production`, and it never grants roles — the seeded dev users
(`dev-super-admin`, `dev-hr-manager`, `dev-recruiter`, `dev-reviewer`, `dev-candidate`) get theirs from the database.
For realistic local testing use the Firebase Auth Emulator (`FIREBASE_AUTH_EMULATOR_HOST`, non-production only).
