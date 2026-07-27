# Florist workflow

**Status:** Accepted  
**Related:** [ADR-025](../architecture/adr/025-workspace-read-models.md), [order-preparation-workflow.md](./order-preparation-workflow.md)

## Goal

Florist works from **Home (`/home`)** and **Work Order** without the administrative order screen.

## Primary path

1. Open `/organizations/:orgId/stores/:storeId/home`
2. See KPI by phase and prioritized queues
3. Open order card or work order; **claim** inside the order (`POST .../orders/:id/claim`)
4. Open Work Order
5. Start preparation → edit actual composition (with `expectedVersion`)
6. Optional structured item replacement
7. Mark READY after review
8. Create Sale / add payment via existing flows
9. Optional stock actions available by permission: create write-off draft, view transfers, count inventory lines during stock count

## Rules (backend-owned)

- No PAUSED status
- ClaimNext never assigns CANCELLED, READY, COMPLETED, other store, or order with another active assignee
- Countdown from API `serverNow`
- Low stock = operational warning only (not purchase suggestion)
- Florist may create draft write-offs and enter count quantities, but posting/reversal remains director-level by default
