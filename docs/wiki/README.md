# Wiki — Flower ERP

Практическое руководство по системе для директоров, флористов и разработчиков.

## Быстрый старт

| Раздел | Описание |
|--------|----------|
| [Установка и запуск](../development/local-setup.md) | Docker, миграции, `pnpm dev` |
| [Переменные окружения](../development/environment-variables.md) | API, auth, БД, proxy |
| [Первый директор](../development/owner-bootstrap.md) | Bootstrap организации и пользователя |

## Организация и доступ

| Раздел | Описание |
|--------|----------|
| [Пользователи и роли](./admin-users-and-stores.md) | Админка, роли, привязка флориста к магазину |
| [Identity и права](../domain/identity-and-access.md) | Модель membership, permissions, store scope |
| [Матрица прав](../security/permission-matrix.md) | Коды permissions по ролям |

## Магазин и операции

| Раздел | Описание |
|--------|----------|
| [Настройки магазина](./admin-users-and-stores.md#настройки-магазина) | Название, адрес, timezone |
| [Склад = контекст магазина](./store-operations.md#склад-и-остатки) | Автовыбор склада, без ручного picker |
| [Очередь заказов](./orders-workflow.md) | Подтверждение, резерв, фазы, дефicit |
| [Смена / workspace](../operations/florist-workflow.md) | Рабочий стол флориста |
| [Продажи](../domain/sales-flow.md) | Прямая продажа и продажа из заказа |
| [Приёмки и остатки](../domain/supply-flow.md) | Supply → inventory |
| [Доставка](../operations/delivery-workflow.md) | Board, карта, маршруты |

## Разработка и безопасность

| Раздел | Описание |
|--------|----------|
| [API Reference](../api/README.md) | REST endpoints, auth, коды ошибок |
| [Архитектура](../architecture/overview.md) | Modular monolith, модули |
| [Безопасность](../architecture/security.md) | JWT, cookies, guards |
| [Threat model](../security/threat-model.md) | Угрозы и mitigations |
| [Тестирование](../development/testing.md) | Unit, integration, e2e |
| [CI и зависимости](../development/dependency-updates.md) | Trivy, lint, migrate |

## Роли в системе

| Роль | Типичный доступ |
|------|-----------------|
| **Director** | Все магазины org, настройки, пользователи, финансы |
| **Florist** | Закреплённые магазины, смена, заказы, продажи |
| **Courier** | Доставки в своих магazinах |

## Частые вопросы

**Флорист не видит магазин** — проверьте роль и привязку «Выбранные магазины» в `/organizations/{id}/users`.

**«Нет склада» при создании документа** — API создаёт default warehouse автоматически; проверьте `ensure-default` или права `stores:create`.

**Ключ Яндекс.Карт** — настраивается в «Карты и навигация» (`organization:manage`). В API ключ не отдаётся при чтении; для карты доставок используется endpoint board/map с правом `delivery:read`.

**CI красный** — чаще всего lint (backoffice `--max-warnings=0`) или Trivy CVE; см. лог GitHub Actions.
