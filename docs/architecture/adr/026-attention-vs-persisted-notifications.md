# ADR-026: Attention projections vs persisted notifications

**Status:** Accepted  
**Date:** 2026-07-16  

## Context

EPIC 10 needs operational alerts. Persisting every attention item as a Notification duplicates calculated state (overdue, shortage, unpaid) and creates two sources of truth.

## Decision (v1)

- **Calculated attention** (read model only) for: overdue orders; unresolved shortages; READY without Sale; unpaid / partially paid completed sales; unassigned; soon-ready not started; draft payments; low stock warnings; supplies awaiting receipt.
- **Do not** add a Prisma `Notification` model in this epic.
- Persisted, user-addressed notifications (assign/reassign, readyAt change, payment annul) are **deferred** until product proves which events require acknowledgment and inbox semantics.
- Notifications module remains a scaffold; no email/Telegram/push.

## Consequences

Operations / Today expose `attentionItems[]`. No `GET /notifications` until a later epic revises this ADR.
