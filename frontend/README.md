# InterviewOS Frontend (`frontend/`)

Next.js 15 (App Router) + React 19 + TypeScript + Tailwind CSS frontend for **InterviewOS** (BaliTech · Powered by GO Connectivo).

## Commands

Run from `frontend/` (or from the repository root via `npm run <script>:frontend`):

```powershell
# Development server (Turbopack)
npm run dev

# Typecheck & ESLint
npm run typecheck
npm run lint

# Production build & start
npm run build
npm run start

# Unit & integration tests (Vitest)
npm test
```

## Environment

Copy `.env.example` to `.env.local`. Set `NEXT_PUBLIC_APP_MODE=demo` for isolated client demonstration mode or `NEXT_PUBLIC_APP_MODE=api` with `NEXT_PUBLIC_API_BASE_URL` and Firebase client keys for connected API mode.
