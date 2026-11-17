# Recording and branded loading

Recording is implemented but **off by default for real applicants**. Enabling it requires an organization-approved retention period, policy reference, support contact and a configured private bucket. Those real-applicant requirements remain unconfigured. A separate fictional local lab now has private storage and a clearly labelled one-day test cleanup policy; see [lab setup](../interviewos-infrastructure/recording-lab/README.md) and [verification report](recording-lab-verification.md). Do not enable real recording merely to remove the unavailable notice.

## Candidate experience

The connected interview first loads a policy/readiness check. Capture requires a separate unchecked consent checkbox, a browser screen-selection prompt and camera/microphone permission. A composited preview appears before the candidate starts recording. Optional shared audio and technical-event consent are separate unchecked choices. Full-display policy checks the reported `displaySurface`; unknown/tab/window sources are refused when full-display is required. Continuing without recording and requesting an alternative remain available.

Screen is fitted without stretching, with camera picture-in-picture, session reference and timestamp. During capture a persistent visible status/stop control is shown. The preview canvas is hidden after start to avoid displaying a recursive recording preview within the shared interview tab. The microphone meter reuses a clone of the capture audio track; browser SpeechRecognition manages its own input and cannot accept that stream.

Recording state is independent of interview state. Confirmed answers still save through the existing backend, and the active voice component remains mounted during query refreshes. On completion, capture stops and upload finalizes before navigation. Failure offers retry or continuation with saved answers; media failure never reverses answer confirmation. Stop/share interruptions save the available segment where possible. Another segment requires fresh consent and permissions. At most eight attempts per interview are accepted.

The upload queue slices media into 5 MiB parts, preserves only pending media in RAM, pauses recording at 10 MiB backlog, and rejects growth beyond 20 MiB or the configured total size. Three attempts use bounded backoff; explicit retry retains part numbers. Delayed oversized browser chunks cause a visible failure, never a false saved result. Unsaved media is **not** written to localStorage, IndexedDB or disk. Refresh/navigation loses the pending tail, releases devices, and leaves an incomplete upload for cleanup; the next session offers explicit removal of that incomplete capture. This is not cross-refresh resumable recording.

Consented technical events include visibility, focus, fullscreen and source interruptions. Repeated identical transitions are deduplicated. The server allowlists event types, limits events and timestamps, and enforces ownership and consent. Events use client timestamps and may be incomplete during disconnection/navigation. They are not misconduct evidence, are not sent to assessment providers, and never change interview scores or decisions.

## Exact backend configuration

| Environment variable | Default / accepted values |
| --- | --- |
| `RECORDING_MODE` | `approved` or `local_test`; local test requires the dedicated database, bucket, emulator, loopback origin, one-day test cleanup and disabled AI |
| `RECORDING_S3_CORS_MODE` | `bucket` or `probe`; HTTP probing is restricted to the isolated lab |
| `RECORDING_ENABLED` | `false`; boolean |
| `RECORDING_UPLOAD_ENABLED` | `false`; boolean |
| `RECORDING_MONITORING_ENABLED` | `false`; boolean; candidate must also opt in |
| `RECORDING_CAMERA_ENABLED` | `true`; boolean |
| `RECORDING_SCREEN_REQUIREMENT` | `selected_surface` or `full_display` |
| `RECORDING_RETENTION_DAYS` | `0`; 0 disables availability; approved 1–3650 days required |
| `RECORDING_POLICY_REFERENCE` | empty; organization-approved reference, maximum 200 characters at consent |
| `RECORDING_SUPPORT_EMAIL` | empty; valid support contact required |
| `RECORDING_MAX_MB` | `256`; 10–2047 MiB |
| `RECORDING_WIDTH` | `1280`; 640–1920 |
| `RECORDING_HEIGHT` | `720`; 360–1080 |
| `RECORDING_FPS` | `20`; 15–24 |
| `RECORDING_VIDEO_BITRATE` | `1800000`; 500000–4000000 bits/sec |
| `RECORDING_S3_ENDPOINT` | empty for AWS; otherwise HTTP(S) origin; HTTP only on localhost in non-production |
| `RECORDING_S3_REGION` | `us-east-1` |
| `RECORDING_S3_BUCKET` | empty; dedicated private bucket |
| `RECORDING_S3_ACCESS_KEY` / `RECORDING_S3_SECRET_KEY` | empty; backend secrets only |
| `RECORDING_S3_PATH_STYLE` | `true`; set for your S3-compatible provider |

