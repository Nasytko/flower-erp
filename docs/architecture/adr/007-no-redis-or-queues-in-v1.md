# ADR-007: No Redis or Queues in v1

**Status:** Accepted  
**Date:** 2026-07-15

## Context

Redis, BullMQ, Kafka, RabbitMQ, object storage, Telegram, AI, and a public website are valuable later but inflate cost and failure modes before the core posting path exists.

## Decision

**v1 stack excludes:** Redis, message queues, Kafka, RabbitMQ, file/object storage platforms, Telegram, AI features, public storefront.

**Transactional Outbox** is recorded as the integration pattern to adopt when async integrations are required. **Do not** create outbox workers, Redis, or empty outbox infrastructure in v1.

In-process domain events/handlers inside the Nest monolith are allowed when needed.

## Consequences

- **Positive:** Focus on ERP core; fewer moving parts
- **Positive:** Posting stays a single Postgres transaction
- **Negative:** No durable async fan-out yet — acceptable
- **Negative:** Notification delivery is in-app / request-path only

## Revisit when

Partner webhooks, Telegram, email, or heavy report generation require reliable async delivery.
