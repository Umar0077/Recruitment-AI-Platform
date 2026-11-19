# Monitoring

| Signal | Source |
|---|---|
| Liveness | `GET /api/v1/health/live` → 200 while the process runs (Docker `HEALTHCHECK` uses it) |
| Readiness | `GET /api/v1/health/ready` → 200 when PostgreSQL (and Redis, if enabled) respond, else 503 |
| Logs | JSON (pino) on stdout: request id, method, path, status, latency. No tokens, bodies or transcripts. `docker compose logs -f api worker` |
| Request tracing | every response carries `meta.requestId`; Nginx forwards `X-Request-Id` |
| Background jobs | worker logs "Maintenance run" with counts of expired interviews and reminders |
| Backups | `/var/log/interviewos-backup.log`; alert if no new `.dump` within 26 h |

Suggested first alerts: readiness failing for 2 minutes · 5xx rate > 1 % · disk > 80 % on the database volume ·
missing nightly backup. An uptime checker (e.g. UptimeRobot) on `/health/ready` is enough to start;
Prometheus/Grafana can be added later.
