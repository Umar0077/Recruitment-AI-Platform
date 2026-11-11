# InterviewOS Backend

NestJS 11 + TypeScript REST API for InterviewOS, backed by PostgreSQL 17 (Prisma) with Firebase Authentication.
Optional Redis/BullMQ worker for background jobs.

```
interviewos-backend/        ← this service (API + worker)
interviewos-infrastructure/ ← local PostgreSQL (no Docker), server compose files, Nginx, backups
(project root)              ← Next.js frontend (unchanged; talks to this API in "api" mode)
```

## Quick start (Windows, no Docker)

1. Start PostgreSQL. See [../interviewos-infrastructure/docs/local-postgres.md](../interviewos-infrastructure/docs/local-postgres.md).
   ```bash
   cd ../interviewos-infrastructure/database/local && npm install && npm run serve
   ```
2. Configure and migrate:
   ```bash
   cp .env.example .env        # set DATABASE_URL / TEST_DATABASE_URL passwords from database/local/.env
   npm install
   npm run db:migrate:deploy
   npm run db:seed             # idempotent; dev users + sample data only outside production
   ```
3. Run:
   ```bash
   npm run start:dev           # http://127.0.0.1:4000/api/v1 · Swagger at /api/docs
   ```
4. Try it (`AUTH_MODE=test` only, refused in production):
   ```bash
   curl -H "Authorization: Bearer test:dev-recruiter" http://127.0.0.1:4000/api/v1/recruitment/pipeline
   ```

## Scripts

| Script | Purpose |
|---|---|
| `start:dev` / `build` / `start` | Develop / compile / run compiled API |
| `start:worker` | BullMQ worker (needs `REDIS_ENABLED=true`) |
| `typecheck`, `lint` | Static checks |
| `test`, `test:unit`, `test:e2e` | Jest; e2e uses `TEST_DATABASE_URL` only (refuses any DB without "test" in its name) |
| `db:migrate:dev` | Create a new migration (development only) |
| `db:migrate:deploy` | Apply migrations (the production strategy, never `db push` / `migrate reset`) |
| `db:seed` | Idempotent reference data + dev sample data |
| `admin:grant -- <uid-or-email> SUPER_ADMIN` | Grant the first staff role from the server shell |
| `db:inspect -- <candidate-email>` | Read-only: show a candidate's latest interview, answers, review and events |

## Documentation

- [Architecture](docs/architecture.md)
- [Database](docs/database.md)
- [API](docs/api.md)
- [Authentication & roles](docs/authentication.md)
- [Firebase setup (Google Sign-In)](docs/firebase-setup.md)
- [Run everything locally in API mode (end-to-end)](docs/local-api-mode.md)
- [Interview lifecycle](docs/interviews.md)
- [Security](docs/security.md)
- [Testing](docs/testing.md)
- Infrastructure: [deployment](../interviewos-infrastructure/docs/deployment.md), [backup & restore](../interviewos-infrastructure/docs/backup-restore.md), [monitoring](../interviewos-infrastructure/docs/monitoring.md)
