# Backoffice responsive guidelines

Guidelines for the product shell shipped in `apps/backoffice`.

## Breakpoints (current)

| Range | Behavior |
| --- | --- |
| ≥ 360px | Supported mobile width; drawer navigation; page actions wrap |
| < 1024px | No fixed sidebar; hamburger opens drawer |
| ≥ 1024px | Fixed sidebar + header grid; menu button hidden |
| Wide desktop | Content capped by `--content-max-width` (1120px) |

There is no separate tablet breakpoint yet: tablets use the same drawer pattern as phones until 1024px.

## Layout rules

- Main column uses `min-width: 0` and `overflow-x: hidden` to avoid horizontal page scroll
- Page titles use `overflow-wrap: anywhere` and fluid `clamp` sizing
- Header placeholders collapse below 640px to keep the top bar usable
- Touch targets for menu/close controls are at least 40×40px
- Hover styles must not be the only way to understand or activate controls

## Navigation

- Desktop: landmark `aside` + `nav` labelled “Primary”
- Mobile: `role="dialog"` drawer, `aria-expanded` / `aria-controls` on the menu button, `aria-current="page"` on the active link
- Drawer closes on Escape, backdrop click, close button, or navigational link press
- Body scroll is locked while the drawer is open

## Page composition

Prefer:

1. `PageContainer`
2. `PageHeader` (with breadcrumbs)
3. One or more `Section` / `Card` blocks
4. Shared loading / error / empty states

Do not reintroduce fixed desktop-only sidebars inside feature pages.
