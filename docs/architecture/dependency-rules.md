# Dependency Rules

**Status:** Accepted  
**Related:** [module-map.md](./module-map.md), [data-ownership.md](./data-ownership.md), [ADR-010](./adr/010-module-data-ownership.md)

## Goals

- Keep the modular monolith split-ready without microservices theatre.
- Prevent accidental coupling through a shared Prisma client used as a God Repository.
- Make direction of dependencies reviewable in PR.

## Direction of dependencies

Dependency arrows mean “may call application service / public port of”:

```
platform ──────────────────────────────────────────────┐
org-structure ←── master-data ←── catalog              │
       ↑              ↑                                │
       │         supply ──posts──► inventory ←─────── orders / sales
       │              │                ↑                 │
       │              └────────────────┼─────────────────┤
       │                               │                 │
       ├──────── delivery ←── orders ──┤                 │
       ├──────── payments ←── orders / sales             │
       ├──────── finance ←── sales / payments / expenses │
       ├──────── notifications ←── (many; event-driven)  │
       ├──────── analytics ←── (read ports only)         │
       └──────── audit ←── (write port from many) ───────┘
```

**Rules of thumb**

1. Lower-level topology and master data do not depend on documents.
2. Document modules may depend on `inventory` **only through posting ports**, never by updating balance tables themselves.
3. `analytics` depends inward (read); nothing operational depends on `analytics`.
4. `notifications` and `audit` are sinks; domain modules must not import their ORM models for joins in business queries when avoidable—use ports.

## Allowed dependency matrix (v1)

| From \ To | platform | org | master | catalog | supply | inventory | orders | sales | payments | delivery | finance | notif | analytics | audit |
|-----------|----------|-----|--------|---------|--------|-----------|--------|-------|----------|----------|---------|-------|-----------|-------|
| platform | — | R | | | | | | | | | | | | W |
| org-structure | | — | | | | | | | | | | | | W |
| master-data | | R | — | | | | | | | | | | | W |
| catalog | | R | R | — | | | | | | | | | | W |
| supply | | R | R | | — | P | | | | | | W | | W |
| inventory | | R | R | | | — | | | | | | W | | W |
| orders | R | R | R | R | | P | — | | C | C | C | W | | W |
| sales | R | R | R | R | | P | R | — | C | | C | W | | W |
| payments | | R | | | | | R | R | — | | | W | | W |
| delivery | R | R | | | | | R | | | — | | W | | W |
| finance | | R | R* | | | | | R* | R* | | — | W | | W |
| notifications | R | | | | | | | | | | | — | | |
| analytics | | R | R | R | R | R | R | R | R | R | R | | — | |
| audit | | | | | | | | | | | | | | — |

Legend: **R** = read via port; **P** = posting command port; **C** = create/link command port; **W** = write to that sink; blank = forbidden.

\* Finance reads operational facts only through **published read ports or projections**, not by importing other modules’ Prisma models.

## Forbidden patterns

1. **God Prisma access:** `PrismaService` injected into a module service with queries spanning foreign-owned tables.
2. **Cross-module joins in repositories** across ownership boundaries.
3. **analytics → command** on supply/inventory/orders/sales/finance.
4. **Controllers calling another module’s repository** directly.
5. **Circular document ownership** (e.g. inventory importing Supply entity to “fix up” headers).
6. **Hard delete APIs** for protected aggregates.
7. **Direct balance mutation** (`UPDATE balance SET qty`) outside posting services inside `inventory`.

## Enforcement (process)

Until automated tooling exists:

1. Each Nest module owns a `persistence/` (or `infra/`) folder; only that folder may import Prisma models mapped to owned tables.
2. Cross-module collaboration only via `*.module.ts` exports of application services / ports.
3. Code review checklist must reject foreign-table queries.
4. Prefer packaging ports in `apps/api/src/modules/<name>/application/ports`.

Automated ESLint/Nx/dependency-cruiser rules are recommended in a later phase (not required to start docs).

## Shared packages

| Package | May contain | Must not contain |
|---------|-------------|------------------|
| `@flower/types` or `@crm/types` | DTOs, enums, IDs | Prisma client usage |
| `@flower/shared` | Pure helpers | DB access |
| `@flower/database` | Prisma schema & generated client | Business posting rules |

Domain posting rules live in API modules, not in `packages/database`.
