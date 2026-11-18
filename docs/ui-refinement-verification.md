# UI refinement verification — 19 November 2026

Scope: focused changes on `codex/ui-experience-refinement`, starting from clean commit `0b7f044`. The pre-implementation screen audit is in `ui-refinement-audit.md`.

## 1. Audit findings

The dashboard mixed review work with eight metrics and several charts. Interview review repeated complete transcripts; candidate profiles had six tabs and crowded action headers. Staff settings described Firebase sign-in incorrectly. Notification loading/errors could look like an empty inbox. Firebase initialization and token acquisition had unbounded waits before the existing HTTP timeout.

## 2. Dashboard

Four metrics: Total Candidates, Interviews Completed, Awaiting HR Review, Selected Candidates. Selection counts unique candidate records with a currently selected-through-joined application; it does not count multiple applications twice. Four quick actions, five recent pending reviews, and five persisted notification updates replace overview charts. The API never falls back to demo data. Analytics metrics remain permission gated. Sample inclusion follows the existing backend environment policy.

## 3. HR screens

- Navigation groups Overview, Recruitment, Evaluation, Management, and Administration; authorized links only, explicit collapsed-link labels, one active destination, readable details breadcrumbs.
- Candidate details: five tabs, two principal header actions, application details disclosed inside Overview; assessment and notes actions live in their tabs. Existing status transitions are unchanged.
- Interview review: Summary, Questions & Answers, AI Assessment, Recording, HR Decision. Keyboard-accessible tabs, searchable confirmed answers shown once, original/cleaned versions retained, draft review notes retained across tabs, recording metadata fetched when opened. Read-only accounts cannot edit decisions.
- Demo review follows the same structure and no longer offers a simulated media player. Actual recording authorization/playback is unchanged.
- Assessment: supported findings first; per-question evidence and technical similarity measures are expandable. Human review, rubric approval, corrections and reassessment remain explicit.
- Analytics: existing date-filtered aggregates, explicit calendar-week activity window, clearly labeled all-time stage overview and expandable detailed counts. No historical conversion rate is inferred from current stage counts.
- Pipeline: stacked columns on mobile; existing counts, filters, card limit and server-validated transitions retained.
- API settings: verified profile, display preferences, account security, permission-aware interview/assessment configuration and staff administration links. The separate demo settings remain labeled local demo controls.

## 4. Candidate experience

Status now shows verified profile name/email, applied role, application date and interview status/date. Missing values remain explicit; no invented profile data or additional update endpoint was introduced. Existing onboarding, verification and one-interview assignment behavior remains intact.

Completion uses “Your Interview Has Been Successfully Submitted” and the requested BaliTech copy, blue checkmark and responsive details. API success requires backend `SUBMITTED`; a local completed state is insufficient. References appear only when returned by the backend. Recording status is checked separately and cannot turn an unsuccessful interview submission into success. Completion offers return-to-portal and no reset action.

## 5. Speech verification

The existing browser STT/TTS engine was retained after source review and mocked-event regressions. Verified behaviors include microphone cleanup, interim/final preservation, restart limits, duplicate-event handling, interrupted/unfinalized text, original/cleaned/confirmed separation, typed recovery, late events, and prevention of overlapping test speech and candidate recognition. English female-voice preference remains available when a suitable installed voice exists; names are a heuristic, not a guarantee.

`node scripts/speech-accuracy.mjs` evaluates fictional reference/recognized transcript pairs using normalized word-level Levenshtein distance. It reports weighted WER only for supplied recognition results. The five supplied physical scenarios are **pending**, aggregate WER **null**; no microphone accuracy percentage is claimed. Known edit-distance examples pass unit tests.

Physical checklist (use fictional text from `tests/fixtures/speech-accuracy.json` only):

1. In equipment/practice, select the intended microphone, confirm meter input, and verify browser/OS default recognition input separately. The existing Web Speech adapter cannot guarantee selection of the same device as a `getUserMedia` preview.
2. Read short and long references at normal pace in a quiet room; retain the raw recognized text before cleanup or manual edits.
3. Repeat the pauses scenario, allow natural silence, stop/restart once and check for dropped/duplicated words. Confirm unfinished words remain reviewable.
4. Repeat with documented moderate office noise, then a second microphone if available. Record browser/OS, device, language, noise and observed recognition text in a local fictional fixture copy.
5. Evaluate with `node scripts/speech-accuracy.mjs path/to/fictional-results.json`. Record per-scenario and aggregate WER. Do not replace absent results with estimates.
6. Check permission denial/recovery, mic disconnect, browser interruption, female-voice availability and TTS/STT non-overlap on actual supported desktop and mobile browsers.

