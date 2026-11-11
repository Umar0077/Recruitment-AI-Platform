# Running InterviewOS end-to-end locally (API mode)

Frontend (Next.js) → Backend (NestJS) → PostgreSQL, with sign-in through the **Firebase Auth Emulator**
(Google sign-in only; no real Google account or Firebase project needed). No Docker.

| Service | Address | Start (each in its own terminal) |
|---|---|---|
| PostgreSQL 17 | 127.0.0.1:5432 | `cd interviewos-infrastructure/database/local && npm run serve` |
| Firebase Auth Emulator | 127.0.0.1:9099 (UI :4001) | `cd interviewos-infrastructure/firebase && npm run emulator` |
| Backend API | 127.0.0.1:4000 | see step 2 |
| Frontend | localhost:3000 | see step 3 |

## 1. Database (first time / after pulling)

```bash
cd interviewos-backend
npm run db:migrate:deploy
npm run db:seed          # idempotent: roles, job roles, HR-FE-V1 / HR-CSR-V1, sample candidates
```

## 2. Backend in Firebase (emulator) mode

In `interviewos-backend/.env` set (development only — refused in production):

```
AUTH_MODE=firebase
FIREBASE_PROJECT_ID=demo-interviewos
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
```

then `npm run build && npm start` (or `npm run start:dev`).

## 3. Frontend in API mode

Create `.env.local` in the project root (git-ignored):

```
NEXT_PUBLIC_APP_MODE=api
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1
NEXT_PUBLIC_FIREBASE_API_KEY=fake-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=localhost
NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-interviewos
NEXT_PUBLIC_FIREBASE_APP_ID=1:000000000000:web:0000000000000000
NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
```

then `npm run dev`. **Switch back to Demo mode** by deleting `.env.local` (or setting `NEXT_PUBLIC_APP_MODE=demo`) and restarting `npm run dev`.

## 4. Test identities

*Continue with Google* opens the emulator's fake account picker; choose **Add new account** and type any email.

- **HR user:** sign in on `/admin/login` with e.g. `hr.manager@bali-tech.example`. You'll see "No workspace access" — that is correct.
  Grant a role from the backend folder: `npm run admin:grant -- hr.manager@bali-tech.example HR_MANAGER`, then reload.
- **Candidate:** HR opens a candidate (e.g. *Sana Malik (Sample)*, `sana@dev.invalid`) and clicks **Issue AI Interview**.
  Then sign in on `/candidate/login` with **the same email**. The verified email links the login to that candidate
  because they now hold an open invitation. Any other email sees "No Interview Linked to This Account".

## 5. Complete a test interview

Candidate: Start AI Interview → Instructions → Consent → Equipment (use *No working microphone?* to type instead) →
Practice → **Continue to Interview** (starts the session in PostgreSQL) → answer and **Confirm** each question.
An answer is saved only when the button returns from "Saving…"; on failure the text stays and **Retry Saving** appears.
Refresh, exit or sign in from another browser at any point — the interview resumes at the first unanswered question.
After question 4 the confirmation screen submits the interview and shows its reference (e.g. `INT-CC5DE0D0`).

## 6. Inspect what was saved

```bash
cd interviewos-backend
npm run db:inspect -- sana@dev.invalid
```

Read-only. Prints status, progress events, each confirmed answer (source, duration, time), the HR review, remark count
and the recruitment events.

## 7. HR review

`/admin/interviews?tab=review` → open the interview → read the four answers → **Add Remark** → set **Review status: Reviewed**
→ **Shortlist**. Check `/admin/pipeline` (card under *Shortlisted*), the candidate's *Recruitment History* tab, and the audit
trail (`GET /api/v1/audit-logs`, Super Admin / HR Manager).

## Browser tests without a popup

The built-in Claude browser pane blocks popups. In development with the emulator, the page exposes
`window.__interviewosEmulatorSignIn(email)` which signs in through the real Firebase SDK with an emulator-only fake Google
token. It is compiled out of production builds and real Firebase rejects such tokens.
