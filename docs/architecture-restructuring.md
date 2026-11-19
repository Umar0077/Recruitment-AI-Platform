# InterviewOS — Architectural Restructuring Report (`frontend/`, `backend/`, `database/`)

Branch: `codex/full-stack-performance` (all commits local; no GitHub push, no database reset, no credential changes).

---

## 1. Original Architecture

Prior to restructuring:
- **Frontend**: Located directly in the repository root (`src/`, `public/`, `tests/`, `package.json`, `next.config.mjs`, `tsconfig.json`, `.env.local`), mixed with root documentation and utility scripts.
- **Backend**: Located in `interviewos-backend/`, containing both the NestJS service (`src/`, `test/`) and the Prisma schema/migrations (`interviewos-backend/prisma/schema.prisma`, `interviewos-backend/prisma/migrations/`).
- **Database & Infrastructure**: Located inside `interviewos-infrastructure/` (`interviewos-infrastructure/database/local/`, `interviewos-infrastructure/database/init/`, `interviewos-infrastructure/backup/`, `interviewos-infrastructure/recording-lab/`, `interviewos-infrastructure/docker/`, `interviewos-infrastructure/nginx/`, `interviewos-infrastructure/firebase/`).

---

## 2. New Architecture

The repository is now cleanly separated into three first-class workspace packages (`frontend/`, `backend/`, `database/`) plus `infrastructure/`, `tests/e2e/`, `scripts/`, and `docs/`:

```text
InterviewOS/
├── frontend/                  # Isolated Next.js 15 frontend package
├── backend/                   # Isolated NestJS 11 backend API & worker package
├── database/                  # Authoritative Prisma schema, migrations, seeds, local PG 17 & backups
├── infrastructure/            # recording-lab/, firebase/, nginx/, deployment/, docs/
├── tests/e2e/                 # Cross-service Playwright browser E2E & performance suite
├── scripts/                   # Root performance & speech WER evaluation scripts
├── docs/                      # Engineering, performance, readiness & architecture reports
├── package.json               # Root npm workspace coordinator
├── package-lock.json
├── .gitignore
├── .editorconfig
└── README.md
```

---

## 3. Exact Moved Files and Folders

| Original Path | New Path | Notes |
|---|---|---|
| `src/**` | `frontend/src/**` | Next.js App Router pages, components, hooks, lib, services, types |
| `public/**` | `frontend/public/**` | Public static assets |
| `tests/**` | `frontend/tests/**` | 40 frontend Vitest test suites & fixtures |
| `package.json`, `package-lock.json` | `frontend/package.json`, `frontend/package-lock.json` | Frontend package metadata & lockfile |
| `next.config.mjs`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `tailwind.config.ts`, `vitest.config.mjs` | `frontend/*` | Frontend build, lint, style & test configuration |
| `.env.example`, `.env.local` (ignored) | `frontend/.env.example`, `frontend/.env.local` | Frontend environment configuration |
| `interviewos-backend/src/**`, `test/**`, `docs/**` | `backend/src/**`, `backend/test/**`, `backend/docs/**` | NestJS modules, guards, integrations, Jest & rollback DB tests |
| `interviewos-backend/package*.json`, `tsconfig*.json`, `nest-cli.json`, `eslint.config.mjs`, `jest*.config.js`, `.env*` | `backend/*` | Backend configuration & ignored `.env` / `secrets/` |
| `interviewos-backend/prisma/schema.prisma` | `database/prisma/schema.prisma` | **Single authoritative Prisma schema** |
| `interviewos-backend/prisma/migrations/**` | `database/prisma/migrations/**` | **Single authoritative migration history (6 migrations)** |
| `interviewos-backend/prisma/seed.ts`, `seed-data.ts` | `database/prisma/seed/seed.ts`, `seed-data.ts` | Authoritative seed data (`backend/prisma/seed.ts` delegates here) |
| `interviewos-infrastructure/database/local/**` | `database/local/**` | Standalone PostgreSQL 17 cluster manager (`pg.mjs`) |
| `interviewos-infrastructure/database/init/**` | `database/init/**` | Least-privilege role initialization (`01-app-role.sh`) |
| `interviewos-infrastructure/backup/*` | `database/scripts/*` | `pg-backup.ps1`, `pg-backup.sh`, `pg-restore.sh` + new `verify-db-state.mjs` |
| `interviewos-infrastructure/recording-lab/**` | `infrastructure/recording-lab/**` | Loopback MinIO + Firebase emulator recording lab |
| `interviewos-infrastructure/firebase/**` | `infrastructure/firebase/**` | Firebase Auth emulator tooling |
| `interviewos-infrastructure/nginx/**` | `infrastructure/nginx/**` | Nginx TLS proxy configuration |
| `interviewos-infrastructure/docker/**` | `infrastructure/deployment/**` | `backend.Dockerfile`, `docker-compose.yml`, `.env.example` |
| `interviewos-infrastructure/docs/**` | `infrastructure/docs/**` | Infrastructure runbooks |

