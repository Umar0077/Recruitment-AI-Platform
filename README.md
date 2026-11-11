# InterviewOS — AI Recruitment & Interview Platform (UI Prototype)

An interactive, frontend-only prototype for stakeholder design approval. It covers the
candidate interview experience and the HR recruitment workspace. **Everything is simulated
in the browser**: logins, interviews, assessments, and status changes use fictional demo data.
There is no backend, no real AI, no recording, and no production authentication.

> "InterviewOS" is a placeholder name. Change it in one place: `src/lib/brand.ts`.

## Setup

Requires Node.js 18.18+ (tested on Node 23).

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript rules) |

## Demo walkthroughs

**Candidate** — `/` → *Start Your Interview* → sign in with any email and password →
*Start Preparation* → Instructions → Consent (tick the box) → Equipment Check
(*Test My Camera & Microphone* for a real browser check, or *Run Demo Equipment Check*) →
Practice → *Begin Interview* → answer 4 questions (*Finish Answer*, or let the timer run;
"Fast demo pace" keeps it short) → submission confirmation → status page.
Choosing *End* mid-interview shows the resume flow.
Switch between the Fresher and Experienced FE Closer tracks on the welcome screen.

**HR admin** — `/admin/login` → any email and password → Overview → Candidates
(search, filter by role) → a profile → *View Interview* (simulated playback + transcript) →
*View Assessment* → add a remark → *Shortlist Candidate* → Recruitment Pipeline (the
candidate is now in Shortlisted) → Analytics → Jobs & Interview Setup → HR Team → Settings
→ notifications bell → Settings › Demo Controls › *Reset Demo*.

Press **Ctrl/Cmd + K** in the admin area to search candidates, interview IDs, roles, and pages.

A submitted candidate-side interview appears in the admin workspace as *Awaiting Review*,
because both sides share one demo store.

## Routes

| Candidate | |
| --- | --- |
| `/` | Invitation landing page |
| `/candidate/login` | Candidate demo login |
| `/candidate/interview` | Welcome / invitation |
| `/candidate/interview/instructions` | Instructions |
| `/candidate/interview/consent` | Recording consent |
| `/candidate/interview/equipment` | Equipment check (real or simulated) |
| `/candidate/interview/practice` | Practice question |
| `/candidate/interview/session` | Main AI interview |
| `/candidate/interview/complete` | Submission confirmation |
| `/candidate/interview/resume` | Resume unfinished interview |
| `/candidate/interview/unavailable?reason=expired\|session\|connection\|service` | Error states |
| `/candidate/status` | Candidate status timeline |

| Admin | |
| --- | --- |
| `/admin/login` | Admin demo login |
| `/admin` | Recruitment overview dashboard |
| `/admin/candidates`, `/admin/candidates/[id]` | Candidate table and profile |
| `/admin/interviews`, `/admin/interviews/[id]` | Interview list and review workspace |
| `/admin/assessments`, `/admin/assessments/[id]` | Assessment list and report (`[id]` = interview ID) |
| `/admin/pipeline` | Kanban pipeline with drag-and-drop |
| `/admin/interview-setup` | Job roles, question sets, interview settings |
| `/admin/analytics` | Analytics, CSV export, print layout |
| `/admin/team` | HR team, roles, permissions matrix |
| `/admin/settings` | Settings, including **Demo Controls** |
| `/admin/help` | Help and shortcuts |

## Project structure

```
src/app                 Routes (App Router). Admin screens live in the (app) route group.
src/components/ui       Design-system primitives (Button, GlassCard, Badge, inputs, dialogs, tabs…)
src/components/landing  Landing page sections
src/components/candidate Candidate shell, stepper, demo login form
src/components/interview Interview parts + deterministic interview state machine
src/components/admin    Admin shell, command palette, actions, review panel, widgets
src/components/charts   Recharts wrappers (trend, donut, bars, funnel)
src/components/visuals  AI Intelligence Core (SVG/CSS/canvas) + static fallback
src/components/motion   Reveal / page transition helpers (Motion)
src/lib/brand.ts        Brand + interview timing config
src/lib/demo            Seeded fictional dataset, statuses, questions, assessments, store
src/styles/tokens.css   Color, surface, and motion tokens
```

### Key components

