import { SidebarNav } from './sidebar-nav';

export function DesktopSidebar() {
  return (
    <aside className="shell__sidebar" aria-label="Application sidebar">
      <div className="shell__brand">Flower ERP</div>
      <SidebarNav />
    </aside>
  );
}
