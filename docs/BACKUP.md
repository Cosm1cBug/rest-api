# Backup, restore, and disaster recovery — OrbitNode

This is the operator runbook for backing up and restoring OrbitNode data.
It assumes you already have a working production deployment per
[`docs/DEPLOY-SIEM.md`](./DEPLOY-SIEM.md) and the env vars per the README.

> **TL;DR — minimum viable backup:**
> - Daily `mongodump` of the OrbitNode database to off-host storage
> - Snapshot of `/var/log/orbitnode/audit.json` (if SIEM is enabled)
> - Document your `.env` securely (offline; never in git)
>
> RPO (data loss tolerance): 24h with daily backups; ≤1h achievable with hourly.
> RTO (recovery time): ~10 min for Mongo restore on the same hardware; ~1h for a clean-slate rebuild.

---

## What needs backing up

| Asset | Where it lives | Why | Backup frequency |
|---|---|---|---|
| **MongoDB database** | Configured `MONGODB_URI` | All user accounts, API keys, audit log, page-views, OTPs, password-reset tokens | Daily minimum, hourly if you have admin churn |
| **Redis state** (optional) | Configured `REDIS_HOST:PORT` | Rate-limit counters, OTP codes, cache, BullMQ queues | Not strictly required — Redis is recoverable (see "Redis: do I need to back it up?") |
| **SIEM forwarder file** | `SIEM_AUDIT_PATH` (e.g. `/var/log/orbitnode/audit.json`) | Long-term security audit trail; the in-app Mongo `AuditLog` is the source of truth but SIEM is often retained longer | Daily rotation via `logrotate` + ship to long-term storage |
| **`.env` / process env** | Outside the repo, on the deployment host | All secrets — losing this means new keys must be generated and all sessions/keys revoked | Whenever it changes; store offline (password manager / sealed secrets) |
| **`tmp/` directory** | Repo root or `/app/tmp` in Docker | User-uploaded files served via `/api/uploads` | Continuous if uploads matter; depends on your use case |
| **Application code** | git remote | The code itself | Already in GitHub; nothing to do |

What does NOT need backing up:
- `node_modules/` — regenerated from `package-lock.json`
- `.next/` build output — regenerated from `next build`
- BullMQ job results — in Redis, ephemeral by design

---

## MongoDB backup

### Option A — `mongodump` (recommended for self-hosted)

`mongodump` produces a logical dump (BSON files) that can be restored
to any Mongo version 4.0+. It's slower than filesystem snapshots but
portable.

**Daily backup script** (drop in `/etc/cron.daily/orbitnode-mongodump`):

```bash
#!/bin/bash
set -euo pipefail

BACKUP_DIR=/var/backups/orbitnode
RETENTION_DAYS=30
DATE=$(date +%Y-%m-%d)

# MongoDB URI — read from the same .env the app uses so they can't drift.
# If your .env contains MONGODB_URI directly, source it:
set -a
source /etc/orbitnode/.env
set +a

mkdir -p "$BACKUP_DIR"

# Dump to a date-stamped gzip archive
mongodump \
    --uri="$MONGODB_URI" \
    --archive="$BACKUP_DIR/$DATE.archive.gz" \
    --gzip

# Prune backups older than retention window
find "$BACKUP_DIR" -name "*.archive.gz" -mtime +"$RETENTION_DAYS" -delete

# Optional — ship to off-host storage (S3, B2, GCS, etc.)
# aws s3 cp "$BACKUP_DIR/$DATE.archive.gz" s3://your-backup-bucket/orbitnode/
```

```bash
sudo chmod 700 /etc/cron.daily/orbitnode-mongodump
sudo chown root:root /etc/cron.daily/orbitnode-mongodump
```

**Test the backup before relying on it.** Run it manually:

```bash
sudo /etc/cron.daily/orbitnode-mongodump
ls -lah /var/backups/orbitnode/
```

You should see today's archive at ~10-100 MB for a typical deployment.

### Option B — Mongo Atlas (managed)

