# Threat model — Flower ERP

| Threat | Mitigation |
|--------|------------|
| Brute force / credential stuffing | Rate limit by IP+login; failedLoginAttempts; temporary lock; generic auth error |
| Token theft (XSS) | Access token in memory only; refresh HttpOnly; no localStorage |
| Refresh reuse | Rotate hash; revoke family on reuse; audit `TOKEN_REUSE_DETECTED` |
| CSRF on refresh | SameSite cookie; Origin allowlist vs CORS_ORIGINS; credentials CORS |
| IDOR / cross-org | Membership + org path match; scoped repository queries |
| Privilege escalation | Permission codes from registry; roles are permission sets only |
| Integration secret leak | Yandex API key redacted on GET integration-settings; map key only via `delivery:read` board/map |
| Store scope bypass on lists | `listStores` filtered by JWT storeScope for SELECTED_STORES users |
| Last director removal | `LAST_DIRECTOR` guard on role replace |
| Leaked DB credentials | Separate migrate vs app URLs; hashes only (Argon2id / HMAC) |
| Audit tampering | Append-only AuditLog; no update/delete API |
| Compromised employee | Block/archive + logout-all; session revoke on block/reset; password change revokes other sessions |
| Horizontal scale bypass of rate limit | **Known gap:** in-memory rate limiter — use Redis/shared store before multi-replica prod |
| Wrong client IP behind proxy | Set `TRUST_PROXY=true` behind reverse proxy |

Out of v1: MFA, SSO, device fingerprinting, edge WAF, Redis rate limit (planned for scale-out).
