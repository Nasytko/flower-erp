# Florist workflow

**Status:** Accepted  
**Related:** [ADR-025](../architecture/adr/025-workspace-read-models.md), [order-preparation-workflow.md](./order-preparation-workflow.md)

## Goal

Florist works from **Today** and **Work Order** without the administrative order screen.

## Primary path

1. Open `/organizations/:orgId/stores/:storeId/today`
2. See counters and prioritized queues (limited sections)
3. **Claim next** (`POST .../orders/claim-next`) — atomic server selection
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
