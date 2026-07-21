# ADR-019: Decimal Money Representation

**Status:** Accepted  
**Date:** 2026-07-16  
**Relates to:** ADR-008, ADR-016, ADR-018  

## Context

Sales introduced a temporary `Money` helper based on JavaScript `number`. Floating-point arithmetic is unsafe for financial amounts (e.g. `0.1 + 0.2`). Payments requires a correct decimal primitive.

## Decision

1. Use **`decimal.js`** via `@flower/shared-kernel` `Money` class.
2. Domain/application money math **must** use `Money` / `Decimal` — never JS `number` arithmetic for amounts.
3. API boundary: monetary fields are **decimal strings** (`"150.00"`).
4. PostgreSQL: `NUMERIC` / Prisma `Decimal`.
5. BYN scale: **2** decimal places for currency amounts; intermediate calc may use higher precision then round with `ROUND_HALF_UP`.
6. Historical snapshots remain string/NUMERIC; no rewrite of stored values.

## Consequences

- Shared primitive for Sales, Payments, future Finance.
- Dependency on `decimal.js` in shared-kernel.
- Deprecates JS-number Money in sales domain.
