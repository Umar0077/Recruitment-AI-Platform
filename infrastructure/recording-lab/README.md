# Fictional recording lab

This is a separate local environment, **not an approved recording policy for applicants**.
The existing backend `.env`, real Firebase project, application database, and administrator
credentials are not changed. Never enter real applicant data here.

## Boundaries and test policy

| Setting | Lab value |
| --- | --- |
| Frontend | http://127.0.0.1:3100 |
| API | http://127.0.0.1:4100/api/v1 |
| PostgreSQL | Separate `interviewos_recording_lab` database on the existing local cluster |
| Firebase | `demo-interviewos-recording`, Auth emulator at `127.0.0.1:9199` |
| Storage | MinIO at `127.0.0.1:9100`, private `interviewos-recording-lab` bucket |
| Purpose | Verify consent, capture, upload, authorized review, and deletion with fictional participants |
| Media | Explicitly chosen screen/window/tab, camera, microphone; shared audio only when separately selected and actually supplied by browser |
| Access | Owning candidate can upload; authorized, scoped HR reviewer can request playback after interview ends; privileged staff can delete |
| Retention | One day for disposable test media only; immediate deletion in automated infrastructure test |
| Deletion | API verifies object removal before marking deleted; sweeps expired metadata every five minutes while API runs; MinIO expiration is additional eventual cleanup |
| Consent | Explicit recording checkbox and native source/device permissions; separate optional technical-event consent; stop at any time |
| Alternative | Continue interview without recording; contact the person running this local test for accommodations/deletion |
| Policy reference | `LOCAL-FICTIONAL-TEST-v1 (not an organization-approved applicant policy)` |

`operator@example.test` is a fictional marker, not a working support mailbox. The UI directs
testers to the local operator. Keep passwords, tokens, signed URLs, and recordings out of chat,
screenshots, commits, and public folders. The ignored `runtime/test-accounts.json` file contains
test-only passwords. For HR login, use `adminNextPassword` after the automated HTTP test has
completed the mandatory first-login password change. It changes **only the new lab account**.

The lab uses `127.0.0.1` instead of `localhost` so its host-scoped admin cookie cannot replace
the existing application's localhost cookie. Cookies do not isolate by port. Both frontend/API
origins must use the documented host consistently. HTTP is permitted only on local loopback;
production requires HTTPS and Secure cookies.

## Starting from a fresh checkout

Prerequisites: Docker Desktop running, the existing local PostgreSQL cluster running,
Node dependencies installed in frontend/backend and `../firebase`, Java available for Firebase tooling.
Run commands from the repository root unless a different directory is specified. Use separate
terminals for persistent servers. No command resets or drops a database.

```powershell
npm --prefix interviewos-backend run recording:lab:init
```

From `interviewos-infrastructure/recording-lab`:

```powershell
docker compose --env-file .env -f compose.yml up -d --build
node ../firebase/node_modules/firebase-tools/lib/bin/firebase.js emulators:start --only auth --project demo-interviewos-recording --config firebase.json
```

From repository root, after storage and emulator start:

```powershell
npm --prefix interviewos-backend run recording:lab:setup
npm --prefix interviewos-backend run build
npm --prefix interviewos-backend run recording:lab:backend
```

In a separate terminal:

```powershell
npm --prefix interviewos-backend run recording:lab:frontend
```

Setup creates the database if missing, deploys the existing migrations to it, seeds the official
question sets/standard roles, and creates fictional accounts. Re-running it does not reset
existing lab credentials or records. Emulator accounts are ephemeral: re-run setup after restarting
the emulator. Runtime files are ignored by Git; local filesystem access still grants access to
these disposable credentials. Do not share the directory or expose its ports to a network.

The frontend has a separate `.next-recording-lab` output directory. Production builds reject
`INTERVIEWOS_RECORDING_LAB=1`. The API ignores the ordinary `.env` in local-test mode and rejects
real databases/projects, production mode, remote storage, different buckets/origins/retention,
or enabled external AI. Only `@example.test` identities can begin lab recordings.

## Storage implementation details

