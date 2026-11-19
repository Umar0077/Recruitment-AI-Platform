# Phase 5 implementation and operations

Implemented on 16 November 2026. This extends the existing NestJS API, PostgreSQL schema, BullMQ worker and Next.js HR interface. Official question definitions and their seed text were not changed. Recruitment decisions remain human actions; the analysis produces no hiring score.

## Backend and job lifecycle

`src/modules/assessment` contains the OpenRouter adapter, NLP functions, strict output contracts, versioned prompt, rubric drafts, HR controller and assessment worker. Submission already created a unique `(sessionId, version)` pending report inside its transaction. That existing record now acts as the durable work item; no separate redundant job table was added. Submission never waits for an external request.

The worker claims pending submitted reports using PostgreSQL `FOR UPDATE SKIP LOCKED`, then saves diagnostics and the exact approved rubric snapshots before calling the provider. One consolidated request covers up to four questions. Read APIs and refreshes never initiate provider requests. BullMQ drains the durable work list every 15 seconds. Local `JOBS_IN_PROCESS=true` uses the same service on a timer; use `JOBS_IN_PROCESS=false` with the Redis worker in deployment.

Stages: NOT_GENERATED, WAITING_FOR_APPROVED_RUBRIC, NLP_PROCESSING, WAITING_FOR_APPROVED_PROVIDER, LLM_PROCESSING, HUMAN_REVIEW_REQUIRED, COMPLETED and FAILED. Capacity and transient provider failures retain specific reason codes and next-attempt timestamps. Reports interrupted by a crashed worker become failed after five minutes, allowing deliberate HR reassessment without silently repeating uncertain requests. Failed records serve as the inspectable terminal work list. HR can create a new report version; duplicate requests while a version is pending return that same version.

## PostgreSQL changes and safety

Migration: `202611160001_phase5_analysis`. It only adds columns, tables, indexes and foreign keys. It does not drop records, reset PostgreSQL, change official questions, or overwrite historical reports.

New tables:

- `reference_rubric_versions`: versioned rubric JSON, question FK, approval status, approver and timestamps. The question FK pins the existing question-set version. Approved versions cannot be edited through the API.
- `llm_request_usage`: request UUID, report FK where relevant, exact model, purpose, attempt, outcome, HTTP status, tokens, latency and timestamps. No API key or response payload is stored here.
- `assessment_corrections`: append-only HR notes, relevance corrections, reviewer identity and review timestamp.

Existing `assessment_reports` now holds NLP results (including answer IDs), rubric snapshots, structured question observations/evidence, prompt version, phase and processing/retry times. Existing observation records are populated for strengths and review areas. Findings and corrections remain separate. Existing report versions remain accessible in the UI.

The configured local server at `127.0.0.1:5432` was stopped and had no cluster at its configured data directory. Both sandbox and host cold-backup checks found no source directory. A fresh PostgreSQL 17 development cluster was initialized, initial and additive migrations applied, and the existing official seed run. Eight draft rubrics were then saved; none was approved automatically. There were no pre-existing records in this configured database to back up. For any deployment containing records, take and verify a backup before running `npm run db:migrate:deploy`; never run a reset. Tests use only the guarded `interviewos_test` database.

## Provider, capability and privacy

Default exact model: `nvidia/nemotron-3.5-super-vl:free`. Endpoint: `https://openrouter.ai/api/v1/chat/completions`. No automatic model substitution or paid fallback is configured. Requests require JSON-schema support, disable provider fallback, use temperature 0.2 and a 4,000-token output limit, and carry a generated request ID. Strict application validation remains mandatory even when the provider accepts structured output.

The official model listing was checked and describes text input and explicitly prohibits personal/confidential information on the free endpoint: <https://openrouter.ai/nvidia/nemotron-3.5-super-vl:free>. Structured-output request format follows <https://openrouter.ai/docs/guides/features/structured-outputs>.

The backend key belongs only in `interviewos-backend/.env`, which is ignored by Git. It is never returned by the usage API or stored in PostgreSQL. Provider errors are converted into controlled codes without provider response bodies or credentials. Base URL validation restricts the adapter to the official HTTPS endpoint; redirects are refused.

Persisted interviews ALWAYS require approved production processing, even if `isSample=true`. A sample flag or candidate ID cannot attest that free text is synthetic. The free model remains blocked for persisted applicant interviews, including when the production-mode variable is changed. Only code-owned synthetic smoke fixtures and question-only fictional rubric drafting can use the free model.

Production processing requires all of: `AI_ASSESSMENT_MODE=approved_production`, a non-free explicitly selected model, `AI_APPROVED_MODEL` exactly matching it, and a nonempty `AI_PROVIDER_APPROVAL_REFERENCE` referencing an actual organizational review of provider terms and permissions. These settings are an operator assertion, not a substitute for that review. No such approval or paid-model selection was made during implementation. `disabled` blocks all external requests. Local NLP continues independently of external provider permission.

No key was configured during this implementation. The opt-in smoke command was executed with opt-in enabled and exited with a truthful “key not configured” skip. Account access, runtime structured-output support for this account, real token usage, latency, and observed provider rate limits therefore remain unverified. No real candidate data was transmitted.

## Quotas and failures

Defaults are application budgets: 40/day, 15/minute, concurrency 1, timeout 60 seconds and at most two retries. They are not OpenRouter contractual quotas. Days use UTC. A PostgreSQL advisory lock serializes request reservations across API and worker replicas. Every actual attempt consumes budget, including failures and synthetic preparation. Abandoned reservations expire after the request timeout plus 30 seconds but remain counted. The usage panel reports successes, failures, HTTP 429s, attempts, tokens, average latency and pending jobs.

