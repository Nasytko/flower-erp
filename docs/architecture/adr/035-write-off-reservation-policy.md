# ADR-035: Write-off reservation policy

**Status:** Accepted  
**Date:** 2026-07-17  

## Decision

Write-off may consume **only unreserved available stock** in v1.

- If requested quantity exceeds `availableQuantity`, return `STOCK_RESERVED` or `INSUFFICIENT_STOCK`.
- Do not auto-release order reservations.
- Batch allocation uses existing FEFO/FIFO policy; user may specify batch when allowed.

## Consequences

Write-off posting adapter checks balance.available before allocation, same as sale issue free-stock path.
