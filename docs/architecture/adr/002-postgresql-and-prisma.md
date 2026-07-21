# ADR-002: PostgreSQL and Prisma

**Status:** Accepted  
**Date:** 2026-07-15

## Context

The system needs relational integrity (documents, movements, tenancy keys), strong consistency for posting, and productive TypeScript access.

## Decision

- **PostgreSQL** as the system of record (managed DBaaS in deployed environments)
- **Prisma** as the schema/migration/client toolchain
- One logical database for the modular monolith in v1

Redis and other data stores are not introduced in v1.

## Consequences

- **Positive:** ACID transactions for document posting + audit in one commit
- **Positive:** Fit for multi-tenant indexes and constraints
- **Negative:** Prisma encourages a single schema file — ownership must be enforced in application layers (ADR-010)
- **Negative:** Extremely hot OLAP may later need replicas/warehouses — analytics stays query-side for now

## Alternatives considered

- MongoDB document DB — weak fit for ledger immutability and relations
- Multiple databases per module — premature
