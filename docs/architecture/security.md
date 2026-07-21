# Security

**Status:** Accepted (Identity v1 implemented)  
**Related:** [tenancy.md](./tenancy.md), [api-guidelines.md](./api-guidelines.md), [../domain/identity-and-access.md](../domain/identity-and-access.md), [../security/threat-model.md](../security/threat-model.md)

## Authentication

- Access: short-lived JWT (`sub`, `sid`, `mid`, `oid`) signed with `JWT_ACCESS_SECRET`
- Refresh: opaque rotating token in HttpOnly cookie; DB stores HMAC hash only
- Passwords: Argon2id (`memoryCost=19456`, `timeCost=2`, `parallelism=1`)
- Public routes: `/health/live`, `/health/ready`, `/auth/login`, `/auth/refresh`

## Authorization

Permission codes from `@flower/permissions` (`module:action`). System presets: DIRECTOR, FLORIST.

Order of checks: authentication → active user/session → active membership → org match → permissions → store scope → entity ownership in use case.

Never: `if (role === 'DIRECTOR')`.

Inventory cost fields are omitted (not null) without `inventory:view-cost`.

## Cookie / CSRF

Refresh cookie: HttpOnly, Secure in production, SameSite=`lax` (configurable). Refresh endpoint validates Origin against `CORS_ORIGINS`. Wildcard origin forbidden. CSRF double-submit token deferred while SameSite+Origin allowlist hold.

ADR: decision documented here (no separate cookie ADR required beyond security.md update).

## Rate limiting & lockout

In-memory limiter: login (IP+login), refresh (IP+session). User-level failedLoginAttempts with temporary `lockedUntil`.