---

## 4. Frontend / Backend / Database Ownership Boundaries

- **`frontend/`**: Owns all UI rendering, client routing, browser speech/media capture, TanStack Query caching, and isolated Demo Mode state. Communicates with `backend/` exclusively via HTTP REST calls (`NEXT_PUBLIC_API_BASE_URL`). Never imports backend modules or `@prisma/client`.
- **`backend/`**: Owns REST controllers, authentication guards (Firebase token verification + Argon2id admin sessions + CSRF checks), RBAC enforcement, OpenRouter/NLP assessment services, S3/MinIO signed URL capabilities, and `PrismaService`.
- **`database/`**: Owns the single authoritative `database/prisma/schema.prisma`, `database/prisma/migrations/`, `database/prisma/seed/`, the local PostgreSQL 17 lifecycle manager (`database/local/pg.mjs`), and backup/verification scripts (`database/scripts/`).

---

## 5. Prisma Schema and Migration Ownership

- **Single Source of Truth**: `database/prisma/schema.prisma` and `database/prisma/migrations/` are the only Prisma schema and migration history in the repository.
- **Client Generation**: `database/prisma/schema.prisma` configures `output = "../../backend/node_modules/.prisma/client"`, and `backend/package.json` configures `"schema": "../database/prisma/schema.prisma"`. Running `npm run db:generate` (or `npm --prefix backend run prisma:generate`) generates `@prisma/client` into `backend/node_modules/.prisma/client` in ~1.5 seconds.

---

## 6. Environment Variable Changes

No environment variable names or values were changed; files were relocated to their owning tier:
- `frontend/.env.local` (and `frontend/.env.example`)
- `backend/.env` (and `backend/.env.example`)
- `database/local/.env` (and `database/.env.example`, `database/local/.env.example`)
- `infrastructure/recording-lab/.env` (and `infrastructure/recording-lab/runtime/*.env`)

---

## 7. Updated Startup Commands

From the repository root:
- **Database**: `npm run db:start`, `npm run db:status`, `npm run db:stop`, `npm run db:generate`, `npm run db:migrate:status`, `npm run db:migrate:deploy`, `npm run db:verify`
- **Backend**: `npm run dev:backend`, `npm run build:backend`, `npm run start:backend`, `npm run typecheck:backend`, `npm run lint:backend`, `npm run test:backend`
- **Frontend**: `npm run dev:frontend`, `npm run build:frontend`, `npm run start:frontend`, `npm run typecheck:frontend`, `npm run lint:frontend`, `npm run test:frontend`
- **Browser E2E & Performance**: `npm run test:performance` (or `npm run test:e2e`)

---

## 8. Deployment Architecture

