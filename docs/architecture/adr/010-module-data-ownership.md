# ADR-010: Module Data Ownership

**Status:** Accepted  
**Date:** 2026-07-15

## Context

A single Prisma client makes it easy for any service to query any table. That destroys bounded contexts and blocks future extraction or safe refactors.

## Decision

1. No God Repository over all models for business logic.
2. Each module accesses **only its own persistence adapters** and owned tables.
3. Cross-module data access goes through **published ports** (commands/queries/posting APIs).
4. Foreign keys may exist in PostgreSQL; Prisma `include` across ownership boundaries for business workflows is forbidden.
5. `analytics` and dashboards are read-only toward operational data.

## Consequences

- **Positive:** Enforceable modularity inside a monolith
- **Positive:** Clear review checklist
- **Negative:** More port interfaces than “just use Prisma”
- **Negative:** Duplication of small read DTOs across edges — acceptable

See [../data-ownership.md](../data-ownership.md).
