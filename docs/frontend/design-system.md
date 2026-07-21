# Backoffice design system

This document describes the design foundation currently used by `apps/backoffice`.

## Styling stack

- Next.js App Router + global CSS
- Design tokens as CSS custom properties in `apps/backoffice/src/styles/tokens.css`
- Shared primitives in `@flower/ui` (`Button`, `Input`, `Card`) consume the same CSS variables with hex fallbacks
- No Tailwind, shadcn/ui, Radix, or Framer Motion in this stage

## Tokens

Tokens live under `:root` and cover:

- Surfaces: `--color-background`, `--color-surface`, `--color-surface-muted`, sidebar colors
- Text / borders: `--color-foreground`, `--color-muted`, `--color-border*`
- Brand: `--color-primary`, hover/active, foreground, soft accent
- Semantic: destructive, warning, success, info (+ soft backgrounds)
- Elevation: `--shadow-sm`, `--shadow-md`
- Typography scale and weights
- Spacing scale (`--space-1` … `--space-10`)
- Radii, layout widths (`--sidebar-width`, `--header-height`, `--content-max-width`)
- Motion durations and easing (`--motion-*`, `--ease-standard`)

Prefer tokens over raw hex in page and shell CSS. Dark mode is not implemented; token naming does not block a future theme layer.

## Future extension: FlowerItemDetails

`FlowerItemDetails` is a future item-detail extension point for flower-specific
attributes (for example stem length, color, variety, and origin). It must remain
separate from the core `Item` form until those attributes have concrete workflow
and reporting requirements; purchasing and inventory depend only on the shared
item, unit, and inventory-policy fields.

## Layout primitives

Implemented in `apps/backoffice/src/components/layout/`:

| Component | Role |
| --- | --- |
| `PageContainer` | Constrained main column padding |
| `PageHeader` | Title, description, breadcrumbs, actions |
| `Breadcrumbs` | Route ancestry |
| `Section` | One-purpose content block |
| `EmptyState` / `ErrorState` / `LoadingState` | Shared content states |
| `StatusBadge` | Compact status chip |

Workspace presentational helpers live in `apps/backoffice/src/components/workspace/` (MetricCard, OrderCard, CountdownBadge, AttentionItem, CommandPalette, StickyActionBar). They consume the same tokens; business rules stay on the API.

Command Palette indexes the same `PRIMARY_NAV` as the sidebar (plus permission-filtered action shortcuts) — not a second navigation config.

## Application shell

`AppShell` (`src/components/shell/`) provides:

- desktop sticky sidebar
- top header with menu control, org-switcher placeholder, account placeholder
- mobile navigation drawer with Escape, focus trap, and body scroll lock
- primary nav for Dashboard and Organizations

Placeholders are visual slots only. They do not simulate auth or invent organizations.

## Motion

Only short CSS transitions for drawer, nav links, and controls. `prefers-reduced-motion: reduce` zeroes `--motion-*` durations and disables skeleton shimmer.
