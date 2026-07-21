# Identity and Access

**Status:** Implemented (v1)  
**Related:** [security.md](../architecture/security.md), [tenancy.md](../architecture/tenancy.md), [owner-bootstrap.md](../development/owner-bootstrap.md)

## Model

- **User** — personal account (login, Argon2id password hash, status)
- **OrganizationMembership** — tenant access; store scope mode `ALL_STORES` | `SELECTED_STORES`
- **Role / Permission / RolePermission / MembershipRole** — permission-based authorization (`module:action`)
- **UserStoreAccess** — selected stores when mode is `SELECTED_STORES`
- **Session** — rotating refresh token (hashed), familyId for reuse detection

## Rules

1. Endpoints check **permissions**, never `role === 'DIRECTOR'`.
2. Path `organizationId` must match active AuthContext membership.
3. Store scope applies to DIRECTOR as well unless `ALL_STORES`.
4. Password hashes and refresh tokens never appear in API responses or AuditLog payloads.
5. Users are soft-statused (`BLOCKED` / `ARCHIVED`); no physical delete.

## System roles

| Role | Purpose |
|------|---------|
| DIRECTOR | Full access to current modules |
| FLORIST | Operational read/create; no users/roles/audit/cost/reverse |

See `@flower/permissions` registry for codes.
