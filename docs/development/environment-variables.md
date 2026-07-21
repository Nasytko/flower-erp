# Environment variables

Validated via Zod in `@flower/config`. Invalid env fails fast at process start.

## API (`apps/api`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | no | `development` | `development` \| `test` \| `production` |
| `PORT` | no | `3001` | HTTP port |
| `API_PREFIX` | no | `api/v1` | Global route prefix |
| `CORS_ORIGINS` | no | `http://localhost:3000` | Comma-separated allow-list |
| `BODY_LIMIT` | no | `1mb` | Express JSON body limit |
| `LOG_LEVEL` | no | `info` | Pino level |
| `DATABASE_URL` | **yes** | — | Runtime DML connection |
| `DATABASE_MIGRATE_URL` | prod recommended | — | DDL/migration connection |
| `SWAGGER_ENABLED` | no | `false` | Enable OpenAPI UI |
| `SWAGGER_PATH` | no | `docs` | Swagger path |
| `JWT_ACCESS_SECRET` | **yes** | — | Access JWT signing secret (≥32 chars) |
| `JWT_REFRESH_SECRET` | **yes** | — | Refresh token HMAC secret (≥32 chars) |
| `JWT_ACCESS_TTL_SECONDS` | no | `900` | Access token TTL |
| `JWT_REFRESH_TTL_DAYS` | no | `14` | Refresh session TTL |
| `AUTH_LOGIN_MAX_ATTEMPTS` | no | `5` | Lockout threshold |
| `AUTH_LOGIN_LOCKOUT_MINUTES` | no | `15` | Lockout duration |
| `AUTH_RATE_LIMIT_LOGIN_PER_MINUTE` | no | `10` | Login limiter |
| `AUTH_RATE_LIMIT_REFRESH_PER_MINUTE` | no | `30` | Refresh limiter |
| `AUTH_COOKIE_SAME_SITE` | no | `lax` | Refresh cookie SameSite |
| `AUTH_COOKIE_SECURE` | no | prod=true | Force Secure cookie flag |
| `ALLOW_OWNER_BOOTSTRAP` | no | `false` | Enable `pnpm bootstrap:owner` |
| `SALES_DISCOUNT_OVERRIDE_PERCENT` | no | `20` | Discount % requiring sales:discount-override |
| `WORKSPACE_READY_SOON_MINUTES` | no | `30` | Minutes before readyAt for SOON/URGENT urgency |
| `WORKSPACE_SECTION_LIMIT` | no | `20` | Max cards per Today section bucket |
| `WORKSPACE_LOW_STOCK_THRESHOLD` | no | `5` | Available qty ≤ threshold → operational low-stock warning |
| `DELIVERY_DISPATCH_BUFFER_MINUTES` | no | `30` | Minutes before windowStart for suggested requiredDispatchAt |
| `DELIVERY_READY_SOON_MINUTES` | no | `45` | Minutes before dispatch/window anchor for SOON/URGENT urgency |

No Google Maps / geocoding API keys in v1 (manual/mock geocoding; OSM navigation deep links).

## Backoffice (`apps/backoffice`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXT_PUBLIC_API_BASE_URL` | no | `http://localhost:3001/api/v1` | API base for browser client |
| `NEXT_PUBLIC_APP_NAME` | no | `Flower ERP` | Display name |

## Database users

- **Runtime user** (`DATABASE_URL`): DML only in production (SELECT/INSERT/UPDATE — no DDL).
- **Migration user** (`DATABASE_MIGRATE_URL`): DDL for `prisma migrate`. Used by CI/CD migrate jobs and local migrate scripts — not required for API process boot.

Never commit real secrets. Use `.env.example` as the template.
