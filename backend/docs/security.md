# Security

| Control | Where |
|---|---|
| Verified Firebase tokens, revocation checked, fail closed | `integrations/firebase/token-verifier.ts`, `modules/auth` |
| Roles from DB only; least privilege for new users | `auth.service.ts` |
| Permission checks + ownership checks in services | `@RequirePermissions`, `interviews.service.ts`, `AccessScope` |
| Input validation, unknown fields rejected, sizes capped | global `ValidationPipe`, DTOs, 100 kB body limit |
| Sorting/filtering only on allowlisted fields | `*_SORT` constants in each module |
| Rate limiting | `ThrottlerGuard` (default 300/min per IP; stricter on answers and intake) + Nginx `limit_req` |
| CORS exact-origin allowlist, no credentials, no `*` in production | `bootstrap.ts`, `env.validation.ts` |
| Security headers | helmet; HSTS at Nginx |
| Errors never leak stack traces or SQL | `AllExceptionsFilter` |
| Logs redact `Authorization`, cookies, integration key and **all request bodies** (answers/transcripts) | `app.module.ts` pino config |
| Audit trail in the same transaction as the change | `AuditService.record(…, tx)` |
| Integration key compared in constant time | `careers.module.ts` |
| Secrets only in git-ignored `.env`; examples hold no values | `.gitignore`, `.env.example` |
| DB app role is not a superuser; PostgreSQL bound to 127.0.0.1 / internal network only | infrastructure |
| No public candidate-creation endpoint | staff `POST /candidates` or keyed integration only |
| No audio/video bytes in PostgreSQL | `media_assets` metadata + disabled storage provider |

Before production: real Firebase project, rotate every secret from `.env.example`, `SWAGGER_ENABLED=false`
(or IP-restricted), `TRUST_PROXY=true` behind Nginx, backups scheduled and a restore tested.