Boolean parsing follows the existing backend: `true` or `1` enables, other values disable. No frontend recording secret or enable flag is needed: the authenticated policy endpoint is authoritative. Demo Mode does not upload or activate real recording. The existing `MEDIA_STORAGE_ENABLED` flag controls the older media abstraction, not this pipeline.

## Private storage setup

Use a dedicated private, **never-versioned** S3-compatible bucket. Version-enabled or suspended buckets fail readiness because a delete marker does not erase historic media. Public ACLs, wildcard allow principals and `NotPrincipal` allow policies fail readiness. Configure encryption at rest and restrict bucket configuration changes to infrastructure administrators. Use HTTPS in deployment; never expose storage access keys to the frontend.

Readiness also requires bucket lifecycle rules applying to all objects or the `interviews/` prefix: expire objects no later than the approved retention period, and abort incomplete multipart uploads after at most one day. The backend independently checks expiry before playback, sweeps up to 50 expired or abandoned recordings every five minutes when storage is configured, verifies deletion, and removes segments/events. Keep a backend instance running; storage lifecycle is the backup for downtime or an orphaned external request. Monitor records whose expiry has passed but `deleted_at` is null, since failed cleanup remains retryable rather than being falsely marked deleted. Minimal consent/deletion/audit metadata remains; its retention follows the organization's existing audit policy.

The backend storage identity needs HeadBucket/ListBucket, GetBucketAcl, GetBucketPolicy, GetBucketCORS, GetBucketVersioning, GetBucketLifecycleConfiguration, PutObject/multipart creation and completion, ListMultipartUploadParts, AbortMultipartUpload, GetObject/HeadObject and DeleteObject for the dedicated prefix. It does not need permission to make the bucket public. Providers lacking the required privacy/lifecycle inspection APIs fail closed.

Configure CORS with each exact `FRONTEND_ORIGINS` origin, methods PUT and GET/HEAD, allowed request headers needed by uploads, and expose `ETag`. No wildcard origins are needed. Parts use 60-second signed URLs with signed content length and omit browser cookies. Server completion lists actual parts and checks the final object's size and media type. Credentials/object keys/upload IDs are never accepted from client input. URLs are capabilities: do not log them or share them. Configure access-log query redaction and `Referrer-Policy: no-referrer` at the web proxy. Playback API responses have no-store and no-referrer headers.

## API and database

All `/api/v1/recordings` routes require existing authentication. Candidate upload/event operations additionally require `interviews:take` and session ownership. Staff lists apply existing application/recruiter scope. Playback requires `interviews:review`, verified upload, unexpired retention, and an ended interview; it returns a 60-second signed URL. Only `users:manage` can delete completed recordings; candidates can cancel their own incomplete attempts. Existing staff-cookie Origin/custom-header CSRF checks apply to recording mutations. No auth bypass or new application permission is added.

- `GET /recordings/policy`: availability and non-secret configuration.
- `GET /recordings?sessionId=UUID`: allowlisted metadata and technical timeline.
- `POST /recordings`: consented multipart initiation with idempotency UUID.
- `POST /recordings/:id/parts`: reserve bounded part and sign upload.
- `POST /recordings/:id/complete`: verify parts/object and mark uploaded idempotently.
- `POST /recordings/:id/events`: bounded allowlisted technical observation.
- `GET /recordings/:id/playback`: scoped, audited, expiring playback capability.
- `DELETE /recordings/:id`: authorized, verified storage deletion/cancellation.

Migration `202611180003_interview_recordings` adds only `interview_recordings`, `recording_segments`, `interview_session_events`, indexes and foreign keys. Video bytes never enter PostgreSQL. The deployment guard allows only this migration against existing local development/test databases. It does not seed or reset data. For managed production, review and deploy through the normal migration process after configuring storage/policy.

## Loader

