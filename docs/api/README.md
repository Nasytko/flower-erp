# API Reference — Flower ERP

Base URL: `/api/v1` (например `http://localhost:3001/api/v1`).

## Аутентификация

| Механизм | Описание |
|----------|----------|
| Access token | JWT в заголовке `Authorization: Bearer {token}` |
| Refresh token | HttpOnly cookie `refresh_token`, path `/api/v1/auth/refresh` |
| Org context | JWT содержит `oid` (organizationId); URL `:organizationId` должен совпадать |

### Auth endpoints

| Method | Path | Описание |
|--------|------|----------|
| POST | `/auth/login` | Логин + role challenge |
| POST | `/auth/refresh` | Обновление access token (cookie) |
| POST | `/auth/logout` | Выход, revoke session |
| POST | `/auth/change-password` | Смена пароля (revoke других сессий) |
| GET | `/auth/me` | Текущий профиль и permissions |

Swagger (если `SWAGGER_ENABLED=true`): `/docs`

## Организация

Prefix: `/organizations/{organizationId}`

| Method | Path | Permission | Описание |
|--------|------|------------|----------|
| GET | `/organizations/{id}` | `organization:read` | Профиль org |
| GET | `/organizations/{id}/stores` | `stores:read` | Список магазинов (filtered by store scope) |
| POST | `/organizations/{id}/stores` | `stores:create` | Создать магазин + default warehouse |
| GET | `/organizations/{id}/stores/{storeId}` | `stores:read` | Карточка магазина |
| PATCH | `/organizations/{id}/stores/{storeId}` | `stores:create` | Обновить name/address/city/timezone |
| POST | `/organizations/{id}/stores/{storeId}/archive` | `stores:archive` | Архивировать |
| GET | `/organizations/{id}/integration-settings` | `organization:manage` | Карты (ключ redacted) |
| POST | `/organizations/{id}/integration-settings` | `organization:manage` | Сохранить интеграции |

## Пользователи и роли

| Method | Path | Permission | Описание |
|--------|------|------------|----------|
| GET | `/organizations/{id}/users` | `users:read` | Список с roles, stores, session IP |
| POST | `/organizations/{id}/users` | `users:manage` | Создать пользователя |
| GET | `/organizations/{id}/users/{userId}` | `users:read` | Карточка |
| POST | `/organizations/{id}/users/{userId}/block` | `users:manage` | Блокировка |
| POST | `/organizations/{id}/users/{userId}/unblock` | `users:manage` | Разблокировка |
| POST | `/organizations/{id}/users/{userId}/archive` | `users:manage` | Архив |
| POST | `/organizations/{id}/users/{userId}/reset-password` | `users:manage` | Сброс пароля |
| POST | `/organizations/{id}/users/{userId}/roles` | `roles:manage` | Заменить роли `{ roleCodes: [] }` |
| POST | `/organizations/{id}/users/{userId}/store-access` | `roles:manage` | `{ mode, storeIds? }` |
| GET | `/organizations/{id}/roles` | `roles:read` | Системные роли org |

## Store-scoped operations

Prefix: `/organizations/{orgId}/stores/{storeId}`

### Orders

| Method | Path | Permission |
|--------|------|------------|
| GET | `/orders` | `orders:read` |
| POST | `/orders` | `orders:create` |
| GET | `/orders/{orderId}` | `orders:read` |
| POST | `/orders/{orderId}/actions` | varies (`confirm`, `reserve`, …) |

Query `?phase=` — серверный фильтр очереди.

### Sales

| Method | Path | Permission |
|--------|------|------------|
| GET/POST | `/sales` | `sales:read` / `sales:create` |
| POST | `/sales/{id}/complete` | `sales:complete` |

`warehouseId` опционален — резолвится из магазина.

### Supply

| Method | Path | Permission |
|--------|------|------------|
| GET/POST | `/supplies` | `supplies:read` / `supplies:create` |

### Inventory (warehouse in path)

Prefix: `.../stores/{storeId}/warehouses/{warehouseId}`

| Method | Path | Permission |
|--------|------|------------|
| GET | `/inventory/balances` | `inventory:read` |
| GET | `/inventory/batches` | `inventory:read` |

### Write-offs, transfers, counts

| Resource | Prefix |
|----------|--------|
| Write-offs | `.../write-offs` |
| Transfers | `.../transfers` |
| Inventory counts | `.../inventory-counts` |

### Workspace / analytics

| Method | Path | Permission |
|--------|------|------------|
| GET | `/workspace/today` | `workspace:read` |
| GET | `/operations/overview` | `operations:read` |

### Delivery

| Method | Path | Permission |
|--------|------|------------|
| GET | `/deliveries/board` | `delivery:read` |
| GET | `/deliveries/map` | `delivery:read` (возвращает mapConfig с API key для виджета) |

### Payments

Prefix: `.../stores/{storeId}` — payments, payment-methods, cash-accounts.

## Master data

Prefix: `/organizations/{orgId}` — items, categories, units, policies, suppliers.

## Audit

| Method | Path | Permission |
|--------|------|------------|
| GET | `/organizations/{id}/audit` | `audit:read` |

## Health

| Method | Path | Auth |
|--------|------|------|
| GET | `/health/live` | Public |
| GET | `/health/ready` | Public |

## Коды ошибок (примеры)

| code | HTTP | Смысл |
|------|------|-------|
| `UNAUTHENTICATED` | 401 | Нет/просрочен token |
| `FORBIDDEN` | 403 | Нет permission |
| `TENANT_MISMATCH` | 403 | organizationId в URL ≠ JWT |
| `STORE_ACCESS_DENIED` | 403 | Магазин вне scope |
| `FLORIST_REQUIRES_STORE` | 400 | Флорист без магазина |
| `LAST_DIRECTOR` | 400 | Сняли последнего директора |
| `INVALID_ROLE` | 400 | Неизвестный role code |

## Клиент

TypeScript client: `@flower/api-client` (`packages/api-client`).

Backoffice: `getApiClient()` с `credentials: 'include'`.

## Связанные документы

- [API guidelines](../architecture/api-guidelines.md)
- [Identity domain](../domain/identity-and-access.md)
- [Permission matrix](../security/permission-matrix.md)
- [Wiki](../wiki/README.md)
