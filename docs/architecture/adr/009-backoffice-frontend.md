# ADR-009: Backoffice Frontend

**Status:** Accepted  
**Date:** 2026-07-15

## Context

The staff UI was previously named in plans as `web-admin` / admin. “Admin” undersells an ERP operations client; naming the UI `erp` confuses the whole product with one app.

## Decision

- Staff Next.js app is **`apps/backoffice`**
- Product name remains **Flower ERP**
- API remains **`apps/api`**
- Future deployables (illustrative): `apps/pos`, storefront, partner façade — separate names

## Consequences

- **Positive:** Clear landscape of clients vs core
- **Positive:** Industry-familiar “backoffice” term
- **Negative:** Rename from any `web-admin` stubs when frontend work starts

## Alternatives considered

- `apps/erp` — ambiguous
- `apps/admin` — too narrow
