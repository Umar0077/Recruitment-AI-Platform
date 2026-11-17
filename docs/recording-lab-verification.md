# Recording commissioning report — 18 November 2026 (Asia/Karachi)

**Status: live isolated storage/API workflow verified; physical browser capture and HR player demonstration pending.**
No claim of complete end-to-end physical recording success is made.

| # | Requested area | Result / evidence |
| --- | --- | --- |
| 1 | Exact reason disabled | Real backend has recording/upload/monitoring flags false, retention zero, no policy reference/support contact, and no storage credentials. Its unavailable message is the intended fail-closed state, not evidence that browser capture ran and failed. |
| 2 | Missing configuration | Real-applicant use still needs approved retention, privacy reference, operational support/alternative procedure, private never-versioned storage with lifecycle/CORS configuration, and explicit enable flags. |
| 3 | Storage changes | Added a separate loopback-only MinIO Docker service and private lab bucket. Live readiness verifies privacy, expiration, versioning and actual CORS behavior. MinIO lacks bucket-CORS support and omits the S3 multipart-abort lifecycle rule; the restricted lab uses HTTP CORS probes and verified orphan-upload cleanup. Production S3 requirements remain strict. |
| 4 | Consent/policy status | Lab-only `LOCAL-FICTIONAL-TEST-v1` explicitly describes one-day test cleanup, purpose, sources, HR access, deletion, consent and alternatives. This is not organization approval. Existing real-applicant configuration remains disabled. |
| 5 | Frontend changes | Separate Start Screen Sharing and Enable Camera & Microphone actions; SCREEN_READY state; preview/source checks; duplicate-start prevention; actual start/upload error text; voluntary fullscreen; accessible neutral focus notice; labelled local policy. Separate lab build output and generated-file lint exclusion. |
| 6 | Backend changes | Safe readiness blocker codes; strict local-test environment validation and `@example.test` recording gate; main .env ignored in lab; loopback binding; MinIO-specific HTTP CORS verification and orphan-abort scan. Ownership, HR scope, CSRF, consent and storage verification remain enforced. Fixed a broad Git ignore pattern that inadvertently hid backend recording source/tests. |
| 7 | Database changes | Created only the new `interviewos_recording_lab` database; deployed existing migrations (including existing `202611180003_interview_recordings`) and standard seeds there. No new schema migration in this repair. Existing database records/passwords/scores/reports were not changed; regression fixtures in the existing test DB rolled back. The new fictional lab administrator completed mandatory password change. |
| 8 | Screen capture | Permission sequencing, cancellation, unsupported format/surface and interruption behavior pass automated tests. Real Chrome/Edge picker/capture remains unverified; browser-control app approval timed out. |
| 9 | Webcam | Aspect-preserving compositor and device lifecycle pass tests. Actual webcam preview/recording remains pending tester consent and native permission. |
| 10 | Microphone | Device readiness/ended-track rejection and cleanup pass tests. The artificial Opus audio upload decodes correctly. Actual microphone audibility and interviewer TTS capture are not verified. |
| 11 | Upload | Live multipart PUT succeeded with ETag and exact origin CORS. Completion before upload was rejected. Backend verified actual parts/object size/type and wrote UPLOADED metadata. Test object: 36,050 bytes; two-second generated VP8/Opus WebM; no screen/camera/mic used. |
| 12 | HR playback | Normal admin cookie authentication, first-password-change enforcement/revocation, subsequent login, scoped playback authorization, 60-second URL configuration, byte-identical download and HTTP 206 Range delivery passed. Anonymous object GET returned 403; candidate playback denied. Downloaded video/audio decoded without errors (VP8 320×240, Opus 48kHz, 2.008s). Visual HR player playback remains pending. |
| 13 | Fullscreen/tab behavior | Explicit entry/exit, browser exit state, rejection/unsupported fallback, event deduplication and neutral notice behavior pass tests. Live API accepted deduplicated fictional event fixtures. No score/failure changes or browser/OS trapping. Physical fullscreen/tab transition demonstration remains pending. |
| 14 | Browser limitations | Native permissions require user interaction. Source/audio options vary by browser/OS; shared audio is not guaranteed. TTS is not directly mixed. Canvas/background throttling may affect frames. Fullscreen is voluntary. Refresh loses unsent RAM-only media. |
| 15 | Privacy/security limitations | Lab services/credentials are local and disposable; Firebase emulator is not production authentication. Local runtime secrets and media are Git-ignored, but accessible to users with filesystem access. MinIO root identity is confined to this separate local service; production needs approved infrastructure/access configuration. Deletion/retention jobs require running services; storage lifecycle is eventual. No secret values or signed URLs were printed. |
| 16 | Remaining blockers | A consenting tester must complete actual Chrome/Edge screen/camera/mic recording, confirm preview/audio, exercise sharing interruption/recovery/fullscreen/tab return, and play that completed recording in the authorized HR UI. Separately, organization-approved policy and production storage are still required for real applicants. |

## Verification performed

- Frontend: TypeScript, ESLint and production build passed; 220 tests in full regression run plus five new permission/fullscreen tests passed (26 recording tests total). Eight opt-in real Firebase emulator tests remained skipped in that generic frontend run; live lab password authentication was separately exercised over HTTP.
- Backend: TypeScript, ESLint and production build passed; 100 authentication tests, 25 transcript/assignment tests and 48 recording/configuration/storage/security tests passed.
- Rollback PostgreSQL integrations passed for recording persistence, both interview roles/automatic assignment, confirmed transcript preservation and ownership, and administrator HTTP authentication/password-change/CSRF/logout.
- Live MinIO/PostgreSQL/Firebase-emulator HTTP workflow passed. Ordinary candidate role selection and assignment, four confirmed answers, multipart upload, metadata and event deduplication, admin authentication, access restrictions, playback delivery and deletion were exercised through actual endpoints.
- Deletion returned storage GET 404, metadata DELETED, zero recording segments/events, and a deletion audit row; all four confirmed answers were unchanged.
- Original real-applicant readiness rechecked: all three flags false; retention/policy/support/storage unconfigured; zero database writes by readiness checker.
- Git ignore checks passed for generated lab credentials/runtime and the existing Firebase service-account file. No credential file is tracked. Source/tests are no longer accidentally ignored.
- Production frontend build used a process-only placeholder HTTPS API origin for validation; no environment file was rewritten and no deployment occurred. Original localhost frontend was restored afterward.

The first live harness run successfully changed the **new lab administrator's** temporary password,
then incorrectly expected the revoked session to remain authenticated. Its 401 was expected security
behavior. The harness now expects revocation and signs in again; the complete live workflow passes.
Any artificial media from the earlier interrupted test is subject to the lab's one-day cleanup;
the successful test's uploaded object was explicitly deleted and verified absent.

Backend startup also emitted the existing Nest legacy-wildcard route warning (`/api/v1/*` automatically
converted to a named wildcard). It did not prevent the verified HTTP flows. Browser console/network
inspection was not completed because browser-control approval timed out. Physical capture latency and
microphone quality therefore have no measured result in this report.

The live test's safe JSON report is in ignored `interviewos-infrastructure/recording-lab/runtime/http-verification.json`.
The physical test account is separate from automatically generated HTTP fixtures and remains available.
Use [the lab guide](../interviewos-infrastructure/recording-lab/README.md) for exact launch commands,
local credential-file instructions, test policy and the physical verification checklist.
