# Performance and reliability audit

## Measurement method

`node scripts/measure-dev-performance.mjs baseline` starts an isolated Next.js development process on port 3102, sets `NEXT_PUBLIC_APP_MODE=demo` only for that process, requests four routes over localhost, and stops its own process tree. It neither authenticates nor contacts application APIs. Each route receives one initial request and three warm requests. The raw samples and compiler output are in `baseline.json`.

The initial request is cold relative to the new server process; existing `.next` and operating-system filesystem caches are retained. This is not an empty-cache build. Times below cover the complete HTML response, including server compilation when needed; they do not measure hydration, first paint, interactive dashboard rendering, or client-side navigation. Browser profiling and real microphone measurements must be reported separately.

The baseline ran on Windows x64, Node 23.10.0, Next.js 15.5.29, React 19.3.1, an Intel i5-12450H (12 logical CPUs), and 16 GB RAM. The workspace is on OneDrive; this is a condition, not evidence that synchronization caused a particular delay.

| Baseline metric | Observed value |
| --- | ---: |
| Child launch to ready output | 21,237 ms |
| Next.js internal ready message | 13.3 s |
| Candidate login first / warm median HTML | 22,296 / 370 ms |
| Candidate interview first / warm median HTML | 1,351 / 329 ms |
| Admin first / warm median HTML | 3,736 / 318 ms |
| Landing first / warm median HTML | 2,214 / 788 ms |

All sixteen baseline requests returned HTTP 200. The installed development command already uses Turbopack. Existing import optimization and strict TypeScript settings were retained. No speculative memoization, dependency upgrade, or unsupported Next.js configuration was added. The old production `BUILD_ID` coexisted with development manifests after measurement, so those mixed artifacts are not used to claim a production bundle baseline.

## Repeated development measurements

`node scripts/measure-dev-performance.mjs after --include-api-usage` repeated the same first four routes in the same order and appended the new API Usage route. The machine, versions, demo-only mode, port, and retained-cache policy were unchanged. Other Next.js processes/builds were paused during the measurement, but total machine load and retained caches were not controlled. Raw data is in `after.json`.

| Metric | Before | After |
| --- | ---: | ---: |
| Child launch to ready | 21,237 ms | 35,990 ms |
| Next.js internal ready message | 13.3 s | 17.1 s |
| Candidate login first / warm median HTML | 22,296 / 370 ms | 13,574 / 289 ms |
| Candidate interview first / warm median HTML | 1,351 / 329 ms | 2,606 / 700 ms |
| Admin first / warm median HTML | 3,736 / 318 ms | 4,216 / 590 ms |
| Landing first / warm median HTML | 2,214 / 788 ms | 2,425 / 808 ms |
| API Usage first / warm median HTML | Not present | 2,011 / 848 ms |

All twenty after requests returned HTTP 200. Login improved in this run, while startup and the other existing routes were slower. These mixed, small-sample localhost measurements do **not** establish a general frontend performance improvement or attribute a regression to a particular change. The harness measures server HTML responses; it does not exercise hydrated dashboard charts or the speech UI. Both measurement processes were stopped after collecting results.

## Implemented findings

- Candidate timeline, status, remark, and assignment access probes called the full application-detail loader and discarded its candidate, role, recruiter, interview, and review graph. They now use the same scoped application predicate with an ID-only selection. Detail endpoints, transactions, permissions, and recruitment rules retain their behavior.
- A one-point metric sparkline divided by `values.length - 1`, producing an invalid `NaN` SVG coordinate. It now places the point at the chart midpoint.
- Trend charts reused document-global gradient IDs when multiple charts had the same series key. Each chart now prefixes gradient IDs with React's stable instance ID so one chart cannot use another chart's fill.
- The command palette's closed-state and per-keystroke request behavior was identified and handed to the frontend API Usage workstream for its coordinated fix.
- Weekly analytics previously excluded sample applications/interviews but included sample HR reviews. Reviews now honor the same sample setting. Week boundaries explicitly use UTC rather than the database connection's timezone, including UTC week-end calculation.
- Pending microphone permission requests could acquire a stream after unmount or cancellation. The hook now settles cancellation immediately and stops late streams, shares duplicate opens, removes ended handlers, and prevents stale callbacks from affecting another capture. Optional AudioContext diagnostics and device-enumeration failures do not reject a working microphone; diagnostics close/disconnect safely and stop their animation loop.

## PostgreSQL evidence

