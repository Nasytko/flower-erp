# Threat model (v1 Identity)

| Threat | Mitigation |
|--------|------------|
| Brute force / credential stuffing | Rate limit by IP+login; failedLoginAttempts; temporary lock; generic auth error |
| Token theft (XSS) | Access token in memory only; refresh HttpOnly; no localStorage |
| Refresh reuse | Rotate hash; revoke family on reuse; audit `TOKEN_REUSE_DETECTED` |
| CSRF on refresh | SameSite cookie; Origin allowlist vs CORS_ORIGINS; credentials CORS |
| IDOR / cross-org | Membership + org path match; scoped repository queries |
| Privilege escalation | Permission codes from registry; roles are permission sets only |
| Leaked DB credentials | Separate migrate vs app URLs; hashes only (Argon2id / HMAC) |
| Audit tampering | Append-only AuditLog; no update/delete API |
| Compromised employee | Block/archive + logout-all; session revoke |

Out of v1: MFA, SSO, device fingerprinting, edge WAF.
