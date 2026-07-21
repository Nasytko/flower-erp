# Domain Flow: Write-off

**Status:** Accepted  
**Module:** `inventory`  
**ADR:** 035

## Document

`WriteOffDocument` + `WriteOffItem` → post creates `WRITE_OFF` movements; reverse creates `WRITE_OFF_REVERSAL`.

## Rules

- DRAFT → POSTED → REVERSED | ANNULLED
- quantity > 0; reason required; reserved stock rejected
- cost snapshot at posting from batch allocation
- idempotent post/reverse via `posting_idempotency_keys`