If you're using Mongo Atlas, snapshots are automatic on every tier
above the free one. Configure:
- **Snapshot frequency:** every 6h or hourly
- **Retention:** 30 days minimum for compliance scenarios; 7 days otherwise
- **PIT (Point-In-Time recovery):** enable if you can afford it; lets
  you restore to any second in the last 24h

Atlas restores are one-click in the UI. No script needed.

### Option C — Filesystem snapshot (LVM, ZFS, btrfs)

Only works for self-hosted Mongo where you control the underlying
filesystem. Lower overhead than `mongodump` (no logical export) but
requires a quiesced filesystem at snapshot time:

```bash
# Lock Mongo's writes briefly
mongosh --eval 'db.fsyncLock()'
# Take the filesystem snapshot (LVM example)
sudo lvcreate -L 10G -s -n orbitnode_snap /dev/vg0/mongo_data
# Resume writes
mongosh --eval 'db.fsyncUnlock()'
# rsync the snapshot somewhere safe, then delete it
```

For most deployments **Option A is the right choice** — simpler, more
portable, recoverable to any environment.

---

## Restore from `mongodump` backup

```bash
# Stop the OrbitNode app first so it can't write during restore
sudo systemctl stop orbitnode    # or: pm2 stop orbitnode-api

# Restore
mongorestore \
    --uri="$MONGODB_URI" \
    --archive=/var/backups/orbitnode/2026-06-17.archive.gz \
    --gzip \
    --drop      # drops collections before restoring; remove if you want merge semantics

# Start the app
sudo systemctl start orbitnode   # or: pm2 start orbitnode-api
```

**`--drop` warning:** this nukes the current collections before restoring.
Use it for full restores. Don't use it if you're trying to merge a
backup into a live system (which is rarely what you want anyway — merge
semantics get weird with unique indexes).

---

## Redis: do I need to back it up?

**Usually no.** Redis in OrbitNode holds:
- Rate-limit counters — reset themselves naturally; loss is fine
- OTP codes — 5-minute TTL; loss forces re-request which is correct UX
- Cache — re-populated on demand
- BullMQ queue state — in-flight jobs

Of these, **BullMQ queue state is the only thing you'd potentially miss**.
If you run scrapers via BullMQ and a queued job that hasn't started yet
is in Redis when it crashes, the job is lost.

For most deployments this is acceptable — scraper jobs are idempotent
and the user can retry. If your use case is different, configure Redis
persistence via AOF (append-only file):

```redis
# redis.conf
appendonly yes
appendfsync everysec
```

Then back up `/var/lib/redis/appendonly.aof` daily the same way as Mongo.

---

## SIEM file backup

The SIEM forwarder writes to `/var/log/orbitnode/audit.json` (or
whatever `SIEM_AUDIT_PATH` points at). This file is **rotated daily by
`logrotate`** per the V11 setup in `docs/SIEM.md` and retained for 30
days locally.

For long-term retention (auditors typically want 1+ year), ship the
rotated files off-host. Add to your `logrotate.d/orbitnode` config:

```
/var/log/orbitnode/audit.json {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
    postrotate
        # Ship the just-rotated file to S3 / B2 / your archive
        aws s3 cp /var/log/orbitnode/audit.json.1.gz s3://your-bucket/siem/$(hostname)/$(date +\%Y-\%m-\%d).gz
    endscript
}
```

Most SIEM platforms (Wazuh, Splunk, ELK) also keep the events on their
own side — so this file backup is mostly belt-and-braces.

---

## Secret backup

**This is the one operators most often skip and then regret.**

Required secrets that, if lost, render the deployment unrecoverable:

| Variable | Recovery if lost |
|---|---|
| `NEXTAUTH_SECRET` | All existing sessions invalidated; users must sign in again |
| `JWT_SECRET` | Same as above |
| `ADMIN_KEY` | Prometheus + docs + admin health detail break until rotated |
| `GOOGLE_CLIENT_SECRET` | Google sign-in breaks; need to issue new secret from console |
| `GITHUB_CLIENT_SECRET` | Same as Google |
| `EMAIL_USER`, `EMAIL_PASS` | OTP + password-reset emails break |
| `MONGO_USER`, `MONGO_PASS` (if not in URI) | Mongo connection breaks |
| `REDIS_PASSWORD` | Redis connection breaks |

