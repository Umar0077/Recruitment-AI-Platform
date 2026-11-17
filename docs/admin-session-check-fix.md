# Admin session checks and login verification

17 November 2026.

## Findings

An unauthenticated `GET /api/v1/admin-auth/me` returning 401 is expected: it asks whether the browser already has a valid administrator cookie. It does not test a submitted password. The backend should continue returning 401 in this case; protected endpoints were not made public or changed to return fake successful sessions.

The previous frontend already disabled HTTP retry for admin requests, so this was not a Firebase token-refresh retry loop. However, its mount effect made a separate request each time React development Strict Mode replayed the effect. Reloads, hot reloads and real remounts could also produce new checks. The expected 401 additionally notified the global authentication-failure listener, while the session probe was handling the same result. The probe swallowed errors, and `signInWithEmail` returned success after POST even if the follow-up `/me` failed. A stale connection notice could survive a signed-out result.

A separate configuration mismatch could prevent cookie persistence: `.env.local` used `http://127.0.0.1:4000/api/v1`, while the allowed browser origin was `http://localhost:3000`. These hosts are different sites for cookie purposes. The existing SameSite=Strict cookie must not be weakened to accommodate this mismatch. The local API URL is now `http://localhost:4000/api/v1`; the backend's exact allowed origin remains `http://localhost:3000`. Use [the localhost admin page](http://localhost:3000/admin/login), not a mixed localhost/127.0.0.1 pairing.

## Changes

- Pending session probes are shared across Strict Mode effect replay and simultaneous refreshes. They do not poll, automatically retry or trigger the global failure listener. A 401 settles into `signedOut`, clears obsolete notices and shows no application-error message.
- Protected requests still notify the global listener on rejection and clear staff access/private cached data. Candidate Firebase refresh behavior is unchanged.
- POST login failure remains a genuine login error. POST success now requires a fresh successful `/me` before login reports success. Missing/blocked cookie or failed verification produces a specific session-verification message. A late pre-login response cannot overwrite a newer verified session.
- Only the local public API hostname was changed in `.env.local`; other environment values were preserved. No password, credential hash, role or production setting was changed.

Browsers may still show the one expected HTTP 401 in their Network/Console tools. That is the real HTTP response, not an application error or a reason to retry. A new page load legitimately checks again. No backend authorization response is concealed or weakened.

## Session, origin and CSRF verification

The actual local server returned 401 for anonymous `/me`, with `Access-Control-Allow-Origin: http://localhost:3000` and `Access-Control-Allow-Credentials: true`. Login preflight returned 204 and allowed `Content-Type` and `X-Admin-Request`.

Admin requests use `credentials: include`, `cache: no-store`, `X-Admin-Request: 1` and no Firebase Authorization header. The backend requires the exact Origin and custom header for login and authenticated mutations. Cookie attributes remain HttpOnly, SameSite=Strict, host-only, Path=/, eight-hour maximum age, and Secure in production. Production login/mutations require HTTPS; proxy trust remains disabled locally. Idle expiry remains 30 minutes. Password changes revoke sessions, and the next login must use the new password.

Read-only inspection found the initial administrator already exists, is ACTIVE, and still has `mustChangePassword=true`. It was not bootstrapped again, reset, unlocked or otherwise modified. This inspection cannot determine whether a password typed by the user is correct.

## Tests

Frontend authentication suite: **103 passed**, eight opt-in Firebase emulator tests skipped. New regressions cover one request under Strict Mode, quiet pre-login 401, stale-notice clearing, POST plus fresh `/me`, rejected post-login verification, no retry for incorrect credentials, late-response ordering, and protected-session invalidation.

`test/auth-db/admin-http.integration.cjs` exercises the built Nest controller/guard/service over an actual loopback HTTP server and real local test PostgreSQL. One fictional account is created inside a transaction, and all changes are rolled back. Verified sequence:

1. No session: `/me` 401; candidate bearer cannot access admin-auth.
2. Bad origin or missing CSRF header: login 403. Incorrect password: 401.
3. Correct password: POST login 200 and HttpOnly/Strict session cookie; `/me` 200 with mandatory-change flag.
4. Workspace account access before change: `PASSWORD_CHANGE_REQUIRED`.
5. Password change with bad origin: 403; valid change: 200 and cookie expiry/session revocation; `/me` then 401.
6. New-password login and `/me`: 200, mandatory-change flag cleared; authorized account access works.
7. Logout: `/me` 401. Credential/session counts return to their original values after rollback.

The HTTP fixture verifies real cookie serialization and authentication, but does not emulate a browser's SameSite policy. The hostname correction follows the observed configuration mismatch. Production Secure-cookie enforcement is covered by the backend security tests, not a deployed TLS environment. No real administrator password or credential value was read or submitted.

Final verification passed: frontend and backend TypeScript, frontend and backend lint, **100 backend authentication/security tests**, and both production builds (39 frontend pages generated). The frontend production build uses a process-only HTTPS placeholder (`https://interviewos.invalid/api/v1`) because the production safeguard correctly rejects the local HTTP development URL. The placeholder is not written into `.env.local` and is not a deployment target. The development frontend was restarted with the corrected localhost configuration afterward.

No PostgreSQL records were reset, deleted or unnecessarily modified. No production deployment or live administrator password change was performed.
