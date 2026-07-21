# Domain Flow: Store Transfer

**Status:** Accepted  
**Module:** `transfers` (document) + `inventory` (ledger)  
**ADR:** 034

## Workflow

DRAFT → DISPATCHED → PARTIALLY_RECEIVED → RECEIVED | CANCELLED | REVERSED

Dispatch: `InventoryTransferPort.dispatch` → TRANSFER_OUT at source.  
Receive: TRANSFER_IN at destination with cost preserved from allocation.

## Ownership

`transfers` owns TransferDocument/Item/Allocation/Timeline.  
Inventory owns batches, movements, balances.
