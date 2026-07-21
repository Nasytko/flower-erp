# ADR-011: Quantity Scale on UnitOfMeasure

**Status:** Accepted  
**Date:** 2026-07-15  
**Relates to:** ADR-006

## Context

ADR-006 listed “fractional quantities allowed or not” under `InventoryPolicy`. Implementation also needed a precise **decimal scale** for document quantities (0–3). Putting both a boolean on policy and a scale on UoM would duplicate rules and diverge.

## Decision

- **Source of truth for quantity precision is `UnitOfMeasure.quantityScale`** (`0`–`3`).
- `0` = integers only; `1`–`3` = allowed fractional digits.
- All document quantities (Supply, GoodsReceipt, movements, balances) MUST validate against the item’s UoM `quantityScale`.
- **`InventoryPolicy.allowFractionalQuantity` is removed** from persistence. ADR-006’s fractional concern is satisfied via UoM scale (`scale > 0` ⇒ fractional allowed for that item’s unit).
- Policies retain tracking, expiration, reservation, shelf-life. Allocation FEFO/FIFO remains deferred fields — not introduced here.

## Consequences

- Positive: one place to change precision; items inherit scale from unit.
- Positive: no conflicting boolean vs scale.
- Negative: changing a unit’s scale after documents exist must be restricted later (out of scope; archive + new unit preferred).
- ADR-006 wording for “fractional on policy” is superseded for precision ownership by this ADR; policy still owns lot/expiry/reservation behaviour.

## Alternatives considered

- Keep boolean on policy + scale on UoM — rejected (duplication).
- Scale on Item — rejected (UoM is the natural home).
