# Пользователи, роли и настройки магазина

## Админка пользователей

Путь: `/organizations/{organizationId}/users`

Требуется permission `users:read`; управление — `users:manage` и `roles:manage`.

### Что видно в списке

- Логин, имя, e-mail, статус (активен / заблокирован / в архиве)
- Роль: Director, Florist, Courier (одна системная роль)
- Привязка к магазинам
- Последний вход, IP последней сессии, счётчик неудачных попыток входа

### Создание пользователя

1. Логин (латиница, 3–64 символа)
2. Временный пароль (≥ 10 символов)
3. Отображаемое имя
4. E-mail (опционально)

При первом входе пользователь может сменить пароль (`mustChangePassword`).

### Назначение роли

Выберите роль в dropdown. Роли **заменяются** целиком (не добавляются).

| Роль | Магазины |
|------|----------|
| Director | «Все магазины» или выбранные |
| Florist | **Обязательно** ≥ 1 выбранный магазин |
| Courier | По политике org (обычно выбранные) |

API отклонит назначение FLORIST без `SELECTED_STORES` + storeIds (`FLORIST_REQUIRES_STORE`).

### Действия над пользователем

| Действие | API | Permission |
|----------|-----|------------|
| Заблокировать | `POST .../users/{id}/block` | `users:manage` |
| Разблокировать | `POST .../users/{id}/unblock` | `users:manage` |
| В архив | `POST .../users/{id}/archive` | `users:manage` |
| Сброс пароля | `POST .../users/{id}/reset-password` | `users:manage` |
| Роли | `POST .../users/{id}/roles` | `roles:manage` |
| Магазины | `POST .../users/{id}/store-access` | `roles:manage` |

Нельзя снять последнего директора организации (`LAST_DIRECTOR`).

## Настройки магазина

Путь: `/organizations/{organizationId}/stores/{storeId}/settings`

Permission: `stores:create` (директор).

Редактируемые поля:

- **Название** — отображается в nav и документах
- **Город** — подставляется в адрес доставки по умолчанию
- **Адрес** — визитка магазина
- **Часовой пояс** — IANA, напр. `Europe/Moscow`

Код магазина (`MSK-01`) задаётся при создании и не меняется через UI.

API: `PATCH /organizations/{orgId}/stores/{storeId}`

## Интеграции (карты)

Путь: `/organizations/{organizationId}/integrations`

Permission: `organization:manage` (только директор).

- API-ключ Яндекс.Карт **не возвращается** при GET — только флаг `yandexMapsApiKeyConfigured`
- При сохранении оставьте поле ключа пустым, чтобы не менять существующий ключ
- Карта доставок получает ключ через delivery API (`delivery:read`)
