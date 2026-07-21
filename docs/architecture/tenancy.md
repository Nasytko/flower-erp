# Tenancy and Site Scope

**Status:** Accepted  
**Related:** [ADR-004](./adr/004-organization-store-warehouse.md), [security.md](./security.md), [../domain/organization-flow.md](../domain/organization-flow.md)

## Hierarchy

```
Organization          ← tenant boundary
└── Store             ← commercial / operational shop
    └── Warehouse     ← stock-keeping site (default: one per store on create)
```

`Location` (bin/zone) is **not** implemented. Schema allows multiple warehouses per store later.

## Identifier rules

| Entity class | Required ids |
|--------------|--------------|
| Organization | `id` (is the tenant) |
| Store | `organizationId` |
| Warehouse | `organizationId` + `storeId` |
| AuditLog | `organizationId` (+ optional `storeId`) |
| Future transactional docs | `organizationId` (+ store/warehouse as applicable) |

## Default warehouse

`CreateStoreWithDefaultWarehouse` (single transaction):

1. Validate organization is `ACTIVE`
2. Create Store
3. Create Warehouse with `isDefault = true`, code `MAIN`
4. Append AuditLog for Store and Warehouse
5. Commit

PostgreSQL partial unique index `warehouses_one_default_per_store_uidx` guarantees at most one default warehouse per store.

## Isolation rules

1. JWT AuthContext carries `organizationId`, membership, permissions, store scope.
2. Path `organizationId` must match AuthContext membership organization.
3. Store/Warehouse lookups always filter by parent ids (cannot fetch foreign org resources by UUID alone).
4. StoreScopeGuard rejects `storeId` outside `ALL_STORES` / selected list (including DIRECTOR without ALL_STORES).
5. `RequestContext.actorId` / `organizationId` / `auth` populated by JwtAuthGuard for AuditLog.

Auth is implemented — see [security.md](./security.md) and [../domain/identity-and-access.md](../domain/identity-and-access.md).

## Archive vs delete

- Soft archive via status (`ARCHIVED`)
- No physical delete of organizations, stores, warehouses, or audit logs

## Forbidden

- Inferring organization only from `storeId` without storing `organizationId`
- Hard-deleting sites with history
- Creating stores under non-ACTIVE organizations
