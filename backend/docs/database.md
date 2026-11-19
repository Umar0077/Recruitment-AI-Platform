# Database

PostgreSQL 17, schema in `prisma/schema.prisma`, migrations in `prisma/migrations`.

## Conventions

UUID primary keys · `timestamptz` (UTC) · snake_case tables/columns · explicit enums · JSONB only for
flexible application form answers (`applications.details`, `availability`) and metadata.

## Main tables

| Area | Tables |
|---|---|
| Identity | `users` (unique `firebase_uid`), `auth_identities`, `roles`, `permissions`, `role_permissions`, `user_roles` |
| Recruitment | `job_roles`, `candidates`, `applications` (18-value `status`), `recruitment_events` (append-only timeline), `hr_remarks`, `hr_reviews` |
| Questions | `question_sets` → `question_set_versions` (DRAFT/PUBLISHED/RETIRED) → `questions` |
| Interviews | `interview_sessions`, `interview_session_questions` (text snapshots), `interview_answers` (one per session question), `interview_transcripts` (PROVISIONAL vs CONFIRMED), `interview_progress_events` |
| Assessment | `assessment_reports`, `assessment_criteria` (score nullable), `assessment_observations` |
| Operations | `notifications` (unique `dedupe_key`), `audit_logs`, `integration_references`, `media_assets` (metadata only — no bytes), `system_settings` |

## Integrity rules enforced by constraints

- One answer per session question: `interview_answers.session_question_id UNIQUE`.
- One HR review per interview: `hr_reviews.interview_session_id UNIQUE`.
- Idempotent intake: `applications (source, external_application_ref) UNIQUE`.
- Versions: `question_set_versions.version_code UNIQUE`, `(question_set_id, version) UNIQUE`.
- Notifications deduplicated by `dedupe_key`.

Concurrency-sensitive writes (answers, submit, status changes, expiry) lock the row with
`SELECT … FOR UPDATE` inside a transaction, and audit rows are written in the same transaction.

## Migrations

- Development: `npm run db:migrate:dev -- --name <change>` creates a migration; review the SQL before committing.
- Servers: `npm run db:migrate:deploy` only. Never `prisma db push` or `prisma migrate reset` on real data.
- Take a backup before applying a migration in production (see backup-restore.md).

## Seed

`npm run db:seed` is idempotent: roles/permissions (synced to `src/common/constants/permissions.ts`),
the two job roles, and the official question sets `HR-FE-V1` / `HR-CSR-V1` with exact HR wording.
A published version is never rewritten; if `seed-data.ts` differs, the seed warns instead.
Development users and three sample candidates (`is_sample = true`) are created only when
`NODE_ENV != production`.
