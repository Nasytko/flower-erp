# ADR-020: Payment vs Terminal vs Fiscal Receipt

**Status:** Accepted  
**Date:** 2026-07-16  
**Relates to:** ADR-005, ADR-019  

## Context

Money can arrive as cash, card, or future terminal/fiscal flows. These must not be conflated.

## Decision

| Concept | Owner | Role |
|---------|-------|------|
| **Payment** | `payments` | Internal management fact of money in/out |
| **Terminal transaction** | future adapter via `PaymentTerminalPort` | PSP/bank interaction |
| **Fiscal receipt** | future adapter via `FiscalizationPort` | Legal fiscalization |

In Epic 09: only Payment + CashOperation ledger. Ports for terminal/fiscal are interfaces only — no adapters, no calls.

## Consequences

Sale/Order remain separate; Payment is the money truth; terminal/fiscal can attach later without rewriting Payment core.
