# Domain Flow: Finance (Management)

**Status:** Deferred (target design — **no Nest `finance` module in codebase**)  
**Module:** `finance` (planned)

## Responsibility

Provide **management** finance: expenses, tax rules/accruals/payments, and read models for P&L, cash flow, and store profitability. Not a statutory General Ledger.

Operational payments remain under the `payments` module until this BC is implemented.

## Boundaries

- No chart of accounts, no double-entry journals.
- Does not own Sale/Payment tables (reads via ports/projections).
- Does not write Inventory.
- Dashboard/report UIs consume finance queries but are not this module’s write API.

## Main entities

| Entity | Role |
|--------|------|
| `Expense` | Posted management expense |
| `ExpenseCategory` | Classification |
| `TaxRule` | Rate/applicability metadata |
| `TaxAccrual` | Tax obligation fact |
| `TaxPayment` | Tax paid fact |
| Projections | Management P&L, Cash Flow, Store Profitability (query or projection tables) |

Ids: `organizationId`; store-level expenses/profit use `storeId`.

## Allowed dependencies

- `org-structure`
- Read ports from `sales`, `payments`, `supply`/cost facts as published
- `audit`, `notifications`

## Forbidden dependencies

- Implementing GL mirror “for future”
- Mutating inventory/supply
- Hard delete of expense/tax documents

## Commands

| Command | Effect |
|---------|--------|
| `CreateExpenseCategory` | Master for expenses |
| `PostExpense` / `CancelExpense` | Expense lifecycle |
| `UpsertTaxRule` | Rule maintenance |
| `PostTaxAccrual` / `CancelTaxAccrual` | Accrual docs |
| `PostTaxPayment` | Payment of tax |

Queries (not commands that mutate ops modules): `GetManagementPnL`, `GetCashFlow`, `GetStoreProfitability`.

## Events

- `ExpensePosted`, `ExpenseCancelled`
- `TaxAccrued`, `TaxPaid`

## Posting rules

- Expense post freezes amount/category/date; included in P&L/cash projections.
- Tax accrual/payment are explicit documents (not silent fields on Sale alone); Sale may request accrual via port.
- P&L / Cash Flow / profitability **computed from posted facts** — not manually edited totals.

## Cancellation rules

- Cancel expense → reversing fact / cancelled status; row kept.
- Cancel accrual similarly.
- Tax payments refunded/adjusted via new compensating documents if needed.

## Audit requirements

All posts/cancels of expense and tax documents; rule changes.

## v1

- Expenses + categories
- Tax rules + accruals + payments
- Management queries for P&L, cash flow, store profitability (even if simple SQL aggregations)

## Deferred

- Full accounting GL / double entry
- Bank feeds, acquiring reconciliation
- Multi-currency
- Statutory reporting packs