Transient errors use bounded exponential backoff with jitter and honor numeric/date Retry-After. A daily budget wait resumes no earlier than the next UTC day. Malformed requests, authentication errors, invalid output and unsupported schema requests are not repeatedly retried. Assessment retries are scheduled durably rather than sleeping in HTTP handlers. Rubric-generation actions are explicit one-shot requests and can be retried deliberately within the same shared quota.

## NLP and interpretation

Engine `interviewos-nlp-1.0.0`; preprocessing `english-nfkc-1`. Functions implement Unicode NFKC/case/whitespace normalization, punctuation-aware tokenization, conservative stop words retaining negation, lexical overlap, keyword coverage, shared-vocabulary log-TF/IDF vectors and dimension-checked cosine with zero-vector handling. No original transcript is modified. Repetition and limited-information indicators are descriptive only.

Concept matching checks approved phrases and their explicit alternatives, returns original excerpts, and flags negated sentences for contextual review. It does not claim to be a contradiction detector. A missing phrase is “not clearly addressed,” not proof of missing understanding. HR can add alternate phrases when editing drafts.

An independent `EmbeddingProvider` interface and semantic comparison utility support proper embedding vectors. No embedding model or service has been provisioned or connected to the worker. Semantic values are therefore `null` and visibly unavailable. General paraphrase recognition without configured alternatives relies on a permitted LLM or HR; lexical matching alone is not claimed to solve it.

The versioned prompt treats candidate content as untrusted data, includes relevance-category definitions, allows alternative approaches, and prohibits demographic/personality inference and hiring decisions. JSON validation rejects extra/missing fields, invalid categories, duplicate/unexpected question IDs, absent strength evidence, excerpts not found verbatim in the corresponding confirmed answer, and new unsupported summary claims. Summary strengths/review areas must repeat validated question-level observations. Factual claims are labelled “Not Independently Verified.” These checks establish excerpt provenance, not factual truth or correctness of the model’s interpretation.

## Frontend and HR workflow

The existing report page shows report history, exact questions, confirmed answers, approved concepts, cosine diagnostics, concept excerpts, relevance suggestions, strengths, review points and limitations. Pending report data refreshes through the backend every 15 seconds. HR can add notes, flag inaccurate observations, correct a question’s relevance, mark reviewed and request a new report version. Existing recruitment decisions remain separate.

`/admin/assessments/rubrics` provides locked official questions, version history, editable draft fields, new draft versions, approval and optional LLM draft generation. HR manager permissions are required; the usage panel additionally requires super-admin user-management permission. Candidates cannot retrieve unpublished rubrics or trigger assessment actions. Report actions honor the existing recruiter assignment scope. The UI uses the existing surface, typography and theme tokens; Demo Mode does not make these API calls.

## Commands and rollout

From `interviewos-backend`:

```powershell
npm run prisma:generate
npm run db:migrate:status
# Back up an existing populated database before deploying migrations.
npm run db:migrate:deploy
npm run ai:prepare-rubrics
npm run build
# Local mode: JOBS_IN_PROCESS=true with the API.
# Redis deployment: JOBS_IN_PROCESS=false on the API, REDIS_ENABLED=true on worker.
npm run start:worker
```

Review and approve the eight drafts in the HR interface. Add the OpenRouter key privately to the backend environment, then run the fixed-fixture smoke check:

```powershell
$env:RUN_OPENROUTER_SMOKE='true'
npm run ai:smoke
```

The smoke script checks the exact model in the provider catalogue, text input and structured-output metadata, then sends only a built-in fictional response and validates evidence. It consumes the shared application budget. Tests never require live provider calls.

## Verification results

- Backend TypeScript, ESLint and Nest production build passed.
- Frontend TypeScript and ESLint passed; Next.js production build passed (31 generated pages). Initial sandbox build failed on a `.next` directory permission; the authorized host build succeeded.
- Jest: 96 passed, 7 skipped, 103 total; 4 suites passed and one Firebase emulator suite skipped because the emulator was not enabled.
- New tests cover deterministic NLP, empty/short/off-topic/STT/imperfect grammar/injection fixtures, alternate phrases, negation, repetition, cosine and embedding-contract errors; strict output and quote validation; free-provider policy; successful mocked HTTP, invalid credentials/model requests, 429, outage, timeout, malformed/empty/truncated JSON, quota refusal and bounded retries.
- Fictional API/database flow verified candidate submission and idempotency, draft preparation/approval, immutable approved rubrics, local NLP persistence with external processing blocked, consolidated mocked-provider output, persisted report readback, HR corrections and review, new report versions, duplicate reassessment handling and retry exhaustion.
- Live OpenRouter smoke skipped due to missing key. No live provider success is claimed. Redis-hosted scheduling and a browser-driven HR UI/voice regression were not exercised; the same assessment service was exercised through integration tests and production compilation.

## Remaining deployment requirements

Provider approval for applicant data, a configured key and successful synthetic capability smoke, HR approval of reference rubrics, a deployed worker with monitoring, and any independently provisioned embedding model are still required. Current free-model settings intentionally leave persisted interview LLM analysis pending while retaining local NLP and HR review. The 5–10 minute report target remains unverified against real provider latency and is not a guarantee.
