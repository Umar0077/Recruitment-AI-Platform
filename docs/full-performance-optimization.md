# InterviewOS full-stack performance optimization

Branch: `codex/full-stack-performance`. No push, database reset, credential changes, migrations, or real-candidate submissions.

## 1. Root cause analysis

The fresh baseline is in [baseline notes](performance/full/baseline.md), with raw JSON alongside it. Development on-demand compilation was a major contributor: the first admin login compiled for 41.1 seconds and its HTTP request took 43.15 seconds. This is distinct from production runtime. Development and production ran on separate ports/output directories.

Production also had genuine interaction and rendering bottlenecks:
- No contextual pending feedback until routing advanced; candidate headers remounted between preparation pages; nested route loading boundaries sometimes discarded the old content; and page entrances began at opacity zero.
- Demo sign-in had an artificial 350 ms delay, `/admin/candidates` had an artificial 180 ms `setTimeout` skeleton flash on every mount and filter change, and `/admin/interview-setup` had an artificial 500 ms save delay.
- `/admin/pipeline` wrapped every Kanban card in Framer Motion `LayoutGroup` + `motion.div layout="position" layoutId={c.id}`, forcing synchronous layout projection work on mount and drag updates (causing 661 ms baseline / 1,106 ms earlier after-run spikes).
- `NavigationProvider` triggered an extra synchronous `attempt` state update on every click before starting the router transition, and `StaffAuthProvider` recreated its context value object on every render.
- Successful interview mutations wrote authoritative progress to the query cache and immediately invalidated that same progress/transcript query; the dashboard fetched seven analytics queries for four counters; and the analytics route bundled plotting code into its initial route load.
- A repeat browser run caught a real toast obstruction where a consent notice covered the practice action. Interview preparation now shares the focused session's raised notification offset, with an explicit close button.

The app-wide auth providers already deduplicated staff session checks; removing authorization would not address these causes. Existing pointer/orb animation code already pauses appropriately and does not update React state continuously, so it was preserved.

## 2. Before/after metrics

Environment: Windows local workstation, i5-12450H, 16 GB RAM, Node 23.10.0, Next 15.5.29, React 19, installed headless Chrome 136, 1440×1000 primary viewport, no artificial CPU/network throttling. All browser account data is fictional existing Demo Mode. Browser observations do not claim real Firebase, PostgreSQL HTTP, or free-model latency.

Navigation is measured from the actual click to an animation frame containing destination content. Plot readiness is measured separately after splitting chart code. Cold login includes Playwright's network-idle wait; LCP is reported separately. These are local lab samples, not field INP or universal guarantees.

Verified rebuilt production before/after comparison (ms) from [production baseline](performance/full/baseline-production-final.json) vs [verified production after](performance/full/after-production-verified.json):

| Route / sample | Before (ms) | After (ms) | Change | After click feedback (ms) |
|---|---:|---:|---:|---:|
| Admin Sign-In | 2,998 | 632 | -78.9% | n/a |
| Dashboard (warm) | 63 | 74 | +17.5% | 3.4 |
| Candidates (warm) | 146 | 136 | -6.8% | 6.2 |
| Interviews (warm) | 120 | 96 | -20.0% | 11.8 |
| AI Assessments (warm) | 68 | 47 | -30.9% | 2.8 |
| Analytics (warm) | 137 | 78 | -43.1% | 2.8 |
| Recruitment Pipeline (warm) | 661 | 141 | -78.7% | 8.5 |
| Interview Setup (warm) | 100 | 49 | -51.0% | 3.4 |
| Settings (warm) | 60 | 49 | -18.3% | 4.4 |
| API Usage (warm) | 161 | 104 | -35.4% | 3.7 |
| Candidate Detail | 301 | 158 | -47.5% | 4.5 |
| Interview Review | 458 | 115 | -74.9% | 4.5 |
| Candidate Login (cold, network-idle) | 2,963 | 897 | -69.7% | n/a |
| Candidate Sign-In | 2,504 | 278 | -88.9% | n/a |
| Candidate Instructions | 635 | 69 | -89.1% | 8.6 |
| Candidate Consent | 514 | 45 | -91.2% | 18.0 |
| Equipment Check | 674 | 100 | -85.2% | 13.6 |
| Practice | 1,213 | 78 | -93.6% | 19.2 |
| Candidate Status | 116 | 27 | -76.7% | 5.5 |

Key summary from the verified production run:
- **Every warm route** completed in **27–141 ms** (well below the 500 ms target; warm admin median **62 ms**).
- **30 of 31 navigation samples** showed visible click feedback in **2.4–45.1 ms** (median **5.5 ms**, target `<= 100 ms`). Only the very first cold navigation to `/admin/candidates` reported `feedbackMs = 300 ms` because it completed in a single frame.
- **Analytics chart readiness** was **570 ms** on first visit (route content at 248 ms) and **92 ms** on warm return (route content at 78 ms).
- **Analytics first-load JavaScript** reported by Next fell from **379 kB to 262 kB** (-117 kB / -30.9%). Chart code is deferred behind local placeholders, not removed. Original typography, logo and orb assets remain.

