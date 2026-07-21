# Session management

## Tokens

| Token | Lifetime | Storage |
|-------|----------|---------|
| Access JWT | `JWT_ACCESS_TTL_SECONDS` (default 900) | Memory in backoffice (never localStorage) |
| Refresh | `JWT_REFRESH_TTL_DAYS` (default 14) | HttpOnly cookie `flower_refresh_token`, path `/api/v1/auth/refresh` |

Refresh token is stored in DB only as HMAC-SHA256(`JWT_REFRESH_SECRET`, rawToken).

## Rotation & reuse

1. Successful refresh replaces hash on the same Session row.
2. Presenting a previously rotated token (REVOKED status match) revokes the entire **familyId**.
3. Logout revokes current session; logout-all revokes all user sessions.
4. Password reset / block / archive revokes sessions.

## Cookie flags

- `HttpOnly=true`
- `Secure=true` in production (`AUTH_COOKIE_SECURE` or NODE_ENV=production)
- `SameSite` from `AUTH_COOKIE_SAME_SITE` (default `lax`)
- Origin check on `/auth/refresh` against `CORS_ORIGINS` (no wildcard)