## 6. Loading and notifications

Firebase initialization and candidate token lookup have 20-second deadlines; late initialization cannot overwrite the recovery state. Existing expected staff-session 401 behavior remains covered by tests. Route error boundaries offer retry/navigation without exposing raw errors. Compact loader size is corrected; existing reduced-motion behavior is preserved. Notification loading/error/empty states are distinct, manual retry is available, and mark-as-read failures are reported. No email/SMS/push delivery integration or delivery claim was added.

## 7. Cleanup and data safety

Removed duplicate answer rendering, simulated playback/intervals, unused imports, duplicated dashboard charts and completion reset controls. No new dependency was installed. A development-only UI preview uses a separate ignored `.next-ui-preview` directory and is prohibited in production mode.

No migrations, resets, seeds, database writes, administrator password changes, permission changes, real-candidate API calls or uploads were performed. No environment or service-account values were printed. Git checks found no tracked sensitive environment files or service-account JSON; `.env.local`, backend `.env`, backend service-account JSON and preview output are ignored.

## 8. Tests and builds

Backend tests use isolated database-free configurations; the default backend Jest setup was deliberately not run because it resets a database.

| Check | Result |
| --- | --- |
| Frontend `npm test` | 237 passed; 8 opt-in Firebase emulator tests skipped; 36 passing test files |
| Frontend TypeScript and lint | Passed, no lint warnings/errors |
| Frontend production `npm run build` | Passed; 39 pages generated; final review route 9.15 kB, 264 kB first-load JS |
| Backend `jest.auth.config.js` | 100 passed |
| Backend `jest.recordings.config.js` | 48 passed |
| Backend `jest.transcripts.config.js` | 25 passed |
| Backend `jest.performance.config.js` | 10 passed |
| Backend `npm run test:usage` | 70 passed, including mocked NLP/OpenRouter and HTTP authorization |
| Backend TypeScript, lint and production build | Passed |
| Fictional speech evaluator | Five pending physical scenarios; no measured WER |
| Git whitespace/credential checks | Passed; no private-key patterns in changed files |

Total backend tests: 253 distinct tests. New frontend regressions cover the four-metric dashboard, navigation permission/active-state behavior, submitted-only completion, independent recording failure, keyboard review tabs, retained notes, lazy recording, read-only review, initialization/token deadlines, and WER calculations.

Sandboxed build retries encountered intermittent Windows `EPERM` on generated `.next` directories. The generated cache was preserved under ignored preview output before a clean retry; that retry exposed blocked Google Fonts DNS. The final build passed with approved filesystem/network access for the existing Inter/Manrope fonts. Seven usage HTTP tests initially encountered sandbox loopback `EACCES`; all passed with approved loopback access. Automatic approval review timed out on earlier attempts but later succeeded; no verification remains blocked by those failures. A process-only HTTPS placeholder API URL was used for build validation; environment files were not changed. The build emits an existing Node experimental type-stripping notice, not a compilation failure. Browser inspection reported development Fast Refresh notices and no application errors.

## 9. Verification limits

Browser checks use fictional demo data on `127.0.0.1:3200`; API screens are covered by component tests and mocked backend regressions. No live administrator or real-candidate mutation was used to prove a visual change. A production-origin login/session check and full real-browser recording/upload replay were not repeated in this UI task. Physical microphone/noise/mobile voice measurements remain pending.

Dashboard viewport checks: 360, 390, 430, 768, 1024, 1440 and 1920 CSS pixels, without page-level horizontal overflow. Light/dark themes, mobile drawer, Escape dismissal, review deep link and keyboard tab navigation were inspected. Candidate details, review and stacked pipeline were additionally inspected at 390 px. Scrollable tab bars and intentionally horizontal desktop pipeline boards are retained. This is viewport emulation, not a claim of physical-device coverage or a full screen-reader audit.

## 10. Commits

Logical local commits are listed in the final response. Nothing is pushed automatically.