**Recommended backup:**
1. Encrypted password manager (1Password, Bitwarden, KeePass) — has the canonical copy
2. Sealed-secrets in your infrastructure-as-code repo (if you use Kubernetes)
3. NEVER commit `.env` to git — `.gitignore` already covers `.env*` per the repo

When you rotate a secret (you should rotate `NEXTAUTH_SECRET` + `JWT_SECRET`
at least annually), update the password manager FIRST, then the deployment.

---

## Disaster-recovery scenarios

### Scenario 1: Mongo database corrupted / lost

**Detection:** app fails to start; `mongosh` shows errors.

**Recovery:**
1. Stop the app
2. Drop the broken database (`mongosh --eval 'use orbitnode; db.dropDatabase()'`)
3. Restore the most recent backup per the restore section above
4. Start the app
5. Verify `/api/health` returns 200 with `mongodb: connected`
6. Spot-check that users can sign in

**RPO:** up to 24h of recent activity lost (daily backup window).
**RTO:** ~10 min for the restore itself.

### Scenario 2: Host destroyed / move to new infrastructure

**Recovery:**
1. Provision new host with Node 20, Mongo, Redis, Wazuh agent
2. Restore `.env` from your password manager
3. `git clone https://github.com/Cosm1cBug/rest-api.git`
4. `npm install`
5. Restore Mongo backup per scenario 1
6. Configure PM2 / systemd / Docker per the README
7. Start the app
8. Update DNS to point at the new host
9. Verify users can sign in (clients with cached sessions will work
   immediately because session tokens are JWTs signed with the same
   `NEXTAUTH_SECRET`)

**RPO:** depends on Mongo backup freshness.
**RTO:** ~1h for an experienced operator who has the secrets ready.

### Scenario 3: Secret leaked

A `NEXTAUTH_SECRET` or `JWT_SECRET` ending up in a public repo, a
support ticket, or a compromised laptop.

**Recovery (NEXTAUTH_SECRET / JWT_SECRET):**
1. Generate new secrets (`openssl rand -hex 32`)
2. Update `.env` and your password manager
3. Restart the app
4. **All existing sessions are now invalid** — users must sign in again
5. No data loss; just a UX disruption

**Recovery (`ADMIN_KEY`):**
1. Generate new key
2. Update env + restart
3. Update any Prometheus scrape configs / monitoring tooling that uses
   the old key
4. No user impact

**Recovery (OAuth client secret):**
1. Go to the provider console (Google Cloud Console / GitHub Developer Settings)
2. Revoke the leaked secret
3. Generate a new one
4. Update `.env` + restart
5. OAuth-only users may need to re-link once; email-OTP users unaffected

### Scenario 4: User reports their account is "compromised"

Not strictly disaster recovery, but the most common operator request.

1. Admin disables the account via `/admin/users/[id]` (V13 feature)
   This blocks all sign-ins immediately (credentials + OAuth)
2. Admin revokes all of the user's API keys via the same page
3. User must request password reset; new password takes effect
4. Re-enable the account
5. Audit log captures every step; SIEM forwards them all

---

## Verifying your backup actually works

**Quarterly:** spin up a throwaway Mongo instance and restore the
latest backup. Verify:

```bash
# After restore
mongosh "$TEST_MONGO_URI" --eval "
  db.users.countDocuments();
  db.auditlogs.countDocuments();
  db.apikeys.countDocuments({ revoked: false });
"
```

Counts should match your production database (allowing for the
backup-window delta).

**Annually:** do a full disaster-recovery drill — restore to a clean
host, point a test DNS at it, verify a test user can sign in and do
a few operations end-to-end. Document the run, measure the RTO, file
any gaps.

A backup you've never restored is not a backup; it's a hopeful guess.
