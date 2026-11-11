# API

Base path `/api/v1`. Interactive docs: `/api/docs` (when `SWAGGER_ENABLED=true`; keep it off or IP-restricted in production).

## Envelope

```json
{ "success": true, "data": { }, "meta": { "requestId": "…", "page": 1, "limit": 20, "total": 3, "totalPages": 1 } }
{ "success": false, "error": { "code": "INVALID_STATUS_TRANSITION", "message": "…", "details": { } }, "meta": { "requestId": "…" } }
```

Error codes: `VALIDATION_FAILED` 400/422 · `UNAUTHENTICATED` 401 · `FORBIDDEN`/`ACCOUNT_DISABLED` 403 ·
`RESOURCE_NOT_FOUND` 404 · `CONFLICT`, `INVALID_STATUS_TRANSITION`, `INTERVIEW_NOT_STARTED`,
`INTERVIEW_NOT_ACTIVE`, `ANSWER_ALREADY_CONFIRMED` 409 · `INTERVIEW_EXPIRED` 410 ·
`INTERVIEW_INCOMPLETE`, `QUESTION_NOT_IN_SESSION`, `QUESTION_SET_NOT_PUBLISHED` 422 · `RATE_LIMITED` 429 ·
`AUTH_NOT_CONFIGURED`, `FEATURE_DISABLED` 503 · `INTERNAL_ERROR` 500 (no stack traces).

## Lists

`?page=1&limit=20` (max 100) · `search=` (max 100 chars) · `sortBy=` from a per-endpoint allowlist · `sortDir=asc|desc`.

## List filters added for the admin UI

- `GET /applications`: `status`, `category`, `jobRoleId`, `assignedRecruiterId`, `interviewStatus`, `from`, `to` (submitted date), `search`, `sortBy=submittedAt|statusChangedAt|createdAt`.
- `GET /interviews`: `status`, `jobRoleId`, `applicationId`, `reviewStatus`, `reviewOpen=true` (PENDING_REVIEW / IN_REVIEW / FURTHER_REVIEW_REQUIRED), `from`, `to`, `search`. Rows include the latest assessment status.

## Key endpoints

| Method & path | Permission |
|---|---|
| `GET /auth/me` | signed in |
| `GET /job-roles` | signed in |
| `GET /candidates`, `GET /candidates/:id` | candidates:read |
| `POST /candidates`, `PATCH /candidates/:id` | candidates:write |
| `GET /applications`, `/applications/:id`, `/applications/:id/timeline` | applications:read |
| `PATCH /applications/:id/status` `{status, note?, remark?}` | applications:update_status |
| `PATCH /applications/:id/assignee` | applications:update_status |
| `POST /applications/:id/remarks` | hr_remarks:write |
| `POST /interviews` `{applicationId}` · `POST /interviews/:id/cancel` | interviews:invite |
| `GET /interviews` | interviews:read |
| `GET /interviews/me` | interviews:take |
| `GET /candidates/me` — candidate portal: own applications + interview summary, candidate-safe stage (no remarks/reviews) | interviews:take |
| `GET /interviews/:id`, `/:id/progress` | owner candidate or interviews:read |
| `POST /interviews/:id/start` `{consent: true}` (required to start a PENDING interview), `/resume`, `/interrupt`, `/submit` | interviews:take + owner |
| `PUT /interviews/:id/answers/:questionCode` | interviews:take + owner |
| `GET /question-sets`, `/question-sets/versions/:code` | question_sets:read |
| `POST /question-sets/:setCode/drafts`, `PUT /question-sets/versions/:code`, `POST …/publish` | question_sets:manage |
| `GET /recruitment/pipeline` | applications:read |
| `GET /hr-reviews`, `/hr-reviews/:id`, `PATCH /hr-reviews/:id` | interviews:review |
| `GET /assessments`, `/assessments/:id` | assessments:read |
| `GET /analytics/overview?from&to` | analytics:read |
| `GET /analytics/activity?weeks=12` — weekly applications / submitted interviews / completed reviews (SQL) | analytics:read |
| `GET /notifications`, `PATCH /notifications/:id/read`, `POST /notifications/read-all` | signed in (own only) |
| `GET /users`, `PATCH /users/:id/roles`, `/status`, `/candidate` | users:manage |
| `GET /audit-logs` | audit:read |
| `POST /integrations/careers/applications` | `X-Integration-Key` header |
| `GET /health/live`, `/health/ready` | public |

### Saving an answer

```http
PUT /api/v1/interviews/{id}/answers/CSR-001
{ "transcript": "confirmed text", "source": "SPEECH_TO_TEXT", "responseDurationSec": 64,
  "provisionalTranscript": "raw engine text", "engine": "browser-web-speech", "language": "en-US" }
```
Re-sending identical text returns `idempotentReplay: true`; different text for a confirmed answer → 409.
