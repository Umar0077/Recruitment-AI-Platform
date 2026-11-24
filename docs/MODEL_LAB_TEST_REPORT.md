# BaliTech InterviewOS — Facial Expression V5 Model Lab Test Report

## 1. Commands Executed & Results

| Component | Command | Result |
|---|---|---|
| Backend TypeScript | `npm --prefix backend run typecheck` | **Passed** (0 errors) |
| Backend Lint | `npm --prefix backend run lint` | **Passed** (0 errors) |
| Backend Auth & Model Lab Tests | `npm --prefix backend run test:auth` | **Passed** (`6` suites, `106` tests passed) |
| Backend Build | `npm --prefix backend run build` | **Passed** (`nest build` succeeded) |
| Frontend TypeScript | `npm --prefix frontend run typecheck` | **Passed** (0 errors) |
| Frontend Lint | `npm --prefix frontend run lint` | **Passed** (0 errors, 0 warnings) |
| Frontend Auth & Model Lab Tests | `npm --prefix frontend run test:auth` | **Passed** (`19` files passed / `1` firebase-emulator skipped; `121` passed / `8` skipped) |
| Frontend Production Build | `npm --prefix frontend run build` | **Passed** (`next build` succeeded, `40/40` static pages including `/admin/model-lab` `15.9 kB`) |
| Python V5 Preprocessing Tests | `.\.venv\Scripts\python.exe -m pytest -v tests/test_preprocessing_and_ensemble.py` | **Passed** (`3/3` in `19.24s`) |
| Live NestJS -> FastAPI V5 Bridge | Compiled `ModelLabModule` -> live `http://127.0.0.1:8765` | **Passed** (`health: ready`, `labels: 7 classes`, `inferFrame: NO_FACE_DETECTED` in `4.29 ms`) |
| Database Schema & Data Check | `npm --prefix backend run db:migrate:status` & `npm --prefix database run verify` | **Passed** (`6/6` migrations applied, `candidates: 1, applications: 1, interviews: 1, admins: 1, users: 2`) |

---

## 2. Backend Integration Coverage (`backend/test/auth/model-lab.spec.ts`)

- Authorized `SUPER_ADMIN` (`admin-password` session + `users:manage` + `X-Admin-Request: 1` + allowed `Origin`) permitted.
- Unauthenticated requests (`401 UNAUTHENTICATED`), Firebase candidate bearer tokens (`403 FORBIDDEN`), and non-Super-Admin HR roles (`403 FORBIDDEN`) rejected.
- Missing `X-Admin-Request: 1` header and untrusted `Origin` rejected (`403 FORBIDDEN`).
- `MODEL_LAB_ENABLED=false` disables access cleanly (`status: "disabled"`, `503 MODEL_LAB_DISABLED`).
- Missing `V5_SERVICE_TOKEN` and offline FastAPI (`ECONNREFUSED`) handled without crashing (`status: "unconfigured"` / `"offline"`, `503 MODEL_SERVICE_UNAVAILABLE`).
- Upstream timeouts (`504 MODEL_INFERENCE_TIMEOUT`), oversized uploads (`413 IMAGE_TOO_LARGE`), and invalid/non-image payloads (`415/422 INVALID_IMAGE_UPLOAD`) verified.
- Authorized frame forwarding verified `Authorization: Bearer <V5_SERVICE_TOKEN>` attached server-side only and never leaked in responses.

---

## 3. Frontend & Navigation Coverage (`frontend/tests/auth/model-lab.test.jsx`)

- `Model Lab` navigation item (`ALL_NAV`) visible only for `SUPER_ADMIN` with `users:manage`, hidden for `HR_MANAGER`, `RECRUITER`, `REVIEWER`, and `CANDIDATE`.
- Non-Super-Admin users see `Model Lab access restricted` without calling backend diagnostics.
- Camera does not start automatically on mount (`getUserMedia` not invoked until clicking `Start Camera`).
- `Start Camera` passes `audio: false`; `Stop Camera` and component unmount both stop active MediaStream tracks.
- Offline FastAPI status (`status: "offline"`) renders `Offline` badge and readable error message.
- Photo upload, all 7 category probability bars, `NO_FACE_DETECTED` (`"No face detected — adjust the camera or image and try again."`), and `MULTIPLE_FACES_DETECTED` verified.

---

## 4. Database Safety Confirmation

- Zero Prisma migrations added or altered (`6` existing migrations intact).
- No `db:seed`, `admin:bootstrap`, `admin:recover`, reset, or truncate operations executed.
- `npm --prefix database run verify` confirmed `interviewos` PostgreSQL database connected and all pre-existing counts (`candidates: 1`, `applications: 1`, `interviews: 1`, `admins: 1`, `users: 2`) preserved.

---

## 5. What Was Not Tested Live

- **Live Chrome UI walkthrough & physical webcam in `/admin/model-lab`:** Chrome remote debugging (`DevToolsActivePort`) was unavailable, and the pre-existing `node dist/main` (`PID 12608` on port `4000`) and `next` (`PID 15612` on port `3000`) processes were started before these edits and intentionally left undisturbed. Restarting those two local servers is required before opening `http://localhost:3000/admin/model-lab` in Chrome.
- **Firebase Auth Emulator tests:** `tests/auth/firebase-emulator.test.js` (`8` tests) was skipped because the Firebase emulator was not running during the Vitest run.
