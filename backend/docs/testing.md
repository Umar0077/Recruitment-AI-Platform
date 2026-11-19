# Testing

```bash
npm run typecheck && npm run lint && npm test
```

- `test/unit` — status transition map and role matrix.
- `test/e2e/api.e2e-spec.ts` — boots the full Nest app in-process with Supertest against `TEST_DATABASE_URL`.
  `test/global-setup.ts` applies migrations, empties all tables and re-seeds **only** a database whose name
  contains `test`; the development database is never touched.

Covered: missing/invalid tokens · new users get only CANDIDATE · self-role-escalation blocked · last-admin/self
lockout · validation, page size and sort allowlist · candidate auto-link by verified email · invite pinned to
`HR-CSR-V1` with a 48 h window · cross-candidate access (404) · staff cannot answer · answer before start ·
order enforcement · wrong-set question · empty answer · idempotent duplicate answer · confirmed answer immutable ·
incomplete submit · interrupt/resume · completion · idempotent submit with one review/event/notification per user ·
candidate view hides HR data · no fabricated scores · invalid and system-only status transitions · reviewer cannot
change status · timeline/remark/audit entries · pipeline counts · expiry (410) · question-set publish keeps old
interviews on V1 · integration key required · idempotent intake · analytics permissions.

Manual API checks: Swagger at `http://127.0.0.1:4000/api/docs`, use `test:dev-recruiter` etc. as the bearer token.
