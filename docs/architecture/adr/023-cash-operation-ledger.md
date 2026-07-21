# ADR-023: Cash Operation Ledger

**Status:** Accepted  
**Date:** 2026-07-16  

## Decision

- `CashAccount` per store (default CASH_REGISTER).
- `CashOperation` append-only ledger lines for PAYMENT_RECEIPT, REFUND_PAYMENT, PAYMENT_ANNULMENT_REVERSAL.
- Created only by payment/refund complete/annul use cases in the same UnitOfWork.
- Manual income/expense deferred to Finance.

## Consequences

Read-only cash history prepares future shifts without banking integration.
