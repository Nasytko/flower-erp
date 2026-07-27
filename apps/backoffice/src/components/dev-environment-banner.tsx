import type { AppEnvironment } from '@/lib/app-environment';

type DevEnvironmentBannerProps = {
  environment: AppEnvironment;
};

export function DevEnvironmentBanner({ environment }: DevEnvironmentBannerProps) {
  if (!environment.showBanner) return null;

  return (
    <div
      className={`dev-banner dev-banner--${environment.mode}`}
      role="status"
      aria-live="polite"
    >
      <div className="dev-banner__inner">
        <span className="dev-banner__badge">{environment.badge}</span>
        <span className="dev-banner__title">{environment.title}</span>
        <span className="dev-banner__hint">{environment.hint}</span>
        <code className="dev-banner__api" title="API base URL">
          {environment.apiBaseUrl}
        </code>
      </div>
    </div>
  );
}

export function DevEnvironmentBadge({ environment }: DevEnvironmentBannerProps) {
  if (!environment.showBanner) return null;

  return (
    <span
      className={`dev-badge dev-badge--${environment.mode}`}
      title={`${environment.title} · ${environment.apiBaseUrl}`}
    >
      {environment.badge}
    </span>
  );
}
