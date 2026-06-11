# SIEM deployment checklist — OrbitNode → Wazuh

End-to-end runbook for enabling Wazuh forwarding on a live OrbitNode
deployment. Each step includes the exact command and a verification
check before moving on.

> **Audience:** the operator deploying OrbitNode. Assumes you have:
> - root / sudo on the OrbitNode host
> - a running Wazuh manager (4.x) reachable from the agent host
> - a Wazuh agent already enrolled and connected to the manager
> - the V10-2.1 + SIEM commit deployed to the OrbitNode host
>
> **Time:** ~20 minutes if Wazuh is already up. ~2 hours if you're
> standing it up from scratch.
>
> If you're new to the SIEM design, read [SIEM.md](./SIEM.md) first.
> This file is the *how*; that one is the *why*.

---

## Pre-flight checklist (do these once, before any host changes)

- [ ] **Backup `/var/ossec/etc/ossec.conf`** on both the agent host and the manager host. Wazuh upgrades sometimes clobber custom blocks.
- [ ] **Note the user OrbitNode runs as.** This is the user PM2 (or systemd, or `next start`) spawns. Common: `orbitnode`, `node`, `www-data`, `ubuntu`. You need this for file ownership.
  ```bash
  ps -eo user,cmd | grep -E "next-server|node.*next" | grep -v grep
  ```
- [ ] **Verify Wazuh agent is connected.** On the manager:
  ```bash
  sudo /var/ossec/bin/agent_control -l | grep <agent-name>
  # Expect: "Active"
  ```
- [ ] **Note the Wazuh agent's runtime user/group.** Usually `wazuh:wazuh`. Check:
  ```bash
  ps -eo user,group,cmd | grep wazuh-logcollector | grep -v grep
  ```
  If the group differs (some distros use `ossec:ossec`), substitute it everywhere `wazuh` appears below.

---

## Step 1 — Create the log directory on the OrbitNode host

```bash
sudo mkdir -p /var/log/orbitnode
sudo chown <app-user>:wazuh /var/log/orbitnode
sudo chmod 750 /var/log/orbitnode
```

**Why these permissions:**
- `750` on the directory → only the app user can `cd` / list / write; the `wazuh` group can read files inside.
- The app opens the file at `0640` (rw owner, r group), set in code.
- World has no access. If the agent runs as a different group, replace `wazuh` with that group.

**Verify:**
```bash
ls -ld /var/log/orbitnode
# Expect: drwxr-x---  2 <app-user> wazuh 4096 ... /var/log/orbitnode

# As the app user, prove you can write:
sudo -u <app-user> touch /var/log/orbitnode/.write-test && \
  sudo rm /var/log/orbitnode/.write-test && echo "✓ writable"

# As the wazuh user, prove you can list but not write:
sudo -u wazuh ls /var/log/orbitnode && echo "✓ readable"
sudo -u wazuh touch /var/log/orbitnode/.bad 2>&1 | \
  grep -q "Permission denied" && echo "✓ correctly read-only for wazuh"
```

If any verify line fails, **STOP** and fix permissions before continuing. A wrong ownership here will cause boot-time refusal in step 3.

---

## Step 2 — Add `SIEM_AUDIT_PATH` to the OrbitNode `.env`

```bash
sudo -u <app-user> sh -c 'echo "" >> /home/<app-user>/rest-api/.env'
sudo -u <app-user> sh -c \
  'echo "SIEM_AUDIT_PATH=/var/log/orbitnode/audit.json" >> /home/<app-user>/rest-api/.env'
```

Adjust the path to wherever your `.env` actually lives. If you use a process manager that sets env separately (PM2 `env_production`, systemd `Environment=`, Docker `--env-file`), put it there instead.

**Verify:**
```bash
sudo -u <app-user> grep SIEM_AUDIT_PATH /home/<app-user>/rest-api/.env
# Expect: SIEM_AUDIT_PATH=/var/log/orbitnode/audit.json
```

