# API Guidelines

**Status:** Accepted  
**Related:** [dependency-rules.md](./dependency-rules.md), [document-posting.md](./document-posting.md)

## Style

- REST over HTTP
- Global prefix: `/api/v1`
- JSON request/response
- OpenAPI/Swagger generated from Nest

## Resource design

Prefer **task-based commands** for documents over naïve CRUD:

| Instead of | Prefer |
|------------|--------|
| `PATCH /batches/:id { quantityAvailable }` | Forbidden |
| `POST /supplies/:id/receipts` + `POST .../post` | Receipt capture + post |
| `DELETE /sales/:id` | `POST /sales/:id/cancel` |

Master data may use conventional REST (`POST/GET/PATCH`) with **deactivate** instead of DELETE when referenced.

## Status and errors

| Code | Use |
|------|-----|
| 200/201 | Success |
| 400 | Validation |
| 401 | Unauthenticated |
| 403 | Cross-tenant or role denial |
| 404 | Not found **in tenant** (do not leak cross-tenant existence) |
| 409 | Illegal status transition / already posted |
| 422 | Business rule violation (policy, insufficient stock) |

Error body: stable `code`, human `message`, optional `details`.

## Tenancy in API

- Tenant from auth context, not from free-form body field for existing sessions
- Store/warehouse in body must be validated against tenant
- List endpoints default to caller’s store when role is store-bound

## Pagination & filtering

- Cursor or offset pagination — pick one convention and keep it
- Always filter by `organizationId` server-side
- Dense indexes expected on `(organizationId, …)`

## Idempotency

Posting and payment endpoints SHOULD accept `Idempotency-Key` header (implement when those modules are built).

## Versioning

Breaking changes → `/api/v2`. Additive fields allowed in v1 with care.

## Read vs write

- Dashboard/report routes under `/api/v1/analytics/...` or `/dashboard/...` are **GET-only** with respect to business data (snapshot generation may POST to analytics store only).
- Analytics must not expose endpoints that post inventory or finance source documents.

## Naming

- Use business terms aligned with domain: `supplies`, `goods-receipts` (or nested under supplies), `orders`, `sales`, `payments`, `warehouses`
- User-facing “Поставка” maps to supply aggregate APIs; GoodsReceipt may be nested to avoid forcing users through two unrelated resources in UI

## Out of v1

- Public partner API
- GraphQL
- WebSocket push (notifications polling or future channel ok)
