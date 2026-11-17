# InterviewOS: speech, API Usage, performance and verification report

Date: 17 November 2026. This report covers the current improvement request in the existing application. It does not treat older implementation logs as evidence that a check was repeated today.

**Implemented and verified locally.** Both production builds, TypeScript/lint checks, 174 frontend tests, 160 isolated backend tests and 8 actual Firebase SDK emulator tests passed. Safe database integrations and the fictional browser interview flow passed. Physical speech accuracy and the cross-browser matrix remain unverified. No production deployment was performed.

## A. Speech recognition improvements

The application uses browser `SpeechRecognition`/`webkitSpeechRecognition`, with a separate `getUserMedia` stream for microphone diagnostics. It does not add a paid STT service. The provider and React hook now own their start, active, stop, error and cleanup phases explicitly.

The main transcription defect was treating recognition events as text to append without fully respecting changed result indexes. Results now retain unchanged segments, replace changed interim results, distinguish final from interim words, and preserve chronological text across bounded browser restarts. Repeated final events do not duplicate an answer. Unfinalized words remain visible and are identified for candidate review rather than presented as verified final recognition.

Recognition starts with continuous/interim results enabled and defaults to `en-US`, three alternatives and three permitted restarts. The existing audio settings expose `en-US`, `en-GB` and `en-IN`, alternatives from one to three, and restarts from zero to six. Restarting is bounded, occurs only while capture is still wanted, and never follows intentional stop/cancellation. Permission denial, missing input, network failure, unavailable language, missing start/end events and unexpected termination have explicit recovery paths. Watchdog timers detect missing browser events; they do not pretend that recognition finalized text.

Microphone initialization now shares repeated requests for the same device. Cancellation resolves a pending `open()` immediately as unsuccessful. If the browser later grants that abandoned request, its stream is stopped. Unmount, device disconnection and selection changes release streams, ended handlers, level-meter animation frames and AudioContext resources. Failed device enumeration or optional metering does not reject a functioning microphone. A removed saved device falls back to the default once while the request remains active. An unanswered microphone permission request now fails after 15 seconds with retry/typed recovery; both equipment and interview screens allow explicit cancellation. This timeout was verified in the actual in-app browser, where no permission result arrived.

The UI shows interim text, speech activity, microphone initialization/cancellation, capture, processing, review, errors and typed fallback. Recognition starts only after interviewer playback is stopped; voice testing is locked during capture. The candidate reviews and explicitly confirms the answer before submission. Each question uses its own configured response duration. Timeout preserves captured words and presents review rather than discarding the answer.

Original recognition, optional locally formatted text and candidate-confirmed assessment text are distinct. Local formatting only normalizes spacing, capitalizes the first character and adds terminal punctuation when missing. It does not correct technical claims, infer missing words, remove uncertainty or call an LLM. Backend transcript records retain provenance separately from the confirmed answer; the confirmed answer remains the assessment input. A regression also covers recording an answer, cancelling replacement capture, then finishing by typing: the retained original and formatting metadata still accompany confirmation.

No silence-based automatic cutoff or new VAD model was added. Existing browser speech activity and level diagnostics provide feedback without inventing a recognition improvement. The selected diagnostics device does not force browser SpeechRecognition to use that device; the interface now explains this distinction and that processing settings apply to the diagnostics stream.

## B. Text-to-speech improvements

Browser `SpeechSynthesis` remains the TTS provider. Playback has one owner, cancellation settles pending promises even if the browser omits a cancellation event, and stale completion callbacks cannot advance a later question. Sentence transitions follow utterance `onend` events without artificial playback gaps. Missing-start/end watchdogs fail playback rather than silently declaring completion. Pause/resume suspends and restores the watchdog where supported.

Voice loading handles delayed `voiceschanged` events and a bounded empty-voice result. Available English voices are ranked using the selected locale and available voice metadata. A missing saved voice falls back to an available English voice; a female/natural voice is preferred when its name indicates it, without claiming that every device provides one. Default rate is 0.95, pitch 1.0 and volume 1.0; the existing settings expose adjustments.