`interviewos-backend/prisma/verify-performance.ts` ran against the existing local test database with a `READ ONLY` transaction. It inserts no fixtures and writes no application records. The SQL timezone/sample checks use fictional CTE rows that exist only within each SELECT. The original sandboxed connection was unavailable; the authorized local run succeeded. Evidence contains metrics only in `database.json`.

Ten alternating warm queries per implementation used one existing sample application, the same scoped predicate, and one connection:

| Application access probe | Median elapsed | SQL calls per probe | Serialized result bytes |
| --- | ---: | ---: | ---: |
| Previous full detail lookup | 6.34 ms | 5 | 1,372 |
| Scoped ID-only lookup | 1.65 ms | 1 | 45 |

This measures this access probe, not the complete API endpoint or production latency. Actual analytics SQL also passed six boundary checks: sample inclusion/exclusion under UTC, Asia/Karachi, and America/New_York, with a fixed fictional instant just after Monday 00:00 UTC. All three activity series returned the expected counts and the same UTC week start.

## Focused validation

- Frontend chart regression suite: 5 passing tests (empty/single/multiple sparkline values and unique per-chart SVG gradient references).
- Isolated candidate access and analytics configuration suites: 9 passing tests (scoped ID-only lookup, denial before detail reads or mutations for all four actions, and environment/default sample behavior). Their dedicated `jest.performance.config.js` has no database setup or reset hooks.
- Microphone and AudioContext suites: 12 passing tests covering duplicate opens, cancellation/unmount, late streams, device disconnect, bounded missing-device fallback, optional metering/enumeration failures, and diagnostic cleanup.
- Frontend and backend TypeScript checks passed after these changes; final full-application validation is coordinated with the main workstream.
- Changed source/script ESLint checks passed. The existing root ESLint configuration does not match JSX test files; those files were executed by Vitest, with no lint bypass added.

Commands:

```text
node node_modules/vitest/vitest.mjs run tests/auth/chart-reliability.test.jsx
node node_modules/vitest/vitest.mjs run tests/speech/microphone.test.jsx tests/speech/audio-quality.test.js
node node_modules/eslint/bin/eslint.js scripts/measure-dev-performance.mjs src/components/admin/widgets.tsx src/components/charts/index.tsx
# From interviewos-backend:
node node_modules/jest/bin/jest.js --config jest.performance.config.js --runInBand
node --import tsx prisma/verify-performance.ts
node node_modules/eslint/bin/eslint.js src/modules/candidates/candidates.module.ts test/performance/candidate-access.spec.ts
```

Final application lint, tests, production build, and browser checks are coordinated with the main workstream. A single localhost run is not sufficient evidence of a general performance improvement or production readiness. These mocked microphone tests do not measure recognition accuracy or real-device latency.

## Final independent correctness review

The API Usage review checked backend authorization, DTO limits, exact-match parameterized filters, inclusive UTC date ranges, SQL aggregation, null accounting coverage, frontend cache scoping, provider metadata parsing, and the real-candidate privacy gate. Usage responses select accounting fields only; no report/candidate IDs, prompts, transcripts, or provider credentials are returned. Existing `users:manage` permission remains required; permissions were not broadened.

The review identified and coordinated two presentation fixes with the usage workstream: missing combined token measurements now remain unavailable in the daily table and monthly chart, and `effective_budget.resets_at` is labeled as an effective spend-budget reset rather than the API key's own reset. OpenRouter's [official limits documentation](https://openrouter.ai/docs/api_reference/limits) distinguishes the effective workspace/member/guardrail/key budget from the key's own credit cap. The demo health status now derives from the same recent request rows as its last-24-hour counters instead of a hardcoded error status.

A voice-review edge case was reproduced: after recording an answer, cancelling a replacement recording and switching to typing retained the original on screen but omitted its metadata at confirmation. Confirmation now includes any retained original transcript regardless of the final input mode. The regression test verifies the edited answer, typed source, original, formatting preview, and uncertainty metadata together.

Final focused regression: 41 frontend tests passed (12 voice lifecycle and 29 API Usage/query/search/format tests), changed-source lint passed, and 70 isolated backend usage/core tests passed. Seven HTTP authorization tests first encountered sandbox loopback `EACCES`; all seven passed when rerun with local loopback access. These tests use fictional browser/provider data and mocked services, with no database resets or records changed.

## Configuration references

The audit checked the installed Next.js 15 configuration against the official [local development guide](https://nextjs.org/docs/15/app/guides/local-development), [Turbopack reference](https://nextjs.org/docs/15/app/api-reference/turbopack), [lazy loading guide](https://nextjs.org/docs/app/guides/lazy-loading), and [import optimization reference](https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports).
