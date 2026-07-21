# Domain Flow: Organization / Store / Warehouse

**Status:** Accepted for Phase 1 foundation slice  
**Modules:** `organization` (owns orgs/stores/warehouses), platform audit via `AuditPort`

## Responsibility

Provide the tenant and site hierarchy used by all later documents:

`Organization → Store → Warehouse (default)`

## Boundaries

- No Location / bin hierarchy.
- No inventory balances.
- No CRM / customers.
- No auth yet (`actorId` nullable; RequestContext ready for AuthContext).
- Audit persistence owned by platform/audit adapter — organization module calls `AuditPort` only.

## Main entities

| Entity | Notes |
|--------|-------|
| Organization | Tenant root; statuses ACTIVE / SUSPENDED / ARCHIVED |
| Store | Belongs to organization; unique `code` per org |
| Warehouse | Belongs to org+store; type STORE; one default per store (DB partial unique index) |
| AuditLog | Append-only; written in same transaction as mutations |

Physical delete of Organization/Store/Warehouse/AuditLog is forbidden.

## Default warehouse invariant

Creating a Store **must** create exactly one default Warehouse (`isDefault=true`, code `MAIN`) in the **same UnitOfWork** as:

1. Store insert
2. Warehouse insert
3. AuditLog for store
4. AuditLog for warehouse

Partial unique index `warehouses_one_default_per_store_uidx` enforces at most one default per store at PostgreSQL level.

## Archive semantics

- Archive sets status to `ARCHIVED`.
- Rows remain; no hard delete.
- Archived organizations cannot create new stores.
- Re-activation is out of scope for this slice.

## Audit semantics

Every create/archive of Organization/Store (and create of Warehouse) appends AuditLog with:

- `organizationId`, optional `storeId`
- `actorId` null until auth
- `requestId` from RequestContext
- before/after snapshots where applicable

Audit must commit with the business change or roll back together.

## Commands

- `CreateOrganization`
- `CreateStoreWithDefaultWarehouse`
- `GetOrganization` / `ListOrganizations`
- `GetStore` / `ListStoresByOrganization`
- `GetWarehouse` / `ListWarehousesByStore`
- `ArchiveOrganization` / `ArchiveStore`

## Events (in-process, future consumers)

- `OrganizationCreated`, `OrganizationArchived`
- `StoreCreated`, `StoreArchived`
- `WarehouseCreated`

## Allowed dependencies

- `AuditPort`, `UnitOfWork`, `ClockPort`
- org module repositories (owned tables only)

## Forbidden dependencies

- Direct Prisma access to `audit_logs` from organization application code
- Inventory / supply / sales modules
- Hard delete APIs

## Future

- AuthContext populates `actorId` / JWT `organizationId` without rewriting use-case signatures
- Additional non-default warehouses per store (API later; schema already allows)
- Location deferred

## v1 vs deferred

| In this slice | Deferred |
|---------------|----------|
| Org/Store/default Warehouse CRUD-less commands | Multi-warehouse UX |
| Archive | Suspend workflows, reactivation |
| Audit append | Audit query UI |
| Path tenancy checks | JWT tenancy enforcement |
