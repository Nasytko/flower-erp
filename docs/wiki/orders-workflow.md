# Очередь заказов

## Жизненный цикл (упрощённо)

```
DRAFT → CONFIRMED → RESERVED / PARTIALLY_RESERVED → IN_PREPARATION → READY → (Sale) → COMPLETED
```

## Действия в backoffice

| Статус | Действие | Permission |
|--------|----------|------------|
| DRAFT | Подтвердить заказ | `orders:confirm` |
| CONFIRMED | Повторить резерв | `orders:reserve` |
| PARTIALLY_RESERVED + deficit | Повторить резерв | `orders:reserve` |
| RESERVED / PARTIALLY_RESERVED | Взять в работу (claim → start) | workspace / orders |
| IN_PREPARATION | Отметить готовым | `orders:prepare` |
| READY | Создать продажу | `sales:create` |

## Фильтры очереди (`/orders?phase=`)

| phase | Смысл |
|-------|-------|
| `NEW` | Подтверждённые, без назначения |
| `IN_WORK` | Собираются |
| `READY` | Готовы к выдаче |
| `HANDED_OFF` | Переданы (включая доставленные) |
| `HANDED_OFF_TODAY` | Переданы сегодня |

Фильтрация выполняется **на сервере** (`order-list-phase-filter`).

## Workspace primary action

На смене (`/home`, work-order):

- `CONFIRMED` → **RESERVE**
- `PARTIALLY_RESERVED` + deficit → **RESERVE**
- `PARTIALLY_RESERVED` без deficit + назначен → **START_PREPARATION**
- `RESERVED` + назначен → **START_PREPARATION**

Подробнее: [order-preparation-workflow](../operations/order-preparation-workflow.md), [order-flow](../domain/order-flow.md).
