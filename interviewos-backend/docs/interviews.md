# Interview lifecycle

## Statuses

Interview (`interview_sessions.status`) — separate from the recruitment status:

```
PENDING ──start──► IN_PROGRESS ──all answers──► COMPLETED ──submit──► SUBMITTED
                     │   ▲
            interrupt▼   │resume
                  INTERRUPTED
PENDING / IN_PROGRESS / INTERRUPTED ──48 h passed──► EXPIRED     (HR) ──cancel──► CANCELLED
```

Recruitment (`applications.status`) — the 18 official HR statuses. The system sets
`AI_INTERVIEW_PENDING` (invite), `AI_INTERVIEW_IN_PROGRESS` (start), `AI_INTERVIEW_COMPLETED` →
`RECRUITER_REVIEW_PENDING` (submit). Everything else is a manual HR change validated against
`ALLOWED_HR_TRANSITIONS` (`src/common/constants/recruitment.ts`); invalid moves return `409 INVALID_STATUS_TRANSITION`.

## Rules

- **Invite** pins the job role's active *published* question-set version and snapshots every question's text,
  category and 90 s limit into the session. Later publishes never change an issued interview.
- **Window**: `expiresAt = invitedAt + 48 h`; reminder due at +24 h (`INTERVIEW_*_HOURS`).
- **Answers**: only the owning candidate; only while `IN_PROGRESS`; in order; one confirmed answer per
  question; identical re-send is a no-op; changing a confirmed answer is rejected. The raw speech-engine text is
  kept separately as a `PROVISIONAL` transcript.
- **Start** a PENDING interview only with `{ consent: true }`; the consent time is stored on the STARTED progress event.
  Repeated Start/Resume calls on a running interview are no-ops (no extra events).
- **Resume** returns the first unanswered question.
- **Submit** requires all answers, is idempotent, and in one transaction: sets `SUBMITTED`, advances the
  application, creates the HR review and a `PENDING` assessment report, notifies staff once (deduplicated), and audits.
- Another candidate's interview returns `404` (existence is not revealed).

## Question-set versions

`HR-FE` and `HR-CSR` are sets; content lives in versions (`HR-FE-V1`, …). Drafts are editable; publishing makes
the version active and retires the previous one. Published and retired versions are immutable.

## Assessment

No scores are generated from transcripts and nothing is inferred from faces or voice. Reports stay `PENDING`
until an approved evaluation process exists; HR reviews confirmed answers directly.

## Open item

The HR document gives two different total durations (10–12 min and 15–20 min). The frontend shows
"Approximately 10–15 minutes" until HR confirms. The backend stores only the 90 s per-question limit.
