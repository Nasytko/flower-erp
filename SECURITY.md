# Security Policy — Flower ERP

## Supported versions

Only the `main` branch of this monorepo is supported during early development.

## Reporting a vulnerability

Report security issues privately to repository maintainers (configure CODEOWNERS with real identities).
Do not open public issues for exploitable vulnerabilities.

Include:

- affected component (`apps/api`, `apps/backoffice`, package name)
- reproduction steps
- impact assessment

## Hardening present

- Helmet security headers on API
- CORS allow-list from env (credentials enabled; no wildcard)
- Request body size limit
- Global validation pipe (whitelist + forbid non-whitelisted)
- JWT access + rotating refresh cookie (HttpOnly); Argon2id passwords
- Permission-based authorization + store scope
- Login rate limiting and account lockout
- Structured JSON logging with secret redaction paths
- Non-root Docker images
- Separate runtime vs migration database URLs
- No secrets in images; `.env` gitignored
- Transactional Unit of Work with shared Prisma transaction client
- Append-only AuditLog (no update/delete application API)

See [docs/architecture/security.md](./docs/architecture/security.md), [docs/security/threat-model.md](./docs/security/threat-model.md).

## Dependency vulnerability scanning

### Problem

`pnpm audit` relies on the npm legacy audit API, which currently responds with **HTTP 410 Gone**.
It is therefore **removed from the required CI quality job**.

### Temporary strategy

1. **Blocking:** GitHub Actions job `vulnerability-scan` runs Trivy filesystem scan (`HIGH`/`CRITICAL`, ignore unfixed).
2. **Scheduled:** `.github/workflows/dependency-security.yml` re-runs Trivy weekly.
3. **Manual:** `docs/development/dependency-updates.md` — weekly `pnpm outdated` review.

## Explicit non-goals (current phase)

- SSO / OAuth / social login / MFA
- Redis / queues / object storage
- Partner public API
- Telegram / AI / storefront
- Orders / Sales / Delivery / Finance modules

## Dependency update policy

See [docs/development/dependency-updates.md](./docs/development/dependency-updates.md).