AppLogo / BrandMark, GlassNavbar, Button (primary/secondary/ghost/outline/danger), GlassCard,
Badge / RecruitmentStatusBadge / InterviewStatusBadge, MetricCard, PageHeader, SectionHeading,
EmptyState, Skeleton / SkeletonTable, SearchInput, Select, Tabs, Accordion, Dialog,
ConfirmationDialog, Drawer, DropdownMenu, Tooltip, Popover, CandidateAvatar, InterviewProgress,
QuestionCard, AIRegion, AICore, AudioWaveform, CameraPreview, ResponseTimer, EquipmentCheckItem,
ScoreBar, Timeline, KanbanCard, ChartContainer, NotificationCenter, CommandPalette, ReviewPanel.

### Demo data and state

- `src/lib/demo/seed.ts` generates 96 fictional candidates (both tracks, every status) with
  matching interviews, transcripts, and timelines from a fixed seed.
- `src/lib/demo/store.ts` (Zustand) is the single source of truth for both sides. It persists
  **non-sensitive demo data only** to `localStorage` (`interviewos-demo-v2`).
- Dashboard, table, profile, pipeline, and analytics figures are all derived from the same records.
- Demo login (`src/components/candidate/demo-login-form.tsx`) accepts any non-empty values,
  sends nothing, and discards the password immediately. It is isolated so real auth can replace it.

### Brand logo

`BrandMark` is an SVG recreation of the supplied four-loop logo. To use the original image file,
save it as `public/brand/logo.png` and set `logoSrc: "/brand/logo.png"` in `src/lib/brand.ts`.

## Design decisions

- **Hero visual:** an original "AI Intelligence Core" built with SVG, CSS, and a small canvas
  particle field instead of Three.js. The brief allowed this; it is lighter, stays crisp at any
  size, works without WebGL, and has a static fallback. It reacts to interview state
  (speaking / listening / processing), CTA hover, and mouse parallax on desktop.
- **Motion:** GSAP for the hero timeline and the How-It-Works scroll line; Motion for page,
  card, and interview-state transitions; CSS for hover and focus. Reduced-motion is respected,
  and Settings › Appearance › Reduce motion forces it.
- **AI assessment wording** presents scores as illustrative decision support. No facial,
  emotion, or personality analysis appears anywhere.

## Known limitations

- No backend, database, real AI scoring, recording, transcription, email, or authentication.
  Client-side route guards are for demo flow only and are not security.
- Interview playback is simulated (no media file); the transcript is fictional sample content.
- The equipment check's *real* mode uses browser camera/microphone APIs for a live preview and
  level meter only; nothing is recorded or uploaded.
- Demo data lives in each browser's localStorage; use *Reset Demo* to restore it.
- PDF export uses the browser print dialog ("Save as PDF"); there is no generated PDF.
- Theme "System" follows the device setting on load and when the OS theme changes.
- Recharts 2.15 is used for stability; npm reports it as no longer actively developed.

## Themes

Light, Dark (default), and System themes use `next-themes`. The choice is saved in
`localStorage` (`interviewos-theme`) and applied before first paint, so there is no flash.
Toggles live in the landing navbar, candidate and interview headers, both login screens, the
admin top bar, and Settings › Appearance.

All colors come from tokens in `src/styles/tokens.css` (`.dark` and `.light` blocks). Components use
token classes (`bg-ink-*`, `text-fg-*`, `border-subtle`, `bg-overlay/[…]`) or `dark:` pairs for
status colors. To adjust a theme, edit the tokens rather than individual components.

## Voice interview

The interview is a real turn-based voice flow: the AI interviewer reads each question aloud,
the candidate clicks the microphone, answers, reviews/edits the transcript, and confirms.

| Piece | Implementation | Location |
| --- | --- | --- |
| Interviewer voice (TTS) | Browser `speechSynthesis`; prefers a clearly female English voice (en-IN/en-GB/en-US), falls back to the clearest English voice | `src/services/speech/browser-tts.ts` |
| Speech-to-text | Browser Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) with interim + final results | `src/services/speech/browser-stt.ts` |
| Microphone | `getUserMedia` requesting echo cancellation, noise suppression, auto gain; UI reports only what the browser confirms | `src/services/speech/audio-devices.ts` |
| Level meter / low-input warning | Web Audio `AnalyserNode` (analysis only) | `src/services/speech/audio-quality.ts` |
| Interview flow | Reducer state machine with an allowed-transition table | `src/components/interview/voice-machine.ts` |

