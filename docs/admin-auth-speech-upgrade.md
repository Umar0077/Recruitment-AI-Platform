# Administrator authentication and speech integrity

Implementation and verification: 17 November 2026. No production deployment or database reset.

Subsequent investigation: [admin session-check and cookie-hostname correction](admin-session-check-fix.md). The administrator has since been initialized; the follow-up read-only check found an active account awaiting its first password change.

## Administrator setup

The API-mode administrator portal now uses PostgreSQL credentials and opaque server-managed sessions. Candidates continue using Firebase Google/email-password authentication, verification and reset. A Firebase identity cannot access staff APIs, even if its historical database row has staff roles. Existing identities, role definitions, interviews and assignments are retained.

From the project root **or** `interviewos-backend`, run in your own interactive terminal:

```powershell
npm run admin:bootstrap
```

Enter a unique temporary password at the hidden prompt: 14–128 characters, uppercase, lowercase, number and symbol. The bootstrap creates `admin@balitech.com`, display name `InterviewOS Administrator`, with the existing `SUPER_ADMIN` role. A transaction-scoped advisory lock and persistent marker make it one-time/idempotent. It is not part of ordinary seeding and has no public endpoint. No plaintext or reversibly encrypted password file is produced. The command refuses noninteractive password input; passwords are not accepted in arguments or environment variables.

