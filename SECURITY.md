# Security Policy

## Reporting a Vulnerability

**Please do not file a public GitHub issue for security problems.**

Use [GitHub's private vulnerability reporting](https://github.com/Cosm1cBug/rest-api/security/advisories/new) instead. Coordinated disclosure lets us ship a fix before details become public.

When reporting, please include:

- A description of the vulnerability and its impact.
- Reproduction steps (or a proof-of-concept request).
- The affected endpoint(s) or file(s) and the commit SHA you tested against.
- Optional: a suggested fix.

We aim to acknowledge reports within **72 hours** and to ship a fix within **30 days** for high-severity issues.

## Scope

In scope:

- Anything under `app/api/**` (HTTP API endpoints).
- Authentication, session, and API-key handling (`lib/auth/**`, `lib/middleware/apiKey.js`).
- SSRF / upload / file-serving paths (`lib/security/**`, `lib/downloadFile.js`, `app/api/uploads/**`).
- Mongoose models in `models/**` and their indexes.
- The middleware edge gate (`middleware.js`).
- Admin endpoints (`app/api/admin/**`) and the audit pipeline (`lib/audit.js`).

Out of scope:

- Findings that require local code execution on the server.
- Self-hosted misconfigurations (weak `ADMIN_KEY`, missing `TRUSTED_PROXIES`, etc.) — but please report if our defaults make them too easy to get wrong.
- Findings against third-party services we depend on (MongoDB, Redis, the Next.js runtime). Report those upstream.

## Hall of Fame

Researchers who report valid vulnerabilities are credited in release notes unless they request otherwise.
