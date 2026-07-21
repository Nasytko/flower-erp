# Domain Lifecycle: Inventory → Order → Delivery → Sale → Payment

**Status:** Accepted  
**ADRs:** 005, 015–023, 024–035

```
GoodsReceipt POSTED → RECEIPT batch/movement
  → optional WriteOff DRAFT→POSTED→REVERSED
  → optional Transfer DRAFT→DISPATCHED→PARTIALLY_RECEIVED|RECEIVED→REVERSED|CANCELLED
  → optional InventoryCount DRAFT→COUNTED→POSTED|CANCELLED
```

```
Order (CONFIRMED…READY)
  → type PICKUP | DELIVERY (fulfillment)
  → if DELIVERY: DeliveryJob DRAFT→PLANNED→…→DELIVERED|CANCELLED|PROBLEM
  → Claim / ClaimNext (atomic server assign) → StartPreparation
  → Actual composition (expectedVersion) / structured item replacement
  → Mark READY → DeliveryReadinessPort may sync READY_FOR_DISPATCH
  → Order Prepayment (Payment IN, allocation ORDER)
  → Sale DRAFT → CompleteSale → ISSUE stock
  → AllocateOrderPrepaymentsToSale (no new money)
  → Sale Payment(s) until PAID
  → Refund (optional, money OUT only)
  → Payment Annul (if no refunds)

Payment ≠ Fiscal ≠ Terminal ≠ Delivery
Delivery does not auto-complete Order/Sale/Payment
```

No PAUSED status. ClaimNext never assigns CANCELLED / READY / COMPLETED / other-store / already-assigned orders. Attention items are calculated read models (ADR-026), not persisted notifications. Delivery urgency is computed (ADR-031).