`InterviewOSLoader` reuses the unchanged existing `BrandMark`. The project currently has no separate official InterviewOS image configured (`BRAND.logoSrc` is null); the existing mark remains the source of truth. CSS rotates it once every 1.8 seconds with a restrained halo and theme-aware colors. Reduced-motion settings disable rotation. Route boundaries cover candidate/admin trees, while existing dashboard skeletons remain. Button loading disables repeated submissions; inline/modal/fullscreen variants are available. There are no fake delays, capture effects, React frame updates, or new WebGL scenes. Unmount removes the animation immediately so completion never waits on a cosmetic exit.

## Browser limits and verification

Screen capture needs a secure context and a direct user gesture. Source/audio choices differ by browser and OS. This implementation selects a supported MediaRecorder MIME type; unsupported APIs offer continuation/alternative assessment. Browser TTS does not expose an audio stream, so it is **not guaranteed** in recordings. Microphone and optional shared audio use a shared Web Audio destination with gain control/compression and no local speaker routing; authoritative question text remains available to reviewers. Canvas rendering may throttle when the page is hidden/minimized; audio/video synchronization under those conditions needs real hardware testing.

Automated suites use fictional streams, fake storage and rollback-only database fixtures. They do not prove physical capture, microphone quality, synchronization, signed S3 upload compatibility, or Chrome/Edge/Firefox/Safari interoperability. Before enabling: run an explicitly consented fictional interview on supported Chrome and Edge; check denial, stopping sharing, camera/mic unplug, minimized/tab changes, offline retry, last-answer finalization, refresh, private playback/seek and deletion. Test Firefox/Safari capability fallbacks and 360/390/430/768/1024/1440/1920px in both themes. No universal compatibility claim is made.

Safe commands: frontend `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`; backend `npm run test:recordings`, `npm run test:auth`, `npx jest --config jest.transcripts.config.js --runInBand`, `npm run test:recordings:db`, `npm run typecheck`, `npm run lint`, `npm run build`. Do not use the backend's default test command on preserved databases: its legacy global setup resets the test database.

### Verification recorded during implementation

- Frontend: 217 existing/new tests passed in the full run, plus 3 added consent tests passed (220 total); 8 opt-in Firebase emulator tests skipped. The focused recording/loader suite subsequently passed all 21 tests. TypeScript, ESLint and the production build passed.
- Backend: 100 authentication, 25 interview/transcript and 32 recording/storage tests passed. TypeScript, ESLint and the production build passed.
- Local PostgreSQL: the additive migration was applied to development and test databases with no resets/seeds/application-record updates. Recording, assignment, transcript, profile and administrator integration fixtures passed and rolled back. The recording storage dependency in that integration test is a test double, not a live bucket.
- Real HTTP + real test PostgreSQL: administrator login 200, mandatory-change session 200, password change 200 with session revocation, new login/session verification 200, invalid CSRF 403, post-logout session 401. Existing credentials were unchanged.
- Production-mode backend startup/readiness passed (1.627s startup; database ready HTTP 200 in 13ms). Real Firebase project remained `ai-recruitment-4d3e4`. Anonymous recording policy returned 401; anonymous admin session returned 401 as expected.
- Browser: admin login reached a usable signed-out state without an application error or browser warning/error log. DOM layout checks at 360/390/430/768/1024/1440/1920px found no horizontal overflow; the 390px light-theme login was visually inspected, and the original dark theme/viewport were restored. These checks do not certify the authenticated recording/review screens at every breakpoint.
- The existing candidate browser session also resolved to the role-selection onboarding page without warning/error logs. No role was chosen and no capture was started.
- The initial frontend build failed with a stale `.next` entry; a clean retry then needed network access to the existing Google Fonts dependency. The final production build succeeded with the stale dev server stopped. Development servers were restored afterward.
- Read-only configuration check confirmed recording/upload/monitoring disabled, no approved retention/reference/support contact, and no storage credentials. No real capture, object upload or real-candidate AI request was made. Live storage, physical devices, synchronization and the full browser compatibility matrix remain commissioning checks before activation.

References: [MDN screen capture permissions](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia), [MDN MediaRecorder chunk timing](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/dataavailable_event), [AWS multipart lifecycle cleanup](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpu-abort-incomplete-mpu-lifecycle-config.html), [AWS multipart abort verification](https://docs.aws.amazon.com/AmazonS3/latest/API/API_AbortMultipartUpload.html).