MinIO is built from the pinned vendor source release
[`RELEASE.2025-10-15T17-29-55Z`](https://github.com/minio/minio/releases/tag/RELEASE.2025-10-15T17-29-55Z).
This local test image is not a recommendation for production infrastructure.
Its root storage credentials remain server-side in the isolated lab; the web client receives
only short-lived, object/part-specific capabilities. The console port is not published.
The bucket has no public policy, no public ACL, and has never been versioned.

Community MinIO uses [global CORS configuration](https://github.com/minio/minio/blob/master/docs/config/README.md)
instead of implementing the S3 bucket-CORS API. `RECORDING_S3_CORS_MODE=probe` is allowed only in
this strictly validated lab. Readiness checks real PUT preflight, GET CORS, exposed ETag, and
rejection of an unrelated origin, in addition to bucket privacy, versioning, and expiration.
It does not accept an unchecked CORS configuration or enable a production fallback.

Live inspection also showed that MinIO omits `AbortIncompleteMultipartUpload` from its returned
lifecycle rules. Compose sets its stale-upload expiration to 24 hours. In addition, the lab API
scans storage for multipart uploads older than 24 hours (including orphans without DB rows),
aborts them, and verifies they are gone. The scan runs every five minutes while the API is up,
bounded to 1,000 entries per sweep. Normal S3 mode still requires an explicit S3 abort lifecycle
rule. Expiration/deletion is eventual while services are stopped; stop services only after
finishing or cancelling capture, and verify cleanup on restart.

## Automated live check

Create a two-second artificial pattern and tone, with no access to physical devices. From the
lab directory:

```powershell
docker build -f Dockerfile.fixture -t interviewos-recording-lab-fixture .
docker run --rm --network none --mount "type=bind,source=$((Resolve-Path runtime).Path),target=/out" interviewos-recording-lab-fixture
```

From repository root:

```powershell
npm --prefix interviewos-backend run test:recordings:live
```

This creates fresh fictional candidates through the Firebase emulator and uses normal API
authentication, onboarding, assignment, answer submission, upload, HR authentication, playback,
and deletion endpoints. It verifies anonymous/cross-candidate denial, premature completion
rejection, multipart upload, ETag, exact CORS, database size/status, deduplicated fixture events,
short-lived byte-identical downloads/Range requests, CSRF denial, deletion audit, and preservation
of confirmed answers. Its safe report is `runtime/http-verification.json`. Media is deleted from
storage at the end; artificial local files remain in ignored runtime for decoder checks.
It does **not** prove native permissions, physical capture, speech quality, or browser-player behavior.

Use the dedicated `test:recordings`, `test:auth`, and transcript Jest configurations for unit tests.
Do not run the generic backend Jest configuration against the existing database: its historical
global setup resets fixtures. The `test:recordings:db` script uses fictional transaction fixtures
in the existing `_test` database and rolls them back.

## Physical Chrome/Edge checklist — tester action required

1. Open the lab candidate login; use `candidateEmail` / `candidatePassword` from the local runtime file.
2. Select CSR Fresher or FE Closer, proceed through welcome/instructions/consent, and start the interview.
3. Read the local test policy. Consent to media; separately consent to events if testing the timeline.
4. Click **Start Screen Sharing**. Choose only a test tab/window with fictional content.
5. Click **Enable Camera & Microphone** and operate the native prompts. Test denial/cancel once too.
6. Inspect the aspect-preserving screen/camera preview. Confirm sources, then **Start recording & continue interview**.
7. Give short fictional answers; confirm them. Check the persistent recording indicator.
8. Optionally enter fullscreen; use Esc to leave. Switch tabs and return. The neutral **Interview Focus Notice**
   must allow **Continue Interview** and must not change scores or fail the interview.
9. Stop sharing using the browser control. Check interruption warning, saved segment/recovery, and retained answers.
10. Finish all questions and wait for **Uploaded**. Keep the tab open through finalization.
11. Sign in at `/admin/login` with the lab HR account, complete mandatory password change if still required,
    open that interview's Recording tab, request playback, listen for microphone audio, and inspect video/events/duration.
12. Verify authorized deletion on **test media only**. Screen/camera devices must stop after completion/cancellation.

No webcam/microphone recording should be approved on behalf of an unconsenting person. Do not share
unrelated desktops, chats, credentials, or real candidate information. Browser/OS permission dialogs require
tester interaction. A mock, generated video, API download, or decoder test cannot substitute for this checklist.

Fullscreen is optional and cannot prevent OS shortcuts, tab changes, accessibility tools, or leaving the interview.
Shared-source audio depends on browser and source; TTS is not directly routed into this recording mixer, so do not
claim interviewer speech is captured without listening to the resulting recording. Microphone audio and optional
shared audio are mixed without speaker feedback. Unsent media is bounded in RAM and cannot survive page refresh.

Stop the API/frontend/emulator terminals when finished. `docker compose stop` stops storage without deleting
volumes. Do not use volume deletion or database reset commands. Real-applicant recording remains disabled until
the organization supplies an approved policy, retention duration, working support/alternative procedure, and
production-ready private storage.
