# ADR-005: Order / Sale / Payment Separation

**Status:** Accepted  
**Date:** 2026-07-15

## Context

An order is an obligation and fulfillment process. Not every order becomes revenue; walk-in POS may skip long fulfillment. Payments may be partial, advance, or refunded. Delivery is logistics, not money and not stock by itself.

## Decision

Separate entities and lifecycles:

| Entity | Meaning |
|--------|---------|
| **Order** | Customer obligation + fulfillment |
| **Sale** | Financial fact of sale (POS or order completion) |
| **Payment** | Separate money operation linked to Order and/or Sale |
| **Delivery** | Separate entity linked to Order |

Client contact data in v1 is stored as an **Order snapshot**. No CRM bounded context yet; design must allow future Customer linking.

## Consequences

- **Positive:** Clear reporting (pipeline vs revenue vs cash)
- **Positive:** Matches ERP practice (SO vs invoice/sale vs payment)
- **Negative:** UI must not force cashiers through unnecessary steps (POS can create Sale+Payment together as one UX action issuing two documents)

## Alternatives considered

- Order-only with “paid” flag — rejects cash/revenue clarity
- Sale embedding payments only — weak for prepayments on orders