The initial play/replay action invokes synthesis from the user gesture. Blocked playback offers Enable Audio and leaves the question readable. Mute, replay, language changes, navigation and unmount invalidate older playback. Microphone controls remain unavailable while the interviewer speaks. Strict Mode cleanup and replay races are covered by automated tests.

The in-app browser actually exposed Microsoft Zira (en-US). Its sample and practice question reached completion; replay, pause/resume, mute, and the microphone lock during playback were verified through the UI. Audible quality was not assessed by a human listener. Actual voice availability, recognition support and vendor processing remain browser/device dependent. The implementation does not establish equivalent behavior across Chrome, Edge, Firefox and Safari. The current browser walkthrough uses the in-app browser; physical microphone recognition quality and a cross-browser matrix remain manual follow-up items. See the browser documentation for [SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition), [SpeechSynthesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis) and [microphone permission/security requirements](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

## C. API Usage dashboard

The separate **API Usage** navigation item opens `/admin/api-usage` using the existing admin layout, cards, charts and table components. API mode requires the existing `users:manage` permission in both navigation/query gating and the backend controller; no role or permission was added. Requests are cached by signed-in user. Unauthorized users cannot obtain billing metadata by calling the endpoint directly. Demo mode uses explicitly labeled fictional samples and makes no provider calls; API errors never fall back to fictional data.

The dashboard includes UTC today/current-month totals, selectable Today/7-day/30-day/current-month reports, daily charts, monthly trends, success/failure/pending counts, retries, HTTP 429 counts, known tokens, provider-reported cost, mean measured latency, local request health, configured model metadata, provider allowance/credit information and paginated request history. History filters combine model, feature, status and inclusive UTC dates. Custom dates are limited to 366 days and page size to 100. The overview and history filter scope are described separately.

| Endpoint under `/api/v1/api-usage` | Behavior |
| --- | --- |
| `GET /overview?range=today\|7d\|30d\|month` | SQL aggregates, daily buckets, twelve calendar-month buckets, application budget and recent request health |
| `GET /history` | Bounded, deterministically ordered history with `page`, `limit`, `range`, `from`, `to`, `model`, `feature`, `status` |
| `GET /provider` | Cached/deduplicated read-only key, account-credit and public-model metadata |

Every completion attempt reserves one existing `llm_request_usage` row and updates that row on success/failure. A retry is a separate attempt. New nullable columns record input tokens, output tokens, reported USD cost and an internal provider request ID. Composite indexes support model/status/feature plus creation time. Historical unknown split tokens/cost remain null. Reported zero cost is preserved as zero, including when a charged provider response fails structured-output validation. Coverage counts distinguish complete measurements from partial history. Missing measurements remain unavailable in cards, charts and accessible data tables; legacy positive combined-token totals are retained.

The additive `202611170001_api_usage_telemetry` migration was applied through the guarded deployment helper to the existing local development and test databases. It adds columns/indexes only. No reset, seed, destructive migration, application-record rewrite or permission change was performed in this request. Integration tests use fictional rows within rollback transactions and verify that those rows do not remain. The separate performance verifier enforces a read-only transaction and uses SELECT-only CTE fixtures.

OpenRouter metadata uses supported `/key`, `/credits` and `/models` GET endpoints, with an eight-second timeout per GET, redirects rejected, five-minute caching and shared concurrent loads. No completion is used to populate the dashboard. Only allowlisted scalar metadata reaches the API; raw provider bodies, labels and error messages do not. History contains no candidate/report identifiers, prompts, answers or transcripts.

Application daily protection limits are separate from provider free-request quota, account credits and API-key monetary caps. Exact free-request counts are displayed only when supplied. A free-quota reset countdown requires an explicit free-quota timestamp; key expiration and effective spend-budget reset are separate. The effective budget may belong to a workspace/member/guardrail, so it is not labeled as the API key's own reset. An ordinary inference key may lack access to account credits; unavailable credits are reported without asking for broader key privileges. No free-credit balance, fixed quota tier or unreported reset is invented. Model pricing comes from catalog numbers, not its `:free` suffix. Official references: [limits](https://openrouter.ai/docs/api_reference/limits), [current key](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key), [credits](https://openrouter.ai/docs/api/api-reference/credits/get-credits), [models](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties), [usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting).

### Configuration checked against implementation

The API Usage feature introduces no new environment variables. The exact supported assessment mode values are **`synthetic_test_only`**, **`approved_production`** and **`disabled`**. These are independent of `AUTH_MODE` and the frontend app mode.

| Existing OpenRouter/assessment variable | Implementation default or constraint |
| --- | --- |
| `OPENROUTER_API_KEY` | Backend secret; value never included in this report |
| `OPENROUTER_BASE_URL` | Validated as `https://openrouter.ai/api/v1` |
| `OPENROUTER_MODEL` | Default/current selected model `nvidia/nemotron-3.5-super-vl:free`; no model change |
| `OPENROUTER_SITE_URL`, `OPENROUTER_APP_NAME` | Request attribution; defaults `http://localhost:3000`, `InterviewOS` |
| `AI_ASSESSMENT_ENABLED` | Boolean, default true |
| `AI_ASSESSMENT_MODE` | Default `synthetic_test_only`; the three exact values above |
| `AI_APPROVED_MODEL`, `AI_PROVIDER_APPROVAL_REFERENCE` | Exact model approval and nonempty external approval reference for permitted production sharing |
| `AI_REQUEST_TIMEOUT_MS` | Default 60,000; range 100–120,000 |
| `AI_MAX_REQUESTS_PER_DAY` | Default 40; range 1–10,000 |
| `AI_MAX_REQUESTS_PER_MINUTE` | Default 15; range 1–100 |
| `AI_MAX_RETRIES` | Default 2; range 0–2 |
| `AI_MAX_CONCURRENT_REQUESTS` | Default 1; range 1–4 |
| `AI_REQUIRE_HR_APPROVED_RUBRIC` | Must remain true |

The provider gate refuses actual candidate data unless enabled in `approved_production`, the exact approved model matches, a review reference exists, and the selected model is not a `:free` endpoint. Stored interviews are treated as real data even when an `isSample` flag exists. The live metadata check returned `candidateDataAllowed=false`; candidate information was not sent to the model. **Total LLM completion calls made during this request: zero.** This report does not count a metadata GET as a generation/JSON-output smoke test.

Backend Firebase variables remain `AUTH_MODE` (`firebase` or development/test-only `test`), `FIREBASE_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS`, the alternative inline pair `FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY`, `FIREBASE_AUTH_EMULATOR_HOST`, and `AUTH_ALLOWED_PROVIDERS` (`google.com` and/or `password`). File and inline credentials cannot be combined. Real mode rejects emulator/test tokens; emulator mode remains development/test only with a `demo-` project and no real credentials. The live credential/project check verified `ai-recruitment-4d3e4` and Google/email-password provider configuration without exposing credential values.

Frontend mode is `NEXT_PUBLIC_APP_MODE=demo|api`. API mode requires `NEXT_PUBLIC_API_BASE_URL`; production builds require HTTPS. Real Firebase web sign-in needs `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID` and `NEXT_PUBLIC_FIREBASE_APP_ID`; `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` is optional. Keep `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST` unset for real sign-in, authorize the actual frontend domain in Firebase, align backend `FRONTEND_ORIGINS`, and rebuild after changing public build-time configuration. Backend service-account JSON never belongs in frontend variables. Existing Firebase setup/security details are in [firebase-readiness.md](../interviewos-backend/docs/firebase-readiness.md); its earlier test counts are historical, not this report's current totals.

## D. Performance measurements

The two development runs used Windows x64, Node 23.10.0, Next.js 15.5.29, React 19.3.1, an Intel i5-12450H with 12 logical CPUs and 16 GB RAM. The workspace is on OneDrive. Each run started a separate demo-only Turbopack server on port 3102, requested the same routes in the same order, then stopped its process tree. Existing `.next` and filesystem caches were retained. Each route had one initial request and three warm samples. The API Usage route was appended only to the second run.

| Measurement | Before | After |
| --- | ---: | ---: |
| Child launch to ready output | 21,237 ms | 35,990 ms |
| Next.js internal ready time | 13.3 s | 17.1 s |
| Login compile | 20.4 s | 11.8 s |
| Candidate interview compile | 1,011 ms | 2,000 ms |
| Admin compile | 3.3 s | 3.6 s |
| Landing compile | 1,750 ms | 1,929 ms |
| Login initial / warm median HTML | 22,296 / 370 ms | 13,574 / 289 ms |
| Candidate interview initial / warm median HTML | 1,351 / 329 ms | 2,606 / 700 ms |
| Admin initial / warm median HTML | 3,736 / 318 ms | 4,216 / 590 ms |
| Landing initial / warm median HTML | 2,214 / 788 ms | 2,425 / 808 ms |
| API Usage compile | Not present | 1,195 ms |
| API Usage initial / warm median HTML | Not present | 2,011 / 848 ms |

All 36 HTTP samples returned 200. The results are mixed: login was faster, while startup and other existing routes were slower in the second run. Machine load and retained caches were not controlled sufficiently to attribute the difference to a particular change. **No general frontend speedup is claimed.** These are server HTML/compile measurements, not first paint, hydration, interactive chart render or client navigation timings. Raw header/HTML samples are in [baseline.json](performance/baseline.json) and [after.json](performance/after.json).

Candidate access probes previously loaded a full candidate/application/interview/review graph and discarded it. They now select only the application ID using the same access predicate. Ten alternating warm reads of both query shapes, on the same existing sample application and connection, measured:

| Probe | Median elapsed | SQL calls | Serialized result bytes |
| --- | ---: | ---: | ---: |
| Previous detail lookup | 6.34 ms | 5 | 1,372 |
| Scoped ID-only lookup | 1.65 ms | 1 | 45 |

This is a measured reduction for the access probe, not a full-endpoint or production-latency claim. Actual analytics SQL passed six sample/UTC checks across UTC, Asia/Karachi and America/New_York. Evidence and methodology: [database.json](performance/database.json) and [audit.md](performance/audit.md).

Additional local diagnostics reported backend startup **7,173 ms**, readiness **12 ms** with PostgreSQL up, and **401** for four unauthenticated protected probes. OpenRouter metadata returned in **701 ms**, with the configured model listed and input/output catalog prices zero; free-quota reset remained unavailable and the candidate gate remained closed. This verifies metadata connectivity and listing, not a fresh completion response.

The final API-mode Next production server reached its first successful response in **1,266 ms**. Subsequent HTML responses were **12 ms** (candidate login), **20 ms** (admin login), **37 ms** (API Usage shell), and **22 ms** (privacy). These are single local server-response samples with already built assets, not browser render or authenticated dashboard data timings. Static JavaScript returned `public, max-age=31536000, immutable`; `X-Powered-By` was absent. The first sandboxed startup probe was unreachable; the authorized loopback retry passed and stopped its process. Evidence: [frontend-production.json](performance/frontend-production.json).

The command palette now debounces search and suppresses requests while closed. API Usage charts load separately, provider refreshes share a cached batch, and countdown updates are isolated from the full dashboard. Existing supported Next.js configuration was retained; no speculative dependency upgrade or broad memoization was introduced. See [Next.js 15 local development guidance](https://nextjs.org/docs/15/app/guides/local-development) and [Turbopack documentation](https://nextjs.org/docs/15/app/api-reference/turbopack).

Final frontend build took **127,326 ms** (compile phase 46 seconds), and backend build took **27,899 ms**. The frontend build ran alongside the final tests/lint on this shared workstation; neither has a comparable pre-change build baseline. API Usage reports 12.5 kB route size / 232 kB first-load JavaScript; the interview session reports 3.25 kB / 337 kB. These are Next build output sizes, not measured transfer/paint latency. Browser paint/navigation/dashboard timings and actual STT startup/finalization or TTS startup latency remain unmeasured: the automation read-only page surface did not expose Performance entries, and the microphone permission request did not complete. Hook timing refs exist for manual diagnostics; mocked events do not establish real recognition speed or accuracy.

## E. Reproducible bugs fixed

| Trigger/problem | Resulting behavior |
| --- | --- |
| Repeated/changed recognition results | Stable segment indexing; final events do not duplicate text |
| Natural recognition end or missed terminal event | Bounded restart or explicit recovery; captured words retained |
| Cancel/unmount or unanswered microphone permission | Pending request settles/cancels; 15-second timeout prevents endless waiting; later streams are released |
| Multiple capture clicks or stale callbacks | One owned capture; old results cannot replace a newer session |
| AudioContext/enumeration failure | Working microphone remains usable; optional diagnostics fail safely |
| Rapid replay, mute or unmount | Older TTS results cannot advance the current question |
| Voice review → cancelled replacement → typed finish | Original/formatting provenance is retained with confirmation |
| Confirmed demo answer updates flow | Running voice state machine is preserved instead of remounted |
| Closed command palette or rapid typing | Search is disabled while closed and debounced while open |
| One-point metric sparkline | Finite midpoint SVG coordinates instead of `NaN` |
| Multiple charts with identical series keys | Per-chart gradient IDs prevent cross-chart fill collisions |
| Access-only candidate operations | Same scoped access check without discarded detail graph |
| Weekly sample-excluded analytics | Reviews follow sample policy; week boundaries remain UTC |
| Missing token/cost coverage | Unknown values are distinct from known zero in all usage views |
| Effective spend-budget reset | Correctly distinguished from key-specific reset and expiration |
| Demo health with zero recent failures | Health derives from the same rows as its recent counters |
| Demo logout/sign-in erased confirmed answers | Same normalized fictional email restores its progress; other demo identities start clean |
| Success toast covered the interview End control | Session notifications sit above the fixed control bar |
| Consent/instructions claimed video/audio recording | Copy now describes transcript versions, browser speech processing, optional preview and temporary equipment clips accurately |
| Completed practice still said preparing next question | Explicit completion text replaces the misleading prompt |

## F. Testing results

| Check | Verified status |
| --- | --- |
| Full frontend suite | 174 passed across 22 files; 8 optional emulator tests skipped here and passed in their separate actual-emulator run |
| Focused final voice/API Usage run | 41 passed: 12 voice lifecycle + 29 API Usage/query/search/format tests |
| Microphone/AudioContext tests | 13 passed, including the new unanswered-permission regression |
| Chart regressions | 5 passed |
| Isolated backend authentication | 71 passed |
| Isolated backend usage/core | 70 passed |
| Isolated backend transcript provenance | 10 passed |
| Isolated backend candidate/analytics performance | 9 passed |
| Usage PostgreSQL integration | Passed with fictional rollback fixtures; no retained rows |
| Transcript PostgreSQL integration | Passed with fictional rollback fixtures; no retained rows |
| Read-only performance/analytics verifier | Passed; six timezone/sample cases plus recorded query comparison |
| Frontend/backend TypeScript | Passed, including frontend post-build `tsc --noEmit` |
| Frontend/backend lint | Complete configured lint commands passed; new production-smoke script lint also passed |
| Frontend production build | Passed in 127,326 ms; 36/36 static pages generated; compile phase 46 seconds |
| Backend production build | Passed in 27,899 ms; full backend TypeScript and lint also passed |
| Frontend production HTTP smoke | Passed: four routes HTTP 200, no demo fallback, static JavaScript cached immutable, server stopped |
| Live OpenRouter metadata | Passed; model listed, candidate gate closed; zero completions |
| Live Firebase check | Project/credential/provider configuration verified through sanitized read-only calls |
| Actual Firebase Auth Emulator SDK suite | 8 passed, 0 failed/pending; isolated demo project only; emulator stopped and port released |

Focused counts overlap the full suite; they must not be added together as distinct coverage. The optional Firebase Emulator suite is skipped in the default frontend run and was separately executed successfully: 8 actual SDK tests passed after waiting for the emulator readiness signal. Earlier startup/setup attempts did not execute assertions and are not counted as passes. Some local PostgreSQL and HTTP checks initially hit sandbox connection restrictions; authorized local retries passed. These were environment-access failures, not silently ignored application-test failures.

Default backend `npm test`, `test:unit` and `test:e2e` were deliberately not run because the existing global setup resets/seeds the test database. Dedicated isolated configs and rollback-only integration entry points preserved existing records instead. No tests were deleted or weakened to hide failures. The root ESLint configuration does not match JSX test files; Vitest executed those tests, while lint checked the matching source files.

Repeatable safe entry points include frontend `npm test`/`npm run test:speech`; backend `npm run test:auth`, `npm run test:usage`, the dedicated transcript/performance Jest configs, `npm run test:usage:db`, `node --import tsx test/transcripts-db/persistence.integration.ts`, `node --import tsx prisma/verify-performance.ts`, `npm run ai:metadata`, and `npm run auth:check:live`. Database integration commands require the guarded separate local test database and must retain their rollback safeguards.

## G. Main files created or modified

| Area | Main paths |
| --- | --- |
| Speech engines/contracts | `src/services/speech/browser-stt.ts`, `browser-tts.ts`, `stt-provider.ts`, `types.ts`, `transcript.ts` |
| Microphone diagnostics | `src/services/speech/audio-devices.ts`, `audio-quality.ts`, `src/hooks/speech/use-microphone.ts` |
| Speech hooks/settings | `src/hooks/speech/use-speech-recognition.ts`, `use-text-to-speech.ts`, `use-audio-settings.ts` |
| Candidate speech UI/flow | `src/components/interview/voice-interview.tsx`, `voice-machine.ts`, `audio-settings.tsx`, candidate equipment/session pages, candidate consent/instructions/privacy copy, `src/lib/interview/privacy-copy.ts`, `src/lib/demo/store.ts`, demo login, `src/app/providers.tsx` |
| Transcript persistence/retrieval | Backend `modules/interviews/interviews.dto.ts`, `interviews.service.ts`, `answer-transcripts.ts`; frontend API types and assessment transcript views |
| Usage API/telemetry | Backend `modules/assessment/api-usage.controller.ts`, `api-usage.dto.ts`, `api-usage.service.ts`, `provider-metadata.service.ts`, `usage-telemetry.ts`, `openrouter.service.ts`, module registration |
| Usage data/schema | `interviewos-backend/prisma/schema.prisma`, `prisma/migrations/202611170001_api_usage_telemetry/migration.sql`, guarded deploy/metadata/health diagnostics |
| Usage frontend | `src/app/admin/(app)/api-usage/page.tsx`, `src/components/api/admin/api-usage.tsx`, `usage-charts.tsx`, `src/lib/api/api-usage.ts`, `src/lib/data/api-usage.ts`, `usage-format.ts`, `src/lib/demo/api-usage.ts` |
| Shared reliability/performance | Admin navigation/command palette, shared widgets/charts, backend candidate service and analytics module |
| Automated checks | `tests/speech/*`, `tests/api-usage/*`, chart regression; backend `test/usage/*`, `test/usage-db/*`, `test/transcripts/*`, `test/transcripts-db/*`, `test/performance/*` and isolated Jest configs |
| Evidence/documentation | `scripts/measure-dev-performance.mjs`, `interviewos-backend/prisma/verify-performance.ts`, `docs/performance/*`, `interviewos-backend/docs/api-usage.md`, this report, `docs/speech-usage-preview/*` |

The workspace already contained substantial earlier changes. This list identifies the main files involved in the current request; it is not a claim that every dirty file was newly changed here. Secrets and local environment files are intentionally absent from the report and were not committed.

## H. Remaining limitations

- Browser speech accuracy depends on the engine, accent, device, microphone, network and noise. The work fixes lifecycle/data-loss problems, not the underlying recognition model. No claim of perfect transcription or guaranteed Pakistani-English accuracy is made.
- Physical-microphone recordings, noise/accent accuracy tests, STT/TTS latency measurements and separate Chrome/Edge/Firefox/Safari comparisons remain unverified. The in-app browser supplied Zira playback events but did not complete its microphone permission request; the 15-second recovery path was verified instead. No real recognition accuracy claim is made.
- Browser recognition may use a vendor service. Application audio diagnostics are local and the application does not upload interview audio through this new work; that does not establish that browser recognition itself is fully offline. Camera preview is optional and is not evidence of uploaded video.
- Free-model candidate sharing remains blocked. No LLM transcript cleanup/paraphrasing was introduced. A new completion/structured-JSON live smoke test was not run during this request.
- Quota/account-credit data can be unavailable or partial depending on the provider response and key privileges. Missing values are shown honestly; local counts cannot account for other apps using the provider account.
- Dev timings are small-sample shared-machine measurements and did not show a universal improvement. Browser render/navigation profiling and production performance need separate measurement.
- The frontend production build used a process-only HTTPS placeholder, `https://api.example.invalid/api/v1`, to exercise the API-mode build without overwriting the actual localhost `.env.local`. **Rebuild with the real HTTPS API origin before deployment.** The generated artifact is a verification build, not a deployable configuration. Browser walkthroughs used explicitly separate process-only Demo Mode; the actual `.env.local` stays in API Mode.
- The direct Next production responses currently lack `X-Content-Type-Options`, `X-Frame-Options` and CSP headers. The backend has Helmet configuration and the API Nginx template configures HSTS/nosniff, but those do not establish a frontend edge policy. Frontend response-header/CSP policy must be configured and tested for the deployment origin; this report does not mark that deployment hardening complete.
- A passing build or localhost test does not establish deployment readiness. Deployment still needs actual HTTPS endpoints, authorized Firebase/CORS domains, secure secret mounts, database migrations and operational worker configuration reviewed for that environment. No deployment was attempted.

## I. Final verification checklist and status

Verified: implementation changes; isolated tests; safe database integrations; bounded/authorized usage routes; live metadata and Firebase configuration checks; database readiness; all measured demo HTTP routes; and admin browser navigation/API Usage behavior at desktop and mobile sizes.

The in-app browser walkthrough covered admin demo login, sidebar navigation, 30-day usage, history pagination, a failed-request filter returning eight fictional rows, and layouts at 1440 px and 390 px. Screenshots are retained as [desktop API Usage](speech-usage-preview/api-usage.png) and [mobile API Usage](speech-usage-preview/mobile-usage.png). These are demo UI checks, not a real-provider billing session. The desktop layout snapshot preceded the final demo-health label correction, which passed its regression test. The candidate walkthrough verified demo login, explicit transcript consent, actual Zira playback/completion, replay, pause/resume, mute, microphone timeout/retry, typed practice, four answer confirmations, refresh recovery and logout/sign-in recovery at the next unanswered question, and final submission. The repeat logout check passed after fixing the discovered reset bug. No browser console errors were reported in the completed candidate flow. [Completed fictional interview](speech-usage-preview/interview-complete.png) is retained as evidence.

Final production HTTP results are recorded in `docs/performance/frontend-production.json` and backend results in `docs/performance/backend-final.json`. The demo/dev preview and Firebase emulator were stopped; their temporary tabs were closed and viewport overrides reset. PostgreSQL was restored to its original stopped state after all database checks. No deployment or commit was performed.

No private credential values were displayed or committed. No real candidate content was sent to the free model. No destructive database action, permission change or production deployment was performed.

The service-account JSON, backend `.env` and root `.env.local` remain Git-ignored; no service-account JSON/private-key file is tracked. Existing secret values and localhost configuration were preserved.
