# Deployment (Linux server) — not performed yet

Target: one Linux VM with Docker Engine + Compose, Nginx on the host, a DNS name for the API.

1. **Copy** `interviewos-backend/` and `interviewos-infrastructure/` to e.g. `/opt/interviewos/`.
2. **Secrets**: `cd interviewos-infrastructure/docker && cp .env.example .env && chmod 600 .env`, fill every value
   (`openssl rand -base64 32`), the Firebase service account, and the exact frontend origin.
3. **Start**: `docker compose --env-file .env up -d --build`. The `migrate` service runs
   `prisma migrate deploy` before the API and worker start. PostgreSQL and Redis publish no ports; the API
   listens on `127.0.0.1:4000` only.
4. **Reference data**: `docker compose run --rm api npx tsx prisma/seed.ts` is not available in the slim image;
   instead run `npm run db:seed` once from a checkout pointed at the server DB through an SSH tunnel.
   In production the seed creates roles, job roles and question sets only — never dev users or sample data.
5. **First admin**: sign in once through the frontend, then run `npm run admin:grant -- <uid> SUPER_ADMIN`
   (same tunnel approach).
6. **Nginx**: copy `nginx/interviewos-api.conf` to `sites-available`, `nginx/snippets/interviewos-proxy.conf`
   to `/etc/nginx/snippets/`, set the host name, certificates (certbot) and the docs allowlist IP, then
   `nginx -t && systemctl reload nginx`. Do not edit other sites or restart unrelated services.
7. **Frontend**: build with `NEXT_PUBLIC_APP_MODE=api` and `NEXT_PUBLIC_API_BASE_URL=https://<api-host>/api/v1`.
8. **Verify**: `curl https://<api-host>/api/v1/health/ready` → `database: up, redis: up`.
9. **Backups**: install the cron job from backup-restore.md and test a restore.

## Updating

Back up → `docker compose build && docker compose up -d` (migrations run first). Migrations are forward-only;
roll back by deploying the previous image only if no migration ran, otherwise restore the backup.
