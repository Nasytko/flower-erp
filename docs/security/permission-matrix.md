# Permission Matrix (implemented modules)

**Status:** Accepted  
**Source of truth:** `packages/permissions/src/registry.ts`

| Code | DIRECTOR | FLORIST |
|------|:--------:|:-------:|
| organization:* | ✓ | read |
| stores:* | ✓ | read |
| master-data:* | ✓ | read |
| supply:* | ✓ | without reverse |
| inventory:read | ✓ | ✓ |
| inventory:view-cost | ✓ | — |
| write-offs:read | ✓ | ✓ |
| write-offs:create | ✓ | ✓ |
| write-offs:post / reverse | ✓ | — |
| inventory-adjustments:view-cost | ✓ | — |
| customers:* | ✓ | read |
| orders:* | ✓ | operational (no admin) |
| sales:read | ✓ | ✓ |
| sales:create | ✓ | ✓ |
| sales:complete | ✓ | ✓ |
| sales:annul | ✓ | — |
| sales:view-cost | ✓ | — |
| sales:view-margin | ✓ | — |
| sales:discount | ✓ | ✓ (within limit) |
| sales:discount-override | ✓ | — |
| payments:read | ✓ | ✓ |
| payments:create | ✓ | ✓ |
| payments:complete | ✓ | ✓ |
| payments:annul | ✓ | — |
| payments:refund | ✓ | — |
| payments:manage-methods | ✓ | — |
| delivery:read | ✓ | ✓ |
| delivery:create | ✓ | ✓ |
| delivery:update | ✓ | ✓ |
| delivery:assign | ✓ | — |
| delivery:dispatch | ✓ | ✓ |
| delivery:complete | ✓ | — |
| delivery:cancel | ✓ | — |
| delivery:report-problem | ✓ | ✓ |
| delivery:resolve-problem | ✓ | — |
| delivery:manage-couriers | ✓ | — |
| delivery:view-payment-summary | ✓ | — |
| audit:read | ✓ | — |
| users:* / roles:manage | ✓ | — |
| deletions:read / approve | ✓ | — |
| deletions:request | ✓ | ✓ |
| workspace:read | ✓ | ✓ |

| Code | COURIER |
|------|:------:|
| organization:read / stores:read | ✓ |
| delivery:read | ✓ |
| delivery:dispatch | ✓ |
| delivery:complete | ✓ |
| delivery:report-problem | ✓ |

Checks use permission codes only — never `role === DIRECTOR` or `role === COURIER`.

Workspace Today / Work Order / operational stock accept `workspace:read` (preferred) or `orders:read` (secondary). Delivery board/map/calendar require `delivery:read`. Inventory operation cost fields additionally require `inventory-adjustments:view-cost` or `inventory:view-cost` depending on screen context.
