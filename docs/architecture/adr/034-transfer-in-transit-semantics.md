# ADR-034: Transfer-in-transit semantics

**Status:** Accepted  
**Date:** 2026-07-17  

## Decision

Store transfers are two-step documents owned by `transfers` module:

1. **DISPATCHED:** source `TRANSFER_OUT`; source onHand decreases; stock is in transit (not available at source or destination).
2. **RECEIVED / PARTIALLY_RECEIVED:** destination `TRANSFER_IN`; new batches at preserved source unit cost; damaged qty recorded but not added to destination stock.

No instant source− / destination+ in one command. No Supplier/GoodsReceipt for internal moves.

## Consequences

In-transit quantity is a read model from transfer allocations minus received/damaged. Inventory owns ledger mutations via `InventoryTransferPort`.