Development samples (ms; compilation and system-load differences prevent a controlled speedup claim):

| Route / sample | Before | After | After feedback |
|---|---:|---:|---:|
| first /admin/candidates | 4,434 | 8,616 | 26 |
| warm /admin/candidates | 2,072 | 3,566 | 19 |
| warm /admin/analytics | 3,900 | 853 | 12 |
| warm /admin | 537 | 575 | 10 |

## 3. Loader changes

`InterviewOSInlineLoader` reuses the official mark and existing CSS rotation, including OS/app reduced-motion support. Route indicators occupy an absolute slot inside the current content, avoiding layout insertion. Buttons, forms and data sections retain their own genuine pending states. There is no minimum display duration.

Shared navigation wraps eligible Next Link and imperative router operations in React transitions. Existing content remains live while the replacement is prepared; no copied DOM, frozen auth snapshot, cross-user cache or hidden destination rendering is used. Modified clicks, external links, downloads, scroll/replace options and caller cancellation preserve Next behavior. Stable action context avoids rerendering every table link on a pending-state change, and a ref-managed 20-second delay timer avoids an extra synchronous state update on every click.

Five coarse admin/candidate `loading.tsx` boundaries were removed after verifying these routes render client screens with local data/auth states. Their contextual indicators now live in persistent layouts instead of replacing the page. Local chart boundaries and initial auth/session bootstrap skeletons remain. The candidate header/help state persists across preparation/status pages; the focused interview intentionally uses its dedicated controls. A pending route exceeding 20 seconds replaces the spinner with a clear connection message and an explicit navigation-only Retry action. It never retries a mutation.

## 4. Frontend optimizations

- Removed artificial delays: Demo Mode sign-in timeout (350 ms), `/admin/candidates` mount/filter skeleton timeout (180 ms), and `/admin/interview-setup` save timeout (500 ms).
- Removed Framer Motion `LayoutGroup` + `layoutId` projection thrashing on `/admin/pipeline` Kanban cards and memoized `KanbanCard`, filtered candidates, and tab counts (cutting warm pipeline navigation from 661 ms to 141 ms).
- Eliminated the redundant `attempt` state update in `NavigationProvider` and memoized the `StaffAuthProvider` context value and callbacks.
- Reused confirmed progress from start/save/interrupt/submit responses; exact detail invalidation avoids an immediate duplicate transcript fetch. Fresh route/focus progress verification remains, preserving interruption and timer semantics.
- Limited automatic query retries to one explicit server failure; timeouts/network failures surface for recovery rather than restarting multiple 20-second waits. Mutations still never retry automatically. Timeout copy reminds users to verify uncertain saves.
- Kept page entrances visible, using a small transform/opacity change instead of a blank opacity-zero start.
- Deferred Recharts behind fixed-size, local branded placeholders. Static cards/funnels and route navigation remain available while charts initialize.
- Kept dashboard card structure, labels and hints mounted while only values skeletonize, replacing mismatched fixed-height placeholders.
- Raised candidate interview toast notifications (`bottom: 84`) across `/candidate/interview/*` with an explicit close button so notices never obstruct preparation actions.
- Removed redundant manual sidebar hover prefetch; existing permission-filtered Next route prefetch remains. No candidate datasets are prefetched indiscriminately.

## 5. Backend optimizations

Added `GET /analytics/summary`, with the same `analytics:read` permission as overview, the same production sample exclusion, the same submitted-interview/review definitions, and unique selected-candidate semantics. Four parallel count queries replace the dashboard's unused groupings and duration percentile. The full overview remains for analytics.

The read-only comparison checks all four result values against the original overview. Alternating ten-sample measurements on the same connection measured **18.415 ms median / 7 queries / 1,720 bytes** for overview and **11.640 ms / 4 queries / 114 bytes** for summary. This is controller/database timing on a tiny test dataset, not authenticated HTTP latency or a production-capacity benchmark. Count work fell 42.9%, response payload 93.4%, and paired median time 36.8% in this run.

Responses now expose numeric `Server-Timing: handler;dur=…` through the existing exact-origin CORS configuration. It measures controller work including awaited queries; existing pino response time measures the full request including guards and serialization. No query text, parameters, credentials, candidate data or raw exceptions are added to logs. Cookies, CSRF, roles, token verification and auth failure handling remain intact.

## 6. Database optimizations

Profiling uses a separate existing loopback `_test` database and explicitly `SET TRANSACTION READ ONLY`. It refuses the application database, never creates fixtures, and writes only aggregate benchmark artifacts to this repository. `EXPLAIN (ANALYZE, BUFFERS)` found a tiny sequential scan, with two rows and no matching sample rows for the profiled sample aggregate. This does not justify an index or migration. None was added.

