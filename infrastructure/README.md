# InterviewOS Infrastructure

| Folder | Purpose |
|---|---|
| `database/local/` | PostgreSQL 17 on Windows **without Docker** (official server binaries via `embedded-postgres`) |
| `database/init/` | First-boot SQL/shell for the server PostgreSQL container (creates the non-superuser app role) |
| `firebase/` | Firebase **Auth Emulator** for local sign-in testing (`npm run emulator`) |
| `docker/` | `docker-compose.yml` + backend Dockerfile for **Linux servers** (Postgres, Redis, migrate, API, worker) |
| `nginx/` | Site config + proxy snippet for the API (TLS, rate limit, docs IP-restriction) |
| `backup/` | `pg_dump` backup with verification and retention, safe restore into a new database |
| `docs/` | [local-postgres](docs/local-postgres.md) · [deployment](docs/deployment.md) · [backup-restore](docs/backup-restore.md) · [monitoring](docs/monitoring.md) |

Secrets live only in git-ignored `.env` files. Data directories live outside the repository.
Nothing here has been deployed; there is no production environment yet.
