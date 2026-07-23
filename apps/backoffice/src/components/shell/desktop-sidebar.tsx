import { t } from '@/i18n/ru';
import { SidebarNav } from './sidebar-nav';

export function DesktopSidebar() {
  return (
    <aside className="shell__sidebar" aria-label={t('backoffice')}>
      <div className="shell__brand">{t('brand')}</div>
      <SidebarNav />
    </aside>
  );
}
