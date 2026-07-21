# Domain Flow: Payments

**Status:** Accepted  
**Module:** `payments`  
**ADRs:** [019](../architecture/adr/019-decimal-money-representation.md)–[023](../architecture/adr/023-cash-operation-ledger.md)

## Responsibility

Record management money in/out (prepayment, sale payment, refund, annul).  
Payment is **not** a Sale, **not** a fiscal receipt, **not** a terminal/PSP transaction.

## Entities

| Entity | Role |
|--------|------|
| PaymentMethod | Org catalog (CASH / BANK_CARD / BANK_TRANSFER presets via use case) |
| Payment | Money fact (DRAFT → COMPLETED / ANNULLED) |
| PaymentAllocation | Links payment amount to ORDER or SALE |
| PaymentAllocationTransfer | History when Order prepayment moves to Sale |
| PaymentRefund | Cash-only refund against original Payment |
| PaymentTimelineEvent | Append-only domain timeline |
| CashAccount | Store cash register (default «Касса магазина») |
| CashOperation | Immutable ledger lines for receipts / refunds / annul reversals |

## Money

- Domain/application: `@flower/shared-kernel` `Money` (decimal.js)
- API: decimal strings `"150.00"`
- PostgreSQL: `NUMERIC` / `Decimal`

## Source of truth for balances

COMPLETED payments + active COMPLETED allocations − COMPLETED refunds.  
ANNULLED payments do not count. Summaries are recomputed projections.

## Ports

| Port | Purpose |
|------|---------|
| OrdersPaymentPort | Order total/status, timeline PAYMENT_RECEIVED |
| SalesPaymentPort | Sale net/status, find sale by order, timeline |
| AuditPort | AuditLog |
| PaymentDependencyPort | Future fiscal/terminal annul blockers (noop in v1) |
| PaymentTerminalPort | Future only — interface, no adapter |
| FiscalizationPort | Future only — interface, no adapter |

## Key workflows

```
Order (CONFIRMED+) ──create+complete──► ORDER_PREPAYMENT ──allocate──► SALE allocation
Completed Sale ──create+complete──► SALE_PAYMENT
COMPLETED Payment ──refund──► PaymentRefund + CashOperation OUT
COMPLETED Payment ──annul──► ANNULLED + CashOperation reversal (no completed refunds)
```

Complete / annul / refund complete / transfer run in **one UnitOfWork** with CashOperation, timelines, projections, AuditLog, and idempotency keys.

## Rules (v1)

- currency = BYN; amount > 0; no overpayment
- no prepayment on DRAFT or CANCELLED Order
- pay only COMPLETED Sale
- Sale and Payment are separate commands
- transfer does not duplicate money or change Payment.amount
- hard delete forbidden

## Deferred

Terminal adapters, fiscalization, POS Agent, cash shifts, Finance P&L, Delivery.
