# ADR-001: Modular Monolith

**Status:** Accepted  
**Date:** 2026-07-15

## Context

Flower ERP must support multi-store growth over 5–10 years while a small team ships inbound stock, orders, POS, and management finance. Microservices would add operational cost without proven scale bottlenecks.

## Decision

Implement Flower ERP as a **modular monolith**:

- `apps/api` — NestJS modules as bounded contexts
- `apps/backoffice` — Next.js staff UI
- PostgreSQL DBaaS + Prisma
- pnpm + Turborepo
- Docker for local/dev needs aligned with Postgres

Modules communicate via application ports/events in-process. Physical DB remains one PostgreSQL database in v1.

## Consequences

- **Positive:** Simple deploy, transactional posting across modules in one DB transaction, faster delivery
- **Positive:** Can extract services later along module boundaries if needed
- **Negative:** Requires discipline (ownership, dependency rules) or the monolith becomes a ball of mud
- **Negative:** Single deployable API for all features (acceptable for v1)

## Alternatives considered

- Microservices per domain — rejected for v1 complexity
- Serverless multiple functions — rejected for transactional document posting complexity
