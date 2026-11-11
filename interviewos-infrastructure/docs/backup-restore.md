# Backup & restore

## Servers (Linux)

```bash
# Daily at 02:15 UTC, keep 14 days
15 2 * * * BACKUP_DIR=/var/backups/interviewos /opt/interviewos/interviewos-infrastructure/backup/pg-backup.sh >> /var/log/interviewos-backup.log 2>&1
```

`pg-backup.sh` writes `interviewos_<UTC>.dump` (pg_dump custom format) with mode 600, verifies it with
`pg_restore --list`, writes a SHA-256 file and removes only its own files older than `RETENTION_DAYS`.
Copy the backup directory off the server (object storage / another host).

Restore **into a new database** (the script refuses to overwrite an existing one):

```bash
./pg-restore.sh /var/backups/interviewos/interviewos_20261111T021500Z.dump interviewos_restore_check
```

Check the copy (`SELECT count(*) FROM candidates;`), then during a maintenance window point `DATABASE_URL`
at it or rename databases. Test a restore at least monthly.

`PG_MODE=native` makes both scripts use `pg_dump`/`psql` on PATH instead of the compose container.

## Windows development PC

The embedded PostgreSQL does not include `pg_dump`, so:

- **Cold backup** (built in): stop the server, then `npm run backup:cold` in `database/local`. It copies the data
  directory to `%LOCALAPPDATA%\InterviewOS\backups\pgdata_<UTC>`. Restore by stopping the server, renaming the
  current `pgdata` folder and copying the backup back as `pgdata`.
- **Logical backup**: install the PostgreSQL 17 command-line tools, then run `backup/pg-backup.ps1`.

Development data is sample data; real candidate data should only ever live on the server.
