# ADR-003: Document Posting and Ledgers

**Status:** Accepted  
**Date:** 2026-07-15

## Context

CRUD on balances and “edit quantity” APIs destroy auditability and make multi-store inventory unreliable. Flower retail needs lots, expiry, and clear reverse trails.

## Decision

1. Stock and management-finance effects occur only via **postable documents** and **immutable movements**.
2. **Batch is not a document**; it is created by Goods Receipt posting.
3. Direct balance mutation is forbidden.
4. No hard deletes for protected operational/financial/stock records — cancel + reverse.
5. **Transactional Outbox** is the chosen pattern for **future** integrations; **not implemented** in v1 (no worker/tables required now).

## Consequences

- **Positive:** Auditable ERP semantics; safer multi-store growth
- **Positive:** UI can still show one “Поставка” while posting GoodsReceipt underneath
- **Negative:** More application complexity than naïve CRUD
- **Negative:** Developers must learn status machines and reverse flows

See [../document-posting.md](../document-posting.md).
