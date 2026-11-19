# InterviewOS — AI Recruitment Platform

**Organization:** BaliTech · **Powered by:** GO Connectivo

InterviewOS is a full-stack AI-assisted recruitment platform with structured voice/text candidate interviews, speech-to-text provenance (`original`, `cleaned`, `confirmed`), evidence-based HR assessment reports with A4 PDF export, a 18-stage recruitment Kanban pipeline, consent-gated private recording infrastructure, and an isolated client demonstration mode.

---

## 1. Repository Architecture

The repository is organized into three clearly separated core application packages (`frontend/`, `backend/`, `database/`) plus supporting `infrastructure/`, `tests/e2e/`, `scripts/`, and `docs/`:

```text
InterviewOS/
├── frontend/                  # Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS
│   ├── src/
│   │   ├── app/               # Candidate & Admin App Router pages and layouts
│   │   ├── components/        # UI, auth, interview, chart, navigation & API components
│   │   ├── hooks/             # Speech, microphone, focused-interview & demo hooks
│   │   ├── lib/               # API client, Firebase auth, TanStack Query, demo store, PDF export
│   │   ├── services/          # Browser STT/TTS, recording controller & multipart upload monitor
│   │   └── types/             # Shared frontend TypeScript contracts
│   ├── public/                # Static brand and public assets
│   ├── tests/                 # Frontend Vitest unit & integration suites
│   ├── package.json
│   ├── next.config.mjs
│   ├── tsconfig.json
│   └── .env.example
│
├── backend/                   # NestJS 11 REST API, BullMQ workers, Firebase Admin, Argon2id
│   ├── src/
│   │   ├── modules/           # auth, candidates, interviews, recruitment, assessment, analytics,
│   │   │                      # notifications, question-sets, recordings, users, audit, health
│   │   ├── common/            # Guards, decorators, RBAC permissions, access scope, pagination
│   │   ├── config/            # Environment validation
│   │   ├── integrations/      # Firebase token verifier & private S3/MinIO recording storage
│   │   └── database/          # PrismaService lifecycle
│   ├── prisma/                # Runtime verification, health, lab & narrow migration guards
│   ├── test/                  # Jest suites & rollback-only PostgreSQL integration tests
│   ├── package.json
│   ├── nest-cli.json
│   ├── tsconfig.json
│   └── .env.example
│
├── database/                  # Single authoritative Prisma schema, migrations & PostgreSQL manager
│   ├── prisma/
│   │   ├── schema.prisma      # Single authoritative PostgreSQL schema
│   │   ├── migrations/        # Authoritative additive SQL migrations
│   │   └── seed/              # Idempotent roles, permissions & official HR question sets
│   ├── local/                 # Standalone local PostgreSQL 17 cluster manager (pg.mjs)
│   ├── init/                  # Least-privilege container DB role initialization
│   ├── scripts/               # Read-only DB state verifier & pg_dump backup/restore scripts
│   ├── backups/               # Ignored local backup destination (.gitkeep tracked)
│   ├── package.json
│   └── .env.example
│
├── infrastructure/            # Deployment, reverse proxy & isolated recording lab
│   ├── recording-lab/         # Loopback MinIO + Firebase Auth emulator recording test lab
│   ├── firebase/              # Local Firebase Auth emulator tooling
│   ├── nginx/                 # Production TLS reverse-proxy configuration
│   ├── deployment/            # Production backend.Dockerfile & docker-compose.yml
│   └── docs/                  # Infrastructure & backup runbooks
│
├── tests/
│   └── e2e/                   # Cross-service headless Chrome Playwright E2E & performance runner
├── scripts/                   # Performance, build-smoke & speech WER utilities
├── docs/                      # Architecture, performance, security & commissioning reports
├── package.json               # Root npm workspace coordinator
├── .gitignore
├── .editorconfig
└── README.md
```

---

## 2. Technology Stack & Requirements

- **Node.js**: `>= 20.11` (tested on Node `v23.10.0`)
- **Frontend**: Next.js 15.5, React 19, TypeScript 5.8, Tailwind CSS 3.4, TanStack Query v5, TanStack Table v8, Zustand v5, Recharts (deferred), Firebase Web SDK v12
- **Backend**: NestJS 11, TypeScript 5.8, Prisma 6, Argon2id (`argon2`), Firebase Admin SDK v13, AWS SDK v3 S3 client (private S3/MinIO multipart uploads), Pino structured logging
- **Database**: PostgreSQL 17 (managed locally via `database/local/pg.mjs` with external data directory `%LOCALAPPDATA%\InterviewOS\pgdata` on Windows, or external/Docker PostgreSQL 17 on Linux)

---

## 3. Environment Configuration

Each tier manages its own `.env` file (all `.env*` files except `.env.example` are Git-ignored):

1. **Database (`database/local/.env`)**:
   - Copy `database/.env.example` (or `database/local/.env.example`) to `database/local/.env`.
   - Defines `PG_PORT=5432`, `PG_SUPERUSER`, `PG_SUPERUSER_PASSWORD`, `APP_DB_USER`, `APP_DB_PASSWORD`.
