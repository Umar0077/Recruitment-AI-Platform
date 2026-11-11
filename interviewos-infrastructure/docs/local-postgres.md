# Local PostgreSQL on Windows (no Docker)

Docker Desktop does not run on the development PC, so local development uses the official PostgreSQL 17
server binaries shipped by the `embedded-postgres` npm package, managed by `database/local/pg.mjs`.

```bash
cd interviewos-infrastructure/database/local
npm install
cp .env.example .env      # set PG_SUPERUSER_PASSWORD and APP_DB_PASSWORD (long random values)
npm run serve             # keep this terminal open — PostgreSQL runs in the foreground
```

First run initialises the cluster (scram-sha-256, listens on 127.0.0.1:5432 only) and creates:

- role `interviewos_app` (login, not superuser) — the backend uses this;
- database `interviewos` (development) and `interviewos_test` (automated tests only).

Data: `%LOCALAPPDATA%\InterviewOS\pgdata` · log: `%LOCALAPPDATA%\InterviewOS\postgres.log` (outside the repo, outside OneDrive).

| Command | |
|---|---|
| `npm run serve` | run in the foreground (most reliable) |
| `npm run start` / `stop` / `status` | background via `pg_ctl` |
| `npm run ensure` | re-create the role/databases if missing (never drops anything) |
| `npm run service:install` | **recommended**: register a Windows service that starts with the PC (run from an Administrator terminal), then `net start InterviewOS-PostgreSQL` |
| `npm run service:remove` | unregister the service (data is kept) |
| `npm run backup:cold` | copy the data directory while the server is **stopped** |

Then in `interviewos-backend/.env` set `DATABASE_URL` / `TEST_DATABASE_URL` using `APP_DB_PASSWORD`.

**Troubleshooting** — "pre-existing shared memory block is still in use": an old `postgres.exe` is still
running; stop it (Task Manager or `npm run stop`) and start again.
