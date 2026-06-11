# SIEM forwarding (Wazuh, ELK, Splunk, generic)

OrbitNode emits structured JSON events for every audit-worthy action and
every API request. These are written to a file on disk that any SIEM
agent (Wazuh, filebeat, fluentd, vector, promtail) can ingest.

This is the **Wazuh-native pattern** — the agent reads the file with its
built-in `<localfile><log_format>json</log_format></localfile>` block, no
custom decoder needed. Same file is portable to any other SIEM that
understands NDJSON.

---

## What gets shipped

Every event is one line of JSON. The `_type` discriminator tells your
SIEM rules which schema to expect:

| `_type` | Source | Volume | What's in it |
|---|---|---|---|
| `audit` | `writeAudit()` calls in admin/user mutation routes | low | actor, action, target, before/after diff (sensitive fields auto-redacted), ip, user-agent |
| `apilog` | every API request via `logApiMetric()` | **high** | user id, http method/status, endpoint, latency, cache hit, source ip + geo, ECS-style nested fields |
| `security` | abuse detector triggered | very low | alert event with source ip and endpoint, ECS-mapped (`event.kind=alert`, `event.category=intrusion_detection`) |

**Sample audit event:**

```json
{
  "_type": "audit",
  "@timestamp": "2026-06-11T15:32:11.481Z",
  "actor": { "id": "6470a2...", "email": "admin@example.com" },
  "action": "user.disable",
  "target": { "type": "user", "id": "6471f8...", "label": "alice@example.com" },
  "before": { "disabled": false },
  "after":  { "disabled": true },
  "source": { "ip": "203.0.113.42", "userAgent": "Mozilla/5.0 ..." }
}
```

**Sample apilog event:**

```json
{
  "_type": "apilog",
  "@timestamp": "2026-06-11T15:32:12.005Z",
  "user": { "id": "6471f8..." },
  "http": {
    "request":  { "method": "GET", "id": "85ed5da3-d65c-414c-93a6-061a832cebd4" },
    "response": { "status_code": 200 }
  },
  "event": { "duration_ms": 142, "outcome": "success", "dataset": "orbitnode.apilog" },
  "url": { "path": "/api/github/user" },
  "source": { "ip": "203.0.113.42", "geo": { "country_iso_code": "US", "region_name": "CA", "city_name": "Mountain View" } },
  "user_agent": { "original": "curl/8.4.0" },
  "orbitnode": { "cache_hit": false, "quota_used": 1 }
}
```