Open [Administrator Access](http://localhost:3000/admin/login). The first login is restricted to viewing the session, changing the temporary password and logout. Change the password at `/admin/settings/security`; all sessions are revoked and a new sign-in is required. The code does not retrieve or display existing passwords.

**Current setup status:** the schema is applied; at the last read-only check, the initial administrator had not yet been initialized. The root-level command shortcut was added after the operator reported running the backend-only command from the root. Bootstrap/password-change behavior was verified using fictional rollback fixtures, not the real administrator password.

Settings links to Account Security and Admin Accounts. `/admin/settings/accounts` permits only Super Admin sessions to create HR_MANAGER, RECRUITER and REVIEWER credentials, change those roles, disable/enable accounts, revoke sessions and view recent audit events. Self-editing and modifying Super Admin accounts through this screen are rejected. Legacy user-management routes reject credential-backed staff changes, preventing a bypass. The existing `admin:grant` utility does not enable Firebase staff login. Historical staff data remains; no automatic email-based credential migration or identity merge was performed.

Operator recovery, from the backend folder:

```powershell
npm run admin:recover -- admin@balitech.com --confirm-recovery
```

This requires the server operator's database access, hidden strong-password input and an explicit recovery flag. It resets the temporary lockout, requires a password change, revokes all sessions and records an audit event. It does not reactivate disabled accounts. There is deliberately no unauthenticated reset/registration API or misleading email-reset link.

## Security and route contract

| Route group | Accepted authentication |
| --- | --- |
| `POST /api/v1/admin-auth/login` | Public credential entry, rate limited, exact Origin + `X-Admin-Request: 1` required |
| `/api/v1/admin-auth/me`, logout, change-password, revoke-sessions | First-party admin cookie only |
| `/api/v1/admin-auth/accounts`, accounts/:id, audit | Admin session + PostgreSQL SUPER_ADMIN role |
| Existing staff APIs | Admin session + existing permission and access-scope checks |
| Candidate APIs | Verified Firebase bearer + candidate role/permissions and ownership checks |
| Shared interview detail/progress | Owning candidate or appropriately scoped staff permission |
| Existing explicitly public health/integration routes | Existing protections retained |

Argon2id uses 64 MiB memory, three iterations and one lane. Sessions use 32 cryptographically random bytes; only SHA-256 token hashes are stored. Cookies are HttpOnly, SameSite=Strict, host-only, path `/`, Secure in production. Absolute expiry is eight hours; idle expiry is 30 minutes. Five failed attempts lock an account for 15 minutes. Login is limited to ten requests/minute/IP; password changes to five/minute/IP. Existing Nest throttling is in-process: a multi-instance production deployment needs shared/edge rate limiting. Unknown-account attempts appear as sanitized HTTP 401 logs; known-account failures are additionally audited without submitted email/password content.

Mutations require an exact configured origin and custom header; production login/mutations also require `req.secure`. Cookie sessions never fall back to Firebase, and the admin frontend never sends a Firebase bearer token or retries a failed login automatically. Password change checks the current password, rejects immediate reuse, rehashes and revokes all sessions. Disabled accounts fail session verification. Audit/API outputs exclude hashes and tokens. Request logging excludes bodies/cookies; raw database errors are suppressed because they can contain query arguments.

No new admin password, signing-secret or bootstrap environment variable was introduced. Session limits and password policy above are explicit implementation constants. Relevant supported variables are:

| Variable | Supported values / purpose |
| --- | --- |
| `NODE_ENV` | `development`, `test`, `production`; enables Secure cookies in production |
| `AUTH_MODE` | `firebase`, `test`; controls candidate authentication, **not** admin sessions; test mode is forbidden in production |
| `AUTH_ALLOWED_PROVIDERS` | Comma-separated `google.com,password` only, for Firebase candidates |
| `FRONTEND_ORIGINS` | Exact comma-separated frontend origins; no wildcard for admin CSRF |
| `TRUST_PROXY` | Boolean; use only behind the intended single trusted reverse proxy, which must overwrite forwarded headers |
| `DATABASE_URL`, `TEST_DATABASE_URL` | Existing app database and separate test database |
| `JOBS_IN_PROCESS` | Existing maintenance switch; disabled only in the verification server process |
| `GOOGLE_APPLICATION_CREDENTIALS`, `FIREBASE_PROJECT_ID` | Existing candidate Firebase configuration, unchanged |
| `FIREBASE_AUTH_EMULATOR_HOST` | Existing development-only demo-project emulator configuration, unchanged |
| `NEXT_PUBLIC_APP_MODE` | `api` or `demo`; demo never sends credential API requests |
| `NEXT_PUBLIC_API_BASE_URL` | Backend base URL; production build requires HTTPS |

Production must supply the real HTTPS API URL and exact frontend HTTPS origin, host frontend/API on the same site for Strict cookies, terminate TLS securely and configure proxy trust correctly. Do not deploy the `.invalid` verification URL. Firebase candidate configuration and approved production credentials remain necessary for real candidate sign-in. No production browser/cookie rollout has been verified.

## Speech audit and changes

The current provider is browser Web Speech through the existing STTProvider interface. Recognition was already correctly replacing results by index, retaining segment order, bounding automatic restarts, awaiting finalization and preventing overlapping microphone/TTS ownership. These mechanisms and their tests were preserved. The selected microphone/processing constraints apply to the diagnostic getUserMedia stream; the browser recognition engine controls its own input. Selecting a device does not guarantee that Web Speech uses it. Supported echo cancellation, noise suppression and gain-control constraints remain conservative and browser-dependent.

An actual provenance problem was found: captured interim words were being labeled as part of the original finalized transcript. New captures now preserve the engine's finalized text, including segment whitespace, separately from explicitly marked unfinalized words. Segment boundaries are joined with a space; no words are inferred. Earlier stored captures are not rewritten. The browser provider also reports a low-confidence review hint when a final segment has an available, positive confidence below 0.6. Missing/zero confidence is treated as unavailable, not measured accuracy.

Candidate review retains the captured draft, optional local formatting preview, edit, retry, restore original and explicit confirmation. Local formatting changes only spacing, initial capitalization and terminal punctuation. It does not guess terminology, remove repeated spoken words, expand acronyms or rewrite weak answers. Duplicate engine events are handled by result index, not by deleting repeated content. New original provenance uses `format-v2-final-separated`; unfinalized words are separately persisted in metadata and visible to authorized review. Original, cleaned and confirmed versions remain distinct; only confirmed text is authoritative for assessment. The UI waits for successful NestJS/PostgreSQL persistence before advancing. Duplicate confirmation is idempotent; a failed save preserves the draft.

No automatic paraphrasing was added. Text-only cleanup cannot determine whether a different word was actually spoken, so uncertain words must be corrected by the candidate. Retention policy is not invented or changed; access uses existing interview scopes. An approved organizational retention period and any deletion workflow remain operational requirements.

## Fictional LLM evaluation

`npm run speech:evaluate:fictional` in the backend sends one hard-coded fictional text fixture; it has no candidate query or arbitrary input option. It uses the existing OpenRouter privacy gate and usage reservation path. A strict JSON object schema and lexical validator reject extra fields, empty/oversized output, control characters, added/removed/reordered words, changed numbers, negations, contractions and symbols. It allows conservative formatting only. This evaluation is **not wired to a candidate cleanup endpoint**; a validated response is not automatically a confirmed answer.

Observed live result: configured `nvidia/nemotron-3.5-super-vl:free`, HTTP 200, provider request latency **5,206 ms**, total evaluation **5,331 ms**, **706 tokens**, usage status `SUCCEEDED`, structured/faithfulness validation passed. The formatting suggestion differed from input. No candidate records were read or modified; one necessary request-usage row was recorded. Two initial harness attempts failed before any provider request because dependency injection metadata was unavailable in the script runner; the final harness constructs its dependencies explicitly. No model fallback or extra completion retry was used.

`AI_ASSESSMENT_MODE` supports exactly `synthetic_test_only`, `approved_production`, `disabled`. `AI_ASSESSMENT_ENABLED=false` or disabled mode blocks requests. Real data additionally requires approved_production, a non-free model, an exact `AI_APPROVED_MODEL` match and nonempty `AI_PROVIDER_APPROVAL_REFERENCE`. The live gate returned **realCandidateProviderAllowed=false**. A paid model is not approval by itself.

## Provider research and measurement plan

No representative Pakistani-English recordings were supplied. No recognition-accuracy improvement, accent benchmark, measured STT latency or physical-noise reduction is claimed. The successful LLM test evaluates text formatting, not speech recognition.

| Option | Accuracy / Pakistani English | Latency and hardware | Cost, privacy and scale | Integration assessment |
| --- | --- | --- | --- | --- |
| Current browser STT | Unknown on this recruitment corpus; compare existing en-US/en-GB/en-IN choices, without treating India as equivalent to Pakistan | Browser/network/vendor-dependent; no private server hardware | No added app provider fee; browser vendor processing/availability must be covered by consent | Existing lifecycle and fallback; least engineering change |
| Private faster-whisper | Multilingual Whisper candidate for controlled evaluation; no Pakistani-English advantage established here | CPU int8 and GPU modes; model/precision/batching trade memory against throughput | Self-hosting compute/operations costs; audio can stay within controlled infrastructure | Add authenticated audio upload/streaming adapter, queue, duration/size limits, timeout/cancellation and deletion controls; moderate-to-high effort |
| Azure Speech | en-IN/en-GB/en-US support and customization are documented; locale availability does not prove Pakistani-accent accuracy | Hosted streaming/batch; actual regional latency needs measurement | Metered service; regional rates/contract and retention approval required | SDK/REST adapter, short-lived authorization, consent and quota controls; moderate effort |
| Deepgram private deployment | Requires independent accent/domain evaluation | GPU engine can scale separately from API; capacity planning and licensed deployment required | Commercial license plus infrastructure; vendor documents usage/license metadata leaving the private deployment | Docker/Podman/Kubernetes and GPU operations; high setup effort |

Sources: [faster-whisper implementation and hardware benchmarks](https://github.com/SYSTRAN/faster-whisper), [Azure Speech language support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support), [Azure pricing](https://azure.microsoft.com/en-us/pricing/details/speech/), [Deepgram private deployment architecture and data handling](https://developers.deepgram.com/docs/self-hosted-introduction). The integration/effort judgments are engineering inferences; vendor benchmarks are not InterviewOS measurements.

Before changing providers, collect consented fictional scripts recorded by representative Pakistani-English speakers at natural slow/normal/fast rates. Include short and multi-minute responses, CRM/QA/FE terminology, acronyms, dates, decimals, targets, negations, objections, silence, office noise, clipping and unplug/reconnect cases. Independently transcribe ground truth. Run the same clips through browser and authorized private/hosted candidates; compare word-error rate, critical-number/negation substitutions, dropped/duplicated segments, finalization p50/p95 latency and failures by condition. Use held-out speakers; review meaning-critical errors separately from aggregate WER. Do not upload private applicant recordings to an unapproved service or switch providers without measured improvement.

## Verification results and limits

| Check | Result |
| --- | --- |
| Frontend TypeScript and ESLint | Passed |
| Backend TypeScript and ESLint | Passed |
| Backend production build | Passed |
| Frontend production build | Passed, 39 generated pages, API mode with temporary `https://interviewos.invalid/api/v1`; original HTTP configuration correctly failed the production safeguard |
| Frontend tests | 191 distinct tests passed across full run plus corrected-copy rerun; eight opt-in Firebase-emulator tests skipped because emulator was not running |
| Backend isolated tests | 100 auth/cleanup + 25 transcript/assignment + 70 usage/assessment + 9 access/performance = 204 passed; local HTTP authorization subset rerun with loopback permission |
| Real PostgreSQL integration | Admin auth/bootstrap/recovery, Firebase profile synchronization, transcript persistence and both onboarding tracks passed; fictional transactions rolled back |
| Live backend | Health 200; anonymous admin endpoints 401; bearer on admin-auth 401; bad-origin login 403; fictional unknown account generic 401 |
| Browser | Administrator Access renders without Google/signup; fictional failed login displays generic error, clears password and re-enables Sign In |
| Secrets | Firebase service account path is Git-ignored; no file under backend secrets is tracked; no credential values printed or committed |

Tests did not reset or seed the databases. The additive migration created only administrator credentials/sessions and indexes. Existing candidate/application/interview records were preserved. During the browser verification server run, automatic maintenance was disabled through a process-only override; `.env` was not changed.

Still requiring the operator/user: initialize the real administrator with the hidden prompt, perform its first password change, verify successful real browser login/account management, supply the production HTTPS topology/credentials and perform representative physical-microphone testing. Automated candidate Google/password tests and existing persistence checks passed, but no new live real-Firebase sign-in or email delivery was performed in this task. No provider switch, paid STT service or real-candidate LLM cleanup is enabled.
