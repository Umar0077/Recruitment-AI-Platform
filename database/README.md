# InterviewOS Database (`database/`)

Dedicated database package owning the **single authoritative Prisma schema**, migration history, seed data, local PostgreSQL 17 server manager, initialization scripts, and backup utilities.

## Structure

- `prisma/schema.prisma` — Single authoritative PostgreSQL schema (generates Prisma Client into `backend/node_modules/.prisma/client`).
- `prisma/migrations/` — Authoritative additive SQL migration history.
- `prisma/seed/` — Idempotent roles, permissions, job roles, and official HR question sets (`seed.ts`, `seed-data.ts`).
- `local/pg.mjs` — Standalone local PostgreSQL 17 cluster manager (no Docker required; stores data outside the repository at `%LOCALAPPDATA%\InterviewOS\pgdata`).
- `init/01-app-role.sh` — Least-privilege role initialization for container deployments.
- `scripts/` — Backup, restore, and read-only database state verification utilities (`verify-db-state.mjs`, `pg-backup.ps1`, `pg-backup.sh`, `pg-restore.sh`).
- `backups/` — Ignored directory for local database backups (`.gitkeep` tracked).

## Commands

Run from the repository root (or inside `database/`):

```powershell
npm run db:start
npm run db:status
npm run db:stop
npm run db:generate
npm run db:migrate:status
npm run db:migrate:deploy
npm run db:verify
```
