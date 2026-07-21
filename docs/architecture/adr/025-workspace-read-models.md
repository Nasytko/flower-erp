# ADR-025: Specialized workspace read models

**Status:** Accepted  
**Date:** 2026-07-16  

## Context

Florist Today / Work Order / Director Operations need aggregated projections. Assembling dozens of API calls in the browser causes N+1, races, and duplicated priority logic.

## Decision

- Implement **query/read-model capability** inside the existing `analytics` module scaffold (not a new Operations bounded context).
- Dedicated **infrastructure read repository** with tenant/store-scoped, read-only Prisma/SQL.
- Must **not** import write repositories of Orders/Inventory/Payments as a God Repository, and must **not** mutate business data.
- Domain rules (claim, mark ready, pay) remain in owning modules; workspace only projects and links to commands.
- Today responses are **section-limited** and paginated; full queues use filter endpoints.

## Consequences

Backoffice calls `GET .../workspace/today`, `.../workspace/orders`, `.../workspace/orders/:id`, `.../operations`, `.../stock/operational`. Countdown uses `serverNow` from the API.
