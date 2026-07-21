# ADR-008: Management Finance, Not Accounting

**Status:** Accepted  
**Date:** 2026-07-15

## Context

Owners need expenses, tax tracking, cash flow, P&L, and store profitability. Building SAP-style General Ledger, double-entry, and chart of accounts early delays inventory/POS value.

## Decision

`finance` is a **management** module:

- expenses + expense categories
- tax rules, tax accruals, tax payments
- management P&L
- cash flow
- store profitability

**Out of scope for now:** General Ledger, double-entry bookkeeping, statutory chart of accounts.

Tax belongs with Finance (rules + accruals + payments), not as a separate enterprise TAX product.

## Consequences

- **Positive:** Fast path to owner-relevant numbers
- **Positive:** Can map to proper GL later from posted facts
- **Negative:** Not a substitute for external accountant software
- **Negative:** Must not pretend accrual accounting is complete

P&L / Cash Flow / profitability are primarily **read models** over posted facts (+ expense/tax documents).
