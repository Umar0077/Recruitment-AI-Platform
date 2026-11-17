# Stuck onboarding correction — 17 November 2026

## Root cause

The existing `useAccessGate` treated a missing `profile.candidateId` as an access failure on every candidate page, including onboarding. `CandidateShell` therefore never mounted the onboarding component and redirected back to `/candidate/interview/unavailable?reason=not-linked`. The sign-in component independently routed new candidates to that same legacy page. Previous onboarding UI tests mocked the shell, so they could not detect this guard defect.

A second defect would have occurred after assignment: only the portal query was invalidated, leaving the authentication profile's candidate link stale. A normal profile refresh also briefly unmounted the form, risking another initial-assignment effect on remount.

## Changes

1. `src/lib/auth/use-access-gate.ts`: authenticated candidate accounts without a candidate row can mount onboarding; other candidate paths route them there. Authentication loading, email verification, profile completion and staff restrictions remain enforced.
2. `src/components/auth/social-sign-in.tsx`: new candidates go directly to onboarding; invitation-only instructions were corrected.
3. `src/lib/auth/auth-provider.tsx`: optional background profile refresh keeps the signed-in page mounted while fetching the new candidate linkage. Normal session/security checks remain intact.
4. `src/app/candidate/onboarding/page.tsx`: backend role cards show title, description and category. Selection persists through failures; retry submits that selection. Successful assignment refreshes authentication, portal and interview caches before navigation. Unexpected responses produce an error instead of endless preparation text.
5. Backend `src/modules/interviews/initial-assignment.ts`: existing endpoint now includes role description/category and actual application/candidate IDs in assignment responses. Existing transaction, ownership, question-set validation and uniqueness rules are preserved.
6. Regression tests cover the real access hook, sign-in destination, selection/retry and background profile refresh.

No new endpoint or migration was required. The workflow uses `POST /api/v1/interviews/initial`, `GET /api/v1/auth/me` and the existing portal/interview APIs. No real account was manually assigned an interview, no existing record was deleted or reset, and no credential or LLM configuration was changed.

## Verification

- 178 frontend tests passed in the full run; six new access-gate tests, one added retry test and one added profile-refresh test passed in targeted runs: **186 distinct tests**. The eight optional emulator tests were skipped, not counted.
- Backend authentication: **71 passed**. Assignment/transcript tests: **25 passed**.
- Both TypeScript checks, full configured lint commands, and both production builds passed. Frontend generated 37 static pages. Its verification build used a process-only HTTPS placeholder origin; local environment files were preserved.
- PostgreSQL rollback tests passed for FE and CSR assignment, published question wording, repeated onboarding, unique-constraint rejection, four saved answers, submission, HR review creation, foreign ownership denial, existing Careers application selection and profile/name synchronization. All fictional fixture writes rolled back.
- Read-only development inspection found both active official roles with published four-question sets and verified candidate accounts without candidate profiles. This confirms the missing-profile state is legitimate onboarding input.
- Real browser: the legacy unavailable page's **Continue Onboarding** link reached **Complete Your Application**, with both actual backend roles and descriptions visible in a real Firebase-authenticated session. No console errors were reported at that point. Screenshot: `speech-usage-preview/onboarding-fixed.png`.

## Browser environment and remaining verification

During verification, separate IPv4 and IPv6 frontend processes served port 3000. They were consolidated into one localhost development server. The frontend was briefly stopped for the production build and then restored; the backend readiness endpoint returned HTTP 200. A browser tab retained its old connection-refused page during the restart; a fresh tab reached the authenticated onboarding screen.

Persistent assignment and submission using the current browser account await confirmation that it is a test account. The tests already exercised those operations against PostgreSQL with fictional rollback fixtures, but that is not a browser end-to-end test. HR review creation and ownership were verified through services/database tests; an authorized HR browser login and dashboard review have not been executed in this request.
