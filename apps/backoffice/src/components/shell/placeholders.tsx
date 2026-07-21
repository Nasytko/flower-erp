/**
 * Visual placeholder only — auth/session not wired.
 * Must not imply a working account menu.
 */
export function UserMenuPlaceholder() {
  return (
    <span className="shell__placeholder" aria-disabled="true" title="Authentication is not configured yet">
      Account · soon
    </span>
  );
}

/**
 * Visual slot for a future organization switcher.
 * Does not hardcode fake orgs and does not invent multi-tenant selection logic.
 */
export function OrganizationSwitcherPlaceholder() {
  return (
    <span
      className="shell__placeholder"
      aria-disabled="true"
      title="Organization switcher will use live org context when ready"
    >
      Org context
    </span>
  );
}
