# Candidate onboarding and persistent initial interview assignment

Implemented 17 November 2026 in the existing application. No production deployment or credentials changes.

## Journey

Firebase signup, email verification and Google sign-in remain unchanged. After authenticated profile resolution, a candidate without an interview is sent to `/candidate/onboarding`. This calls `POST /api/v1/interviews/initial` using the Firebase bearer token. Identity comes exclusively from the authenticated principal.

- An existing interview of any status is reused. This includes submitted, expired and cancelled history; onboarding never restarts it.
- An unambiguous existing candidate with the verified email can be linked to the account. Ambiguous matches or ownership by another user require recruitment assistance.
- One existing application supplies its job role automatically. Multiple applications require an explicit selection; later recruitment stages are not reset.
- A candidate without an application selects Experienced FE Closer or Customer Sales Representative (Fresher). No default selection is made.
- The backend checks the active published question set, track and exact four question codes. It snapshots existing HR wording without regeneration or modification.
- Newly created candidate names come from the stored Firebase-synchronized profile. Existing candidate names are preserved.
- Submitted sessions route to the completion page. Pending sessions offer Start Interview; active sessions offer Resume Interview, question counts and expiry. Expired sessions offer recruitment contact without a reset.

The completion page uses backend candidate name, role, reference, submission timestamp and current recruitment stage. API mode has no Start New Interview action. Demo mode deliberately starts fresh on every login, superseding the earlier same-email demo resume behavior; refresh within an active demo remains persistent.

## Persistence, authorization and concurrency

The operation is a PostgreSQL transaction. It locks the authenticated user, uses an advisory lock when resolving a verified email, then locks the candidate and selected application. The HR invitation path also locks candidate/application rows and reuses an existing application interview. Authentication, candidate permission, email verification and application ownership are enforced server-side; the request accepts no user ID or permission selection.

Migration `202611180001_initial_assignment` adds a nullable `initial_assignment_key` and unique index to `interview_sessions`. Historical rows stay null. Automatic assignments use candidate ID as the unique key, limiting the initial assignment to one per candidate even across applications. Existing unique candidate/user and application source/reference constraints are reused. No tables, permissions, historical outcomes or question sets were replaced.

The reviewed migration was applied to both existing local development and test databases using `prisma/deploy-initial-assignment.ts`. It refuses unrelated pending migrations. There were no resets, seeds or existing application-record rewrites. PostgreSQL was already running when inspected and was left running.

Assignments create the existing interview questions, invitation progress event, recruitment stage transition, recruitment event and audit entry. Existing submission code creates the HR review and preserves confirmed answers. Consequently the records use the same HR dashboard queries and scope rules as manual invitations; no assessment scores are fabricated. No LLM requests were made.

## Verification

- Frontend: 174 existing tests passed, plus four new onboarding UI tests passed separately (178 total). Eight optional Firebase emulator tests were skipped; they were not rerun for this request.
- Backend: 71 authentication tests and 25 transcript/assignment tests passed (96 total). Assignment tests cover all existing interview statuses, required verification/name/role, foreign applications, multiple applications, invalid question availability and staff-only denial.
- PostgreSQL assignment integration passed for both tracks: explicit selection, exact published wording, repeated calls, four persisted answers, submission, HR review, ownership rejection and no second invitation. A deliberate duplicate assignment was rejected by the unique index inside a savepoint.
- PostgreSQL Careers integration passed: verified-email linking, explicit multiple-application selection, application role overriding a conflicting supplied role, established name preservation and no extra application.
- Existing transcript persistence and profile synchronization PostgreSQL integrations passed. All fictional fixtures rolled back; existing records were not changed.
- Frontend and backend TypeScript, lint and production builds passed. The frontend generated 37 static pages including onboarding. The frontend build uses a process-only HTTPS placeholder API origin for validation; local environment files remain unchanged. Rebuild with the actual HTTPS API origin before deployment.

The database test executes the real assignment, start, answer, submission and read services against PostgreSQL. UI tests use mocked HTTP responses. **A complete browser-to-HTTP API journey with a newly verified Firebase email or Google account was not executed in this request.** No claim of real Google popup/email delivery or new browser end-to-end verification is made. Concurrent request load was not benchmarked; transaction locks and the unique constraint are implemented, with sequential replay and database uniqueness verified.

## Main changed files

- Backend `src/modules/interviews/initial-assignment.ts`, interview service/module/DTO, common error codes, Prisma schema and additive migration.
- Backend guarded migration helper, assignment unit tests and rollback-only integration.
- Frontend `src/app/candidate/onboarding/page.tsx`, shared flow gate, welcome/completion/status/unavailable pages.
- Demo session reset logic/login explanation and updated demo regression tests; new onboarding UI tests.

Existing unrelated workspace changes were preserved. No STT, TTS, NLP, model configuration or authentication verification rules were changed.
