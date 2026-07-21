# Director operations workflow

**Status:** Accepted  
**Related:** [ADR-025](../architecture/adr/025-workspace-read-models.md), [ADR-026](../architecture/adr/026-attention-vs-persisted-notifications.md)

## Goal

Director sees **where deviation exists** and what decision is needed — not a finance dashboard.

## Route

`/organizations/:orgId/stores/:storeId/operations`

## Content

- Operational KPIs (orders today, in progress, ready, overdue, sales today, unpaid balance, shortages, supplies to receive)
- **Requires decision** — calculated attention items with severity, reason, entity, age, recommended action, deep link
- Inventory operations views: write-off losses, transfer in-transit, count progress, overdue/large-difference attention

## Not included

P&L, cost analytics expansion, AI recommendations, persisted notification inbox (deferred).