Only timing/count/byte summaries and aggregate plans are retained. Candidate/interview list probes in this script are representative bounded reads, not complete HTTP service profiles. Real-volume query plans, connection-pool saturation and production HTTP endpoint timings remain deployment checks.

## 7. Browser test results

The Playwright Core runner (`scripts/browser-performance.mjs`) uses installed Chrome and ephemeral contexts, allows only the selected loopback origin, requires a visible Demo Mode notice before entering fictional credentials, and does not read `.env`. It tests sidebar navigation, candidate profile and interview review, instructions, explicit consent, simulated equipment, practice, typed interview completion, status, viewports, light/dark reduced motion, mobile drawer, and signed-out route redirects.

Verified rebuilt production run ([after-production-verified.json](performance/full/after-production-verified.json)):
- **0 errors** across the entire suite.
- **31/31** normal navigation checks retained existing content and shared header; median click feedback **5.5 ms** (30/31 under 46 ms).
- **21/21** viewport checks across **360, 390, 430, 768, 1024, 1440, 1920 px** widths had **0 horizontal overflow**, **maximum CLS 0.0561** (target `< 0.1`), and **maximum reported LCP 500 ms** (target `< 2,500 ms`).
- **Light/dark, reduced-motion, and mobile drawer** checks all passed (`cls <= 0.00014`, zero overflow).
- **Fictional typed interview completion**: 4 answers confirmed with the **90-second timer (`1:30`)** visible and no microphone/camera access, reaching `/candidate/interview/complete` in 6.09 s.
- **Signed-out route audit**: all 5 routes verified (`/candidate/signup`, `/candidate/verify-email`, `/candidate/complete-profile`, `/candidate/onboarding` -> `/candidate/login`, `/admin` -> `/admin/login`).
- **Candidate preparation lab Event Timing**: most interactions were **32–56 ms** with **0 long tasks**; one sample reached **608 ms** (limited lab Event Timing, not field INP).

Evidence: [production baseline](performance/full/baseline-production-final.json), [verified production after](performance/full/after-production-verified.json), [earlier production after](performance/full/after-production.json), [repeat exposing toast obstruction](performance/full/after-production-repeat.json), [development after](performance/full/after-development.json), [database comparison](performance/full/after-database.json).

Demo-only notices on API Usage/Rubric/HR account screens are expected; they do not verify real usage data or permissions in a browser. Recording review's permission/lazy-loading behavior is covered by component/backend tests, not playback of real candidate media. Physical microphone/camera, speech recognition accuracy on hardware and real Google sign-in were not operator-tested.

## 8. Regression results

- **Frontend tests**: **243 passed, 8 skipped** (38 passed files, 1 skipped Firebase emulator file) across `vitest run`.
- **Backend tests**: **257 passed, 0 failed** — auth 100, recording 48, transcripts/assignment 25, usage/assessment/OpenRouter 70 (including 7 loopback HTTP authorization tests), performance 14.
- **Static checks & builds**: Frontend `tsc --noEmit`, `eslint .`, and `next build` (39/39 routes) passed. Backend `tsc --noEmit`, `eslint`, and `nest build` passed.

The default backend Jest configuration was deliberately not used because its global setup resets the database. Dedicated safe auth, recording, transcript, performance and usage configurations cover authentication, CSRF/session rules, original transcript provenance, initial assignment, NLP/assessment/OpenRouter mocks, privacy gates and recording access.

## 9. Remaining limitations and reproduction

- Real authenticated API navigation, large production datasets, field INP, and physical microphone/camera devices still require representative staging/operator measurement.
- One lab Event Timing sample during candidate preparation reached 608 ms (despite 0 long tasks); no field-INP guarantee is claimed.
- The generated local production artifact is explicitly **Demo Mode**. Real API deployments must build with the intended API-mode HTTPS origin; this task does not modify `.env` files or deployment configuration.

For local reproduction:
1. Build in Demo Mode: `$env:NEXT_PUBLIC_APP_MODE='demo'; npm run build`
2. Start production server on port 3300 and run Playwright:
   `PERF_BASE_URL=http://127.0.0.1:3300`, `PERF_LABEL=after-production-verified`, `npm run test:performance`
3. Database profiling (read-only against local `_test` DB): `node --import tsx prisma/profile-performance.ts` with `PERF_PHASE=after` inside `interviewos-backend`.

## 10. Git commits

All work is on branch `codex/full-stack-performance` (not pushed):
- `648a545` — `perf: preserve pages and add contextual navigation feedback`
- `5fd7528` — `perf: reduce dashboard queries and defer chart rendering`
- Follow-up logical commits on `codex/full-stack-performance` covering artificial delay removal, pipeline Kanban & auth/navigation render optimizations, toast obstruction fix, Playwright browser performance runner, and this verified report/evidence.