The field naming for `apilog` and `security` follows
[Elastic Common Schema (ECS)](https://www.elastic.co/guide/en/ecs/current/index.html)
so Wazuh, ELK, and most other SIEMs map fields automatically with no
custom decoder.

---

## Enable forwarding (operator setup)

### 1. Set the env var

In your production `.env` (or wherever you configure secrets):

```env
SIEM_AUDIT_PATH=/var/log/orbitnode/audit.json
```

If `SIEM_AUDIT_PATH` is **unset**, the sink is a no-op — no file is
written, no SIEM events are emitted, all behaviour is unchanged. You
can deploy without SIEM and add it later without code changes.

### 2. Create the log directory with the right ownership

OrbitNode opens the file with mode `0640` (rw owner, r group). The
suggested layout:

```bash
sudo mkdir -p /var/log/orbitnode
sudo chown <app-user>:wazuh /var/log/orbitnode
sudo chmod 750 /var/log/orbitnode
```

The Wazuh agent runs as `wazuh:wazuh` by default; putting it in the
group means it can read the file but not write to it (defence-in-depth
against the agent corrupting the audit trail).

If you run on a system without a `wazuh` group, use whatever group your
SIEM agent runs under — for filebeat it's commonly `filebeat`, for vector
it's `vector`, etc.

### 3. Boot-time validation

On `next start`, the [`instrumentation.js`](../instrumentation.js) hook
calls `getSiemSink()` which verifies the directory is writable. If the
path is wrong or the owner is wrong, **the process refuses to start**
with a clear error message:

```
[siem] SIEM_AUDIT_PATH directory not writable: /var/log/orbitnode (EACCES: permission denied). Either create it with permissions for the app user, or unset SIEM_AUDIT_PATH to disable SIEM forwarding.
```

This is intentional — silent SIEM-loss is a compliance violation, so we
fail loud at boot rather than silently months later.

---

## Wazuh agent configuration

Add this block to `/var/ossec/etc/ossec.conf` (or to a centralised group
configuration via `agent.conf`):

```xml
<ossec_config>
  <localfile>
    <log_format>json</log_format>
    <location>/var/log/orbitnode/audit.json</location>
    <label key="@source">orbitnode</label>
  </localfile>
</ossec_config>
```

The `<label>` is recommended — it tags every event so your Wazuh rules
can filter by `@source: orbitnode` and not collide with other JSON log
sources on the same host.

Restart the agent:

```bash
sudo systemctl restart wazuh-agent
# or on hosts without systemd:
sudo /var/ossec/bin/wazuh-control restart
```

Verify ingestion on the **manager** side:

```bash
sudo tail -f /var/ossec/logs/archives/archives.json | grep orbitnode
```

(`logall_json` must be enabled in the manager's `ossec.conf` for this
to show. In normal operation events flow into the alerts pipeline based
on rule matching — see the next section.)

---

## Suggested Wazuh rules

Drop these into `/var/ossec/etc/rules/local_rules.xml` on the manager:

```xml
<group name="orbitnode,">

  <!-- All OrbitNode events get a base rule for category grouping. -->
  <rule id="100200" level="3">
    <decoded_as>json</decoded_as>
    <field name="@source">orbitnode</field>
    <description>OrbitNode event</description>
  </rule>

  <!-- Admin disabled a user — interesting on its own, alert at level 7. -->
  <rule id="100210" level="7">
    <if_sid>100200</if_sid>
    <field name="_type">audit</field>
    <field name="action">user.disable</field>
    <description>OrbitNode admin disabled user: $(target.label)</description>
  </rule>

  <!-- Admin enabled a user (clears lockout). -->
  <rule id="100211" level="5">
    <if_sid>100200</if_sid>
    <field name="_type">audit</field>
    <field name="action">user.enable</field>
    <description>OrbitNode admin enabled user: $(target.label)</description>
  </rule>

  <!-- Any admin role change — high signal for privilege escalation hunts. -->
  <rule id="100212" level="10">
    <if_sid>100200</if_sid>
    <field name="_type">audit</field>
    <field name="action">user.role.change</field>
    <description>OrbitNode role change: $(actor.email) → $(target.label)</description>
  </rule>

  <!-- API key revocation. -->
  <rule id="100213" level="5">
    <if_sid>100200</if_sid>
    <field name="_type">audit</field>
    <field name="action">apiKey.revoke</field>
    <description>OrbitNode API key revoked: $(target.label)</description>
  </rule>

  <!-- Abuse detector hit — the in-app rate-limiter caught a pattern. -->
  <rule id="100220" level="10">
    <if_sid>100200</if_sid>
    <field name="_type">security</field>
    <field name="event.action">abuse_detected</field>
    <description>OrbitNode abuse detected from $(source.ip) on $(url.path)</description>
    <mitre>
      <id>T1110</id>   <!-- Brute Force -->
    </mitre>
  </rule>

  <!-- Per-request firehose: only alert on 5xx, otherwise just archive. -->
  <rule id="100230" level="6">
    <if_sid>100200</if_sid>
    <field name="_type">apilog</field>
    <field name="http.response.status_code">^5\d\d$</field>
    <description>OrbitNode 5xx on $(url.path)</description>
  </rule>

  <!-- High-frequency 401s from one source — credential stuffing pattern. -->
  <rule id="100231" level="10" frequency="20" timeframe="60">
    <if_sid>100200</if_sid>
    <field name="_type">apilog</field>
    <field name="http.response.status_code">401</field>
    <same_field>source.ip</same_field>
    <description>OrbitNode credential stuffing: 20+ 401s from $(source.ip) in 60s</description>
    <mitre>
      <id>T1110.003</id>   <!-- Brute Force: Password Spraying -->
    </mitre>
  </rule>

</group>
```

Restart the manager to load the rules:

```bash
sudo systemctl restart wazuh-manager
```

---

## Log rotation

OrbitNode **does not rotate the file itself.** Use the standard
`logrotate(8)` config:

```
# /etc/logrotate.d/orbitnode
/var/log/orbitnode/audit.json {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
```

`copytruncate` is important — it lets the OrbitNode process keep its
open file descriptor pointing at the same inode, which means no
SIGHUP / app restart is needed on rotation. The wazuh-agent's tail
position survives `copytruncate` because the inode doesn't change.

Daily rotation with 30-day retention is fine for most deployments; if
you have `apilog` enabled and significant traffic, consider hourly
rotation with longer compressed retention.

---

## Volume estimate & tuning

| Source | Events/sec at 100 req/s | Bytes/event | Daily size (uncompressed) |
|---|---|---|---|
| `audit` | ~0.01 (rare admin actions) | ~600 | <1 MB |
| `apilog` | 100 | ~750 | ~6.5 GB |
| `security` | <0.001 | ~250 | <100 KB |

If `apilog` volume is too much for your SIEM ingestion tier, you have
two options:

1. **Split the sink** — set `SIEM_AUDIT_PATH=/var/log/orbitnode/all.json`
   today; if you outgrow that, fork `metricsLogger.js` to write apilog
   to a separate file (`SIEM_APILOG_PATH`) and configure Wazuh's
   `<localfile>` to ingest only the audit file.
2. **Filter at agent** — use Wazuh's `<ignore_lines>` regex to drop
   high-cardinality, low-value endpoints (e.g. health checks, page-view
   beacon).

---

## Disabling

Unset `SIEM_AUDIT_PATH` and restart. No file is written, no events are
emitted, all in-app audit functionality (the `/admin/audit-log` UI and
the `AuditLog` Mongo collection) is unaffected — those use the Mongo
write that's the source of truth.
