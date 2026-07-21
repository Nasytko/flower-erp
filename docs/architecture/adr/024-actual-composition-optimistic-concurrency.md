# ADR-024: Optimistic concurrency for Actual Composition

**Status:** Accepted  
**Date:** 2026-07-16  

## Context

Two florists (or two tabs) can edit the same order's actual composition. Silent last-write-wins would hide conflicts and lose work.

## Decision

- Add integer `Order.version`, incremented on every successful actual-composition mutation (and other critical prep mutations that change the work-order view).
- `updateActualComposition` **requires** `expectedVersion`.
- If `expectedVersion !== Order.version`, return `VERSION_CONFLICT` with current `version` / `updatedAt`; do not apply changes.
- Frontend must reload and re-apply; no silent overwrite.

## Consequences

Work-order UI carries `version` from the read model and sends it on save. Concurrent editors see an explicit conflict.
