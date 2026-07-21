# Order preparation workflow

**Status:** Accepted  
**Related:** [ADR-024](../architecture/adr/024-actual-composition-optimistic-concurrency.md)

## Commands

| Command | Module |
|---------|--------|
| ClaimOrder / ClaimNextOrder | orders |
| StartPreparation | orders |
| SaveActualComposition (`expectedVersion`) | orders |
| Replace composition item (structured reason) | orders |
| MarkReady | orders |
| ReleaseAssignment (reason required) | orders |
| ReassignOrder | orders |

## Conflict

On `VERSION_CONFLICT`, UI reloads work-order projection and asks the user to re-apply edits.

## Replacement reasons

`OUT_OF_STOCK` | `QUALITY` | `CUSTOMER_REQUEST` | `FLORIST_DECISION` | `OTHER` — stored on composition replacement records, not only free text.