> ⚠️ Do NOT put `SIEM_AUDIT_PATH` inside quotes. Plain shell-safe path only.
> If your path contains spaces (it shouldn't), fix the path instead of quoting.

---

## Step 3 — Restart OrbitNode and verify boot-time SIEM init

```bash
# PM2:
sudo -u <app-user> pm2 restart orbitnode --update-env

# OR systemd:
sudo systemctl restart orbitnode

# OR docker-compose:
sudo docker compose restart api worker
```

**Verify boot succeeded with SIEM enabled** — check the app's stdout:

```bash
# PM2:
sudo -u <app-user> pm2 logs orbitnode --lines 30 --nostream | grep -E "siem|Ready"

# systemd:
sudo journalctl -u orbitnode --since "1 minute ago" | grep -E "siem|Ready"
```

You should see **exactly this line** in the boot output:

```
[siem] forwarding enabled → /var/log/orbitnode/audit.json
```

Followed by the normal Next.js `✓ Ready in NNNms`.

### Failure modes & what they mean

| Symptom | Cause | Fix |
|---|---|---|
| No `[siem]` line at all | `SIEM_AUDIT_PATH` not in process env | Re-check step 2; PM2 needs `--update-env` |
| `Refusing to start: insecure environment` | Unrelated — your `NEXTAUTH_SECRET`/`JWT_SECRET`/`ADMIN_KEY` is weak/missing | Fix the secret, retry |
| `[siem] SIEM_AUDIT_PATH directory not writable: /var/log/orbitnode (EACCES: permission denied)` | App user can't write to the dir | Re-run step 1, check `ls -ld` output |
| `[siem] SIEM_AUDIT_PATH directory not writable: ... (ENOENT)` | Parent of `/var/log` doesn't exist (extremely rare) | `mkdir -p` the path |

**If the app keeps restart-crashing, immediately unset `SIEM_AUDIT_PATH`** and bring the service back up — SIEM is opt-in for a reason. Then diagnose offline.

---

## Step 4 — Generate a test audit event and confirm the file populates

Easiest: hit an admin route that fires `writeAudit()`. The cheapest is disabling and re-enabling a test user:

```bash
# Get an admin session cookie (replace with your real admin creds)
COOKIES=/tmp/orbitnode-cookies.txt
CSRF=$(curl -sk -c "$COOKIES" https://<host>/api/auth/csrf | jq -r .csrfToken)
curl -sk -X POST -b "$COOKIES" -c "$COOKIES" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "email=admin@example.com" \
  --data-urlencode "password=<admin-password>" \
  --data-urlencode "csrfToken=$CSRF" \
  --data-urlencode "redirect=false" \
  "https://<host>/api/auth/callback/credentials?json=true"

# Find a non-admin test user's ID, then disable + re-enable
USER_ID=<some-test-user-id>
curl -sk -X POST -b "$COOKIES" "https://<host>/api/admin/users/$USER_ID/disable"
curl -sk -X POST -b "$COOKIES" "https://<host>/api/admin/users/$USER_ID/enable"
```

**Verify the file got two NDJSON lines:**

```bash
sudo wc -l /var/log/orbitnode/audit.json
# Expect: 2 /var/log/orbitnode/audit.json (or more if other actions happened)

sudo tail -2 /var/log/orbitnode/audit.json | jq .
# Expect: two JSON objects with _type:"audit", action:"user.disable" and "user.enable"
```

Each event should look like this (formatted):

```json
{
  "_type": "audit",
  "@timestamp": "2026-06-11T15:32:11.481Z",
  "actor":  { "id": "...", "email": "admin@example.com" },
  "action": "user.disable",
  "target": { "type": "user", "id": "...", "label": "test@example.com" },
  "before": { "disabled": false },
  "after":  { "disabled": true },
  "source": { "ip": "203.0.113.42", "userAgent": "curl/8.4.0" }
}
```

If the file is empty:
- Did the admin call actually return 2xx? Check the app logs.
- Is the file mode `0640` and owned by the app user? Re-verify step 1.

---

## Step 5 — Configure the Wazuh agent to read the file

Edit `/var/ossec/etc/ossec.conf` on the **agent** host (or use centralised `agent.conf` if you manage agents in groups):

```bash
sudo cp /var/ossec/etc/ossec.conf /var/ossec/etc/ossec.conf.backup.$(date +%F)
sudo nano /var/ossec/etc/ossec.conf
```

Inside the outermost `<ossec_config>` block, add:

```xml
<localfile>
  <log_format>json</log_format>
  <location>/var/log/orbitnode/audit.json</location>
  <label key="@source">orbitnode</label>
</localfile>
```

The `<label>` is **required** — it tags every event so manager-side rules can filter by `@source: orbitnode` and not collide with other JSON log sources on the same host.

**Restart the agent:**

```bash
# systemd:
sudo systemctl restart wazuh-agent

# OR (osboxes-style, no systemd):
sudo /var/ossec/bin/wazuh-control restart
```

**Verify the agent is tailing the file:**

```bash
sudo tail -n 50 /var/ossec/logs/ossec.log | grep -i orbitnode
# Expect a line like:
# wazuh-logcollector: INFO: (1950): Analyzing file: '/var/log/orbitnode/audit.json'.
```

If you DON'T see that, common causes:

- Wrong `<location>` path (typo, double slash)
- Agent user can't read the file (re-verify step 1's group check)
- Agent wasn't restarted (the localfile block is only re-read on start)

---

## Step 6 — Verify events reach the Wazuh manager

