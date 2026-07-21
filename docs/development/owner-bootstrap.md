# Owner bootstrap

```bash
# .env
ALLOW_OWNER_BOOTSTRAP=true
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
DATABASE_URL=...

# optional overrides
BOOTSTRAP_OWNER_LOGIN=director
BOOTSTRAP_OWNER_PASSWORD=...   # never logged
BOOTSTRAP_OWNER_DISPLAY_NAME=Director
BOOTSTRAP_ORGANIZATION_NAME="My Flowers"
BOOTSTRAP_STORE_NAME="Main Store"
BOOTSTRAP_STORE_CODE=MAIN
# or attach to existing org:
# BOOTSTRAP_ORGANIZATION_ID=<uuid>

pnpm bootstrap:owner
```

Requirements:

1. `ALLOW_OWNER_BOOTSTRAP=true` required
2. Rejected if users already exist (first system bootstrap) or org already has DIRECTOR
3. Creates Organization (optional), Store+Warehouse, User, Membership, system roles, DIRECTOR assignment, ALL_STORES, AuditLog
4. One DB transaction
5. Disable the flag in production after use
