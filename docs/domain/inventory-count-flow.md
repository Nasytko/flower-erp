# Domain Flow: Inventory Count

**Status:** Accepted  
**Module:** `inventory`  
**ADR:** 032, 033

## Workflow

DRAFT → IN_PROGRESS → COUNTED → POSTED | CANCELLED

## Snapshot

Start captures cutoff + system quantities. Post reconciles movements after cutoff, computes differences, posts adjustments.

## Modes

Blind count (system qty hidden until confirm) and assisted count supported in UI; domain stores counted values only.