- **Frontend**: Built and deployed independently from `frontend/` (`npm ci && npm run build && npm run start`).
- **Backend**: Built from `infrastructure/deployment/backend.Dockerfile` with context at the repository root (`docker build -f infrastructure/deployment/backend.Dockerfile -t interviewos-backend .`), bundling `backend/` and `database/prisma/` so `prisma migrate deploy` and the NestJS API/worker run self-contained in production containers.
- **Database**: Managed PostgreSQL 17 or containerized PostgreSQL 17 initialized with `database/init/01-app-role.sh` and migrated via `database/prisma/migrations/`.

---

## 9. Test Results

- **Frontend TypeScript (`npm run typecheck:frontend`)**: **PASS** (0 errors)
- **Frontend ESLint (`npm run lint:frontend`)**: **PASS** (0 errors)
- **Frontend Production Build (`npm run build:frontend`)**: **PASS** (39/39 routes compiled)
- **Frontend Vitest Suite (`npm run test:frontend`)**: **PASS** (**39 passed files / 247 passed tests**, 1 skipped Firebase emulator file / 8 skipped tests, 0 failures)
- **Backend TypeScript (`npm run typecheck:backend`)**: **PASS** (0 errors)
- **Backend ESLint (`npm run lint:backend`)**: **PASS** (0 errors)
- **Backend Production Build (`npm run build:backend`)**: **PASS** (`dist/main.js` and `dist/worker.js` built cleanly)
- **Backend Production Health & Auth Smoke (`check-backend-health.ts`)**: **PASS** (`database: "up"`, anonymous billing endpoints rejected with `401`)
- **Backend Safe Jest Suites**: **PASS** (**257 passed tests, 0 failures** across `auth`: 100, `recordings`: 48, `transcripts`: 25, `usage`: 70, `performance`: 14)
- **Backend Rollback PostgreSQL E2E Matrix (`candidate-to-hr-e2e.integration.ts`)**: **PASS** (**10/10 scenarios**, `fixturesRolledBack: true`, `existingRecordsModified: false`)

---

## 10. Performance Comparison

Post-restructuring headless Chrome 136 verification (`npm run test:performance`) confirmed zero performance regressions from moving into `frontend/`, `backend/`, and `database/`:
- **31/31** route transitions retained existing content and shared headers with immediate inline `InterviewOSInlineLoader` feedback.
- **28/28** responsive viewport checks (`360px`–`1920px`) passed with **0 horizontal overflow**, **CLS <= 0.0561**, and **LCP < 500 ms**.
- **2/2** A4 PDF exports (Light & Dark mode) produced valid `%PDF-` documents (~331 kB) with all Sections A–F present and unsaved drafts excluded.

---

## 11. Database Preservation Verification

Verified before and after restructuring using `npm run db:verify` (`database/scripts/verify-db-state.mjs`) and `npm run db:migrate:status`:

| Check | Before Restructuring | After Restructuring | Status |
|---|---:|---:|---|
| Database Name | `interviewos` | `interviewos` | **IDENTICAL** |
| External Data Directory | `%LOCALAPPDATA%\InterviewOS\pgdata` | `%LOCALAPPDATA%\InterviewOS\pgdata` | **UNCHANGED** |
| Candidates Count | `5` | `5` | **PRESERVED** |
| Applications Count | `5` | `5` | **PRESERVED** |
| Interview Sessions Count | `2` | `2` | **PRESERVED** |
| Confirmed Answers Count | `4` | `4` | **PRESERVED** |
| Admin Credentials Count | `1` | `1` | **PRESERVED** |
| Users Count | `9` | `9` | **PRESERVED** |
| Applied Migrations | `6` (`20261110223405_init` .. `202611180003_interview_recordings`) | `6` (`Database schema is up to date!`) | **PRESERVED** |

---

## 12. Remaining Limitations

- Physical webcam/microphone/screen-share browser permission prompts in the isolated recording lab (`infrastructure/recording-lab/`) and reference-backed physical microphone WER testing remain operator-controlled commissioning steps.
- Real-applicant recording remains intentionally disabled (`RECORDING_ENABLED=false`) until an organization-approved privacy policy reference, retention duration, support email, and production private S3 bucket are configured.