2. **Backend (`backend/.env`)**:
   - Copy `backend/.env.example` to `backend/.env`.
   - Defines `DATABASE_URL`, `TEST_DATABASE_URL`, `FRONTEND_ORIGINS`, `AUTH_MODE=firebase`, `FIREBASE_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS`, `OPENROUTER_API_KEY`, and recording policy flags (`RECORDING_ENABLED=false` by default for real applicants).
3. **Frontend (`frontend/.env.local`)**:
   - Copy `frontend/.env.example` to `frontend/.env.local`.
   - Set `NEXT_PUBLIC_APP_MODE=demo` for isolated client demo mode or `NEXT_PUBLIC_APP_MODE=api` with `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1` and `NEXT_PUBLIC_FIREBASE_*` keys for connected API mode.

---

## 4. Independent Startup Workflow (Windows PowerShell & Linux)

### A. Database Startup & Verification

**Windows PowerShell (from repository root):**
```powershell
npm run db:start
npm run db:status
npm run db:generate
npm run db:migrate:status
npm run db:verify
```

**Linux / macOS:**
```bash
npm run db:start
npm run db:migrate:deploy
npm run db:verify
```

### B. Backend Startup

**Windows PowerShell:**
```powershell
# Development watch mode
npm run dev:backend

# Production build & start
npm run build:backend
npm run start:backend
```

**Linux / macOS:**
```bash
npm --prefix backend run build
npm --prefix backend run start
```

### C. Frontend Startup

**Windows PowerShell:**
```powershell
# Development server (Turbopack)
npm run dev:frontend

# Production build & start (Demo Mode example on port 3300)
$env:NEXT_PUBLIC_APP_MODE = 'demo'
npm run build:frontend
npx --prefix frontend next start frontend --hostname 127.0.0.1 --port 3300
```

**Linux / macOS:**
```bash
NEXT_PUBLIC_APP_MODE=api npm run build:frontend
npm run start:frontend
```

---

## 5. Automated Testing & Quality Checks

Run from the repository root:

```powershell
# TypeScript & ESLint
npm run typecheck:frontend
npm run lint:frontend
npm run typecheck:backend
npm run lint:backend

# Frontend Vitest suite (247 tests across auth, speech, recording, api-usage, performance)
npm run test:frontend

# Backend safe Jest suites (257 tests; never resets PostgreSQL)
npm run test:backend
npx --prefix backend jest --config backend/jest.transcripts.config.js --runInBand
npx --prefix backend jest --config backend/jest.performance.config.js --runInBand

# Rollback-only PostgreSQL integration tests (uses TEST_DATABASE_URL ending in _test)
Set-Location backend
npx tsx test/transcripts-db/candidate-to-hr-e2e.integration.ts
npx tsx test/transcripts-db/assignment.integration.ts
npx tsx test/transcripts-db/persistence.integration.ts
npx tsx test/auth-db/profile.integration.ts
npx tsx test/auth-db/admin.integration.ts
npx tsx test/recordings-db/persistence.integration.ts
npx tsx test/usage-db/usage.integration.ts
Set-Location ..

# Real Headless Chrome E2E & Performance Suite
npm run test:performance
```

> **Important Database Safety Note:** Do not run `prisma migrate reset` or the legacy reset-based default `jest` command against existing development databases. Always use the dedicated safe Jest configs (`test:auth`, `test:recordings`, `test:usage`, `jest.transcripts.config.js`, `jest.performance.config.js`) and rollback integration scripts above.

---

## 6. Isolated Recording Lab Setup

See [infrastructure/recording-lab/README.md](infrastructure/recording-lab/README.md) for the full loopback MinIO + Firebase Auth emulator recording lab workflow:

```powershell
npm --prefix backend run recording:lab:init
Set-Location infrastructure/recording-lab
docker compose --env-file .env -f compose.yml up -d --build
node ../firebase/node_modules/firebase-tools/lib/bin/firebase.js emulators:start --only auth --project demo-interviewos-recording --config firebase.json
```

---

## 7. Deployment Architecture

- **Frontend (`frontend/`)**: Independently deployable Next.js application; communicates with the backend exclusively over HTTPS (`NEXT_PUBLIC_API_BASE_URL`). Never imports backend modules, Prisma Client, or database credentials.
- **Backend (`backend/`)**: Independently deployable NestJS API and BullMQ worker container built via `infrastructure/deployment/backend.Dockerfile` (`docker build -f infrastructure/deployment/backend.Dockerfile -t interviewos-backend .`) and orchestrated with `infrastructure/deployment/docker-compose.yml` behind `infrastructure/nginx/interviewos-api.conf`.
- **Database (`database/`)**: Single authoritative Prisma schema (`database/prisma/schema.prisma`) and migration history (`database/prisma/migrations/`), connecting to a dedicated PostgreSQL 17 host over TLS/internal network.
