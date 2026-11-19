# Architecture

## Separation

| Layer | Location | Notes |
|---|---|---|
| Frontend | project root (Next.js 15) | `NEXT_PUBLIC_APP_MODE=demo` (default, in-browser data) or `api` (this backend). No silent fallback between them. |
| Backend | `interviewos-backend/` | NestJS REST API `/api/v1` + optional worker (`dist/worker.js`). Stateless; scale horizontally. |
| Infrastructure | `interviewos-infrastructure/` | Local PostgreSQL without Docker, Docker Compose for Linux servers, Nginx, backups. |

## Request pipeline

```
Nginx (TLS, rate limit) → helmet → CORS allowlist → body limit (100 kB)
  → ThrottlerGuard → AuthGuard (verify Firebase token → load user/roles from DB → @RequirePermissions)
  → ValidationPipe (whitelist, forbidNonWhitelisted) → controller → service (ownership + transactions)
  → ResponseEnvelopeInterceptor { success, data, meta } / AllExceptionsFilter { success:false, error }
```

## Modules (`src/modules`)

| Module | Endpoints |
|---|---|
| auth | `GET auth/me` |
| candidates | `candidates` CRUD (staff), `applications` list/get/timeline, `PATCH :id/status`, `PATCH :id/assignee`, `POST :id/remarks` |
| interviews | invite, list, `me`, get, progress, start, resume, interrupt, `PUT :id/answers/:questionId`, submit, cancel |
| question-sets | list, get version, create/update draft, publish; `GET job-roles` |
| recruitment | `recruitment/pipeline`, `recruitment/statuses`, `hr-reviews`, `assessments` |
| analytics | `analytics/overview` (aggregates only) |
| notifications | own notifications, mark read |
| users | list, set roles, set status, link candidate (Super Admin) |
| audit | `audit-logs` |
| integrations/careers | `POST integrations/careers/applications` (server-to-server key) |
| health | `health/live`, `health/ready` |

## Background work

`src/jobs/maintenance.service.ts` expires interviews past their 48 h window and creates the 24 h reminder
(once per session). Both are idempotent. Without Redis it runs inside the API every 5 minutes
(`JOBS_IN_PROCESS=true`); with Redis the worker runs it as a single BullMQ job scheduler. Expiry is
also enforced on every candidate request, so a delayed job never extends a deadline.

## Not built yet (by design)

- Automated AI assessment / scoring — reports are created as `PENDING` with no scores.
- Email/SMS delivery — notifications are in-app only.
- Media upload — `StorageProvider` is the disabled implementation (`MEDIA_STORAGE_ENABLED=false`).