Providers implement `TTSProvider` / `STTProvider`, so a server-side neural voice or a backend
transcription service can replace the browser engines without changing the interview UI.

**Browser support.** Voice transcription works in Chrome and Edge on desktop (and Chrome on
Android); Safari support is partial; Firefox has none. In Chrome, recognition audio is processed by
the browser vendor's speech service. When recognition or the microphone is unavailable, the
candidate can type answers. Available voices depend on the operating system — on Windows, for
example, "Microsoft Zira" is the female English voice. Answers are saved as text only; no audio
is stored or uploaded (the equipment check's 5-second test clip stays in memory and is discarded).

Confirmed answers appear in the admin interview review as a "Live demo transcript". The assessment
page for such interviews clearly states that its scores are placeholders, not derived from the answers.


## Official HR question sets (Phase 2)

Source: HR document "AI Interview process – FE CLOSER – I9 branch" (questions on p. 6, timing on p. 7).
Defined once in `src/lib/demo/questions.ts` and used by TTS playback, the interview screen, admin review, and the assessment.

| Set | Track | Questions (in order) |
| --- | --- | --- |
| `HR-FE-V1` | Experienced FE Closer | FE-001 FE Experience · FE-002 Performance & Results · FE-003 Objection Handling · FE-004 Closing Strategy |
| `HR-CSR-V1` | Customer Sales Representative (Fresher) | CSR-001 Self-Introduction · CSR-002 Communication Skills · CSR-003 Sales Aptitude · CSR-004 Coachability & Resilience |

- Wording and order are copied exactly from the document and are locked; edits in Jobs & Interview Setup are saved as drafts only and never asked.
- Every interview stores its question-set id, and every answer stores a snapshot of the question asked, so reviews stay correct if a set changes (bump to `HR-FE-V2` etc.).
- Timing lives in `INTERVIEW_CONFIG` (`src/lib/brand.ts`): 90 s per answer (HR guidance 60–90 s), 48-hour completion window, 24-hour reminder.
- The practice question is a provisional demo choice (the HR document requires one but gives no wording). It is never scored or saved.
- **Open item:** the HR document states two overall durations — 10–12 minutes (pp. 1, 3) and 15–20 minutes (p. 6). The UI keeps the existing "Approximately 10–15 minutes" until HR confirms; change `INTERVIEW_CONFIG.durationLabel` to update every screen.

## Backend (Phase 3)

The real backend lives in [`interviewos-backend/`](interviewos-backend/README.md) (NestJS + PostgreSQL + Firebase Auth) and
its deployment/database tooling in [`interviewos-infrastructure/`](interviewos-infrastructure/README.md).

The frontend has two explicit modes (see `.env.example`, `src/lib/config/environment.ts`):

| `NEXT_PUBLIC_APP_MODE` | Behaviour |
|---|---|
| `demo` (default) | Everything runs on the in-browser demo store, exactly as before. No network calls. |
| `api` | Uses the typed client in `src/lib/api` against `NEXT_PUBLIC_API_BASE_URL`. Failed requests raise `ApiError`; they never fall back to demo data. |

**Sign-in (Phase 4A).** In `api` mode both login screens offer *Continue with Google* — Google Sign-In through Firebase Authentication is the
only sign-in method ( `src/lib/auth`, `src/components/auth`). Candidate and admin pages render only after Firebase
and the backend confirm access; the backend re-checks every request. Demo mode keeps the isolated demo login.
Setup: [Firebase / Google Sign-In](interviewos-backend/docs/firebase-setup.md).

**Phase 4B — every screen works against the real backend in API mode.** Candidate invitation, consent, start, answer saving
(only after the server confirms), resume (refresh / exit / another browser), submission and status; HR dashboard, candidates,
profile, interviews, interview review, remarks, review status, pipeline moves, analytics, notifications, team and question sets.
Demo mode is unchanged. Step-by-step local run (PostgreSQL + Firebase Auth Emulator + backend + frontend):
[interviewos-backend/docs/local-api-mode.md](interviewos-backend/docs/local-api-mode.md).
