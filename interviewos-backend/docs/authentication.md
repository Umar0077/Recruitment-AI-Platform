# Authentication & roles

## Flow

1. The frontend signs the user in with **Google Sign-In through Firebase Authentication** — the only supported method.
2. It sends `Authorization: Bearer <Firebase ID token>` on every request.
3. `AuthGuard` verifies the token with the Firebase Admin SDK (`verifyIdToken(token, checkRevoked=true)`:
   signature, issuer, audience, expiry, revocation). Decoded-but-unverified payloads are never trusted.
4. The user is looked up by `firebase_uid`. **Roles and permissions come only from the database** — never
   from the token, headers or request body.

If Firebase Admin is not configured the API rejects every authenticated request (`503 AUTH_NOT_CONFIGURED`) — fail closed.
Production startup refuses `AUTH_MODE=test` and missing Firebase credentials.

## New users

A first sign-in creates a user with **only** the `CANDIDATE` role. Google sign-in never grants staff access.
A candidate login is linked to its candidate record automatically only when Firebase reports a **verified**
email that matches exactly one unlinked candidate **who holds an open interview invitation**; otherwise a Super Admin
links it (`PATCH /users/:id/candidate`). Users are keyed by Firebase UID only — two accounts with the same email are
never merged by the backend. Tokens from any provider other than Google are refused with `403 SIGN_IN_METHOD_NOT_ALLOWED`
(`AUTH_ALLOWED_PROVIDERS=google.com`). See [firebase-setup.md](firebase-setup.md).

### Accounts created with a removed sign-in method

Apple Sign-In was removed. Users and data created through it are **kept** (no deletion, no automatic email merge),
but those identities can no longer open sessions. To move such a person to Google: they sign in once with Google
(this creates a new CANDIDATE user), then a Super Admin links their candidate record to the new user
(`PATCH /users/:id/candidate`, after unlinking it from the old one) or re-grants their staff role. Both steps are audited.

## Granting staff roles

- First Super Admin: the person signs in once, then on the server:
  `npm run admin:grant -- <firebase-uid-or-verified-email> SUPER_ADMIN`
- After that, Super Admins use `PATCH /users/:id/roles`. Guards: you cannot remove your own Super Admin role,
  the last active Super Admin cannot be removed, and candidate accounts cannot also hold staff roles.

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