On the **manager** host, enable archives temporarily if you haven't already:

```bash
sudo nano /var/ossec/etc/ossec.conf
# In the <global> block, set:
#   <logall>yes</logall>
#   <logall_json>yes</logall_json>
sudo systemctl restart wazuh-manager
```

> ⚠️ `logall_json` writes EVERY event (matched or not) to disk. Useful for
> initial verification. **Turn it off after** — it can fill disk quickly
> at production volume. Set both back to `no` once your custom rules are
> firing as expected (step 7).

Generate one more test event (re-run step 4's disable/enable on a user) and tail the archive:

```bash
sudo tail -F /var/ossec/logs/archives/archives.json | grep orbitnode
```

You should see the same JSON event you generated on the OrbitNode host, now wrapped in the Wazuh envelope:

```json
{
  "timestamp": "2026-06-11T15:32:11.500+0000",
  "agent": { "id": "001", "name": "orbitnode-prod", "ip": "10.0.0.5" },
  "manager": { "name": "wazuh-mgr" },
  "data": {
    "_type": "audit",
    "@timestamp": "2026-06-11T15:32:11.481Z",
    "actor": { ... },
    "action": "user.disable",
    ...
  },
  "@source": "orbitnode"
}
```

If you see the event ⇒ ingestion pipeline works end-to-end. ✓

If you DON'T see it after 30 seconds:
- Is the agent still showing as Active in `agent_control -l`?
- Did the agent's `ossec.log` show the analyze-file message in step 5?
- Is anything in `/var/ossec/logs/ossec.log` on the manager about a JSON parse error? (Malformed events get dropped.)

---

## Step 7 — Install OrbitNode-specific rules on the manager

```bash
sudo cp /var/ossec/etc/rules/local_rules.xml /var/ossec/etc/rules/local_rules.xml.backup.$(date +%F)
sudo nano /var/ossec/etc/rules/local_rules.xml
```

Append the `<group name="orbitnode,">` block from
[`docs/SIEM.md`](./SIEM.md#suggested-wazuh-rules). That gives you 8 rules
covering:

| Rule ID | Severity | Triggers on |
|---|---|---|
| 100200 | 3 | All OrbitNode events (parent rule) |
| 100210 | 7 | Admin disabled a user |
| 100211 | 5 | Admin enabled a user |
| 100212 | 10 | Role change (privilege escalation hunt) |
| 100213 | 5 | API key revoked |
| 100220 | 10 | Abuse detector hit |
| 100230 | 6 | OrbitNode 5xx response |
| 100231 | 10 | 20+ 401s from one IP in 60s (credential stuffing) |

**Reload the manager:**

```bash
sudo systemctl restart wazuh-manager
```

**Test rule 100210 (admin disabled a user)** by re-running step 4's disable
call. Then:

```bash
sudo tail -n 100 /var/ossec/logs/alerts/alerts.json | jq 'select(.rule.id == "100210")'
```

You should see exactly one alert with `rule.id == "100210"`, `rule.level == 7`,
and the full audit event nested in `data`.

**If no alert fires** but the event is in `archives.json`:
- Run `sudo /var/ossec/bin/wazuh-logtest` and paste a sample event line — it'll tell you which rule (if any) matched and why others didn't.
- Common gotcha: the JSON decoder needs the event's keys to be at the top level. The `<label>` you added in step 5 nests under `data.@source` from the agent's perspective. Rules should match on `@source` not `data.@source` — Wazuh decoders strip the wrapper before rule evaluation.

---

## Step 8 — Disable manager archive logging (production cleanup)

Now that you've confirmed end-to-end ingestion and rule matching, turn off the firehose archives — they're not needed in steady state and consume disk fast at production volume:

```bash
sudo nano /var/ossec/etc/ossec.conf
# In <global>:
#   <logall>no</logall>
#   <logall_json>no</logall_json>
sudo systemctl restart wazuh-manager
```

Production events still appear in `/var/ossec/logs/alerts/alerts.json`
whenever a rule matches — that's the file your dashboards and alerting
should consume.

---

## Step 9 — Install `logrotate` on the OrbitNode host

```bash
sudo tee /etc/logrotate.d/orbitnode > /dev/null <<'EOF'
/var/log/orbitnode/audit.json {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
EOF
```

**Test the rotation config without actually rotating:**

```bash
sudo logrotate -d /etc/logrotate.d/orbitnode 2>&1 | tail -20
# Expect: "log /var/log/orbitnode/audit.json forced from command line"
# and NO errors
```

**Force a rotation to verify the live config works:**

```bash
sudo logrotate -f /etc/logrotate.d/orbitnode
ls -la /var/log/orbitnode/
# Expect:
#   audit.json     (new empty file, owned by <app-user>:wazuh, mode 0640)
#   audit.json.1   (the rotated old data)
```

Confirm the app didn't notice or care:

```bash
# Generate another audit event (step 4 again)
# Then:
sudo tail -1 /var/log/orbitnode/audit.json | jq .
# Expect: your new event appears in the post-rotation file
```

`copytruncate` is what lets this work without restarting the app — the
process's open file descriptor stays valid because the inode doesn't
change; only the file's contents are truncated after copying.

---

## Step 10 — (Optional) Enable apilog forwarding tuning

By default, every API request gets a `_type: 'apilog'` event. At
significant traffic this is high volume — ~100 events/sec × ~750 bytes
≈ **6.5 GB/day uncompressed**. If your Wazuh ingestion tier can't take
that, you have two options.

### Option A — Filter at the agent (recommended for first-pass tuning)

Drop high-cardinality, low-value endpoints with `<ignore_lines>`:

```xml
<localfile>
  <log_format>json</log_format>
  <location>/var/log/orbitnode/audit.json</location>
  <label key="@source">orbitnode</label>
  <ignore_binaries>yes</ignore_binaries>
  <!-- Drop noisy public endpoints. Quote-escape carefully. -->
  <ignore>"url":{"path":"/api/health"}</ignore>
  <ignore>"url":{"path":"/api/views/index"}</ignore>
</localfile>
```

Restart the agent. Apilog events for those endpoints are now dropped before they're sent to the manager.

### Option B — Split sinks (requires a small code change)

If you want `apilog` in a separate file from `audit` (so you can ship
audit to Wazuh and apilog somewhere cheaper), open
`lib/metricsLogger.js` and change `getSiemSink()` to read a separate
`SIEM_APILOG_PATH` env var. Roughly:

```js
// At top of file, alongside the existing getSiemSink import:
import { getSecondarySink } from '@/lib/audit/siemSink.js'  // would need adding
// ...later, replace the apilog sink.emit(...) block with:
const apilogSink = getSecondarySink()   // reads SIEM_APILOG_PATH
if (apilogSink) apilogSink.emit({...})
```

This isn't shipped today — file an issue if you need it and we'll
land it.

---

## Verification checklist (paste-ready for a deployment ticket)

Copy this into your change-management ticket and tick boxes as you go:

- [ ] `/var/log/orbitnode` exists, owned `<app-user>:wazuh`, mode `750`
- [ ] `SIEM_AUDIT_PATH` set in OrbitNode's process env
- [ ] App restart succeeded with `[siem] forwarding enabled →` in boot log
- [ ] Test admin action (disable/enable user) writes to `/var/log/orbitnode/audit.json` within 1 second
- [ ] Each line in `audit.json` parses as valid JSON (`jq .`)
- [ ] Wazuh agent `ossec.log` shows `Analyzing file: '/var/log/orbitnode/audit.json'`
- [ ] Test event arrives in manager's `archives.json` within 5 seconds (only while `logall_json` is on)
- [ ] Custom rule (e.g. 100210 for user.disable) fires in `alerts.json`
- [ ] `logall_json` turned back OFF on manager (production)
- [ ] `logrotate -d` shows clean config; `logrotate -f` rotation tested
- [ ] App keeps writing to the post-rotation file (FD survived copytruncate)
- [ ] Documented the agent ID and rule IDs in your IR runbook

---

## Rollback procedure

If anything goes wrong and you need to disable SIEM forwarding immediately
without losing the app:

```bash
# 1. Remove the env var
sudo -u <app-user> sed -i '/^SIEM_AUDIT_PATH=/d' /home/<app-user>/rest-api/.env

# 2. Restart the app
sudo -u <app-user> pm2 restart orbitnode --update-env

# 3. Confirm SIEM is disabled
sudo -u <app-user> pm2 logs orbitnode --lines 10 --nostream | grep siem
# Expect: NO "[siem] forwarding enabled" line. Mongo audit log is unaffected.
```

The in-app `/admin/audit-log` UI and the `AuditLog` Mongo collection are
**not** affected by this rollback — they're the source of truth. SIEM
forwarding is best-effort observability layered on top. If you ever need
to disable agent-side without touching the app, just delete the
`<localfile>` block in `ossec.conf` and restart the agent.

---

## When to revisit

Re-run this checklist (or at least the verification section) after any of:

- Wazuh manager or agent major-version upgrade (4.x → 5.x is expected to change `ossec.conf` schema)
- OrbitNode upgrade that changes the `instrumentation.js` boot sequence
- Moving OrbitNode to a different host (file ownership, agent enrolment)
- Adding a second OrbitNode instance behind a load balancer (each host's agent needs the same `<localfile>` block; alerts will identify which agent saw the event via `agent.name`)
- Adding new fields to audit events (you may want new manager rules to match)
