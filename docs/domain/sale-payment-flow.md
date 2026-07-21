# Domain Flow: Sale Payment

**Status:** Accepted  
**Modules:** `sales`, `payments`  
**ADRs:** 005, 016–018, 019–023

## Responsibility

Record money against a **completed Sale** (and order prepayments that later transfer to that sale) without coupling fiscalization or terminal PSP adapters.

## Boundaries

- Sale posting issues inventory; Payment completion does **not**.
- Payment is not Expense / TaxPayment.
- No overpayment in v1.
- No hard delete of Payment / Refund / CashOperation.

## Commands (payments module)

| Command | Effect |
|---------|--------|
| `CreateSalePayment` | DRAFT payment allocated to SALE |
| `CompletePayment` | COMPLETED + CashOperation `PAYMENT_RECEIPT` IN + timelines + audit |
| `AnnulPayment` | ANNULLED + cash reversal OUT; blocked if completed refunds exist |
| `AllocateOrderPrepaymentsToSale` | Supersede ORDER allocations → SALE allocations + transfer history |
| `CreateRefund` / `CompleteRefund` / `AnnulRefund` | Cash-only refund document lifecycle |

## Summaries

`getSalePaymentSummary` recomputes from active COMPLETED allocations minus completed refunds and projects `UNPAID | PARTIALLY_PAID | PAID | PARTIALLY_REFUNDED | REFUNDED`.

## Deferred

Terminal / acquiring adapters, fiscalization, shift cash drawer, tips, gift cards.
