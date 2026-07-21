# ADR-006: Inventory Policy Model

**Status:** Accepted  
**Date:** 2026-07-15

## Context

Flowers are perishable and often batch/expiry driven; materials are more durable and may allow different qty precision and write-off rules. Splitting into two inventory systems duplicates ledgers and transfers.

## Decision

- **One Inventory module** and **one movement ledger**
- Differentiation via **`ItemType`** and **`InventoryPolicy`**, including:
  - FEFO / FIFO allocation
  - shelf life / expiry
  - lot/batch tracking
  - fractional quantities allowed or not
  - reservation rules
  - write-off rules

## Consequences

- **Positive:** Single source of on-hand truth; transfers and BOM consumption stay coherent
- **Positive:** New item classes = new policy presets, not new modules
- **Negative:** Policy engine must be tested carefully
- **Negative:** Temptation to put one-off `if (flower)` — forbidden; use policy fields

## Alternatives considered

- Separate FlowerInventory / MaterialInventory modules — rejected
