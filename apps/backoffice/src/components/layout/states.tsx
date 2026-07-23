import { t } from '@/i18n/ru';

type StateProps = {
  title?: string;
  message: string;
};

export function EmptyState({ title = t('nothingHere'), message }: StateProps) {
  return (
    <div className="state-block state-block--empty" role="status">
      <strong style={{ display: 'block', marginBottom: 4, color: 'var(--color-foreground)' }}>
        {title}
      </strong>
      {message}
    </div>
  );
}

export function ErrorState({ title = t('somethingWrong'), message }: StateProps) {
  return (
    <div className="state-block state-block--error" role="alert">
      <strong style={{ display: 'block', marginBottom: 4 }}>{title}</strong>
      {message}
    </div>
  );
}

export function LoadingState({ message = t('loading') }: { message?: string }) {
  return (
    <div className="state-block" role="status" aria-live="polite">
      <div className="skeleton" aria-hidden="true">
        <div className="skeleton__line" style={{ width: '40%' }} />
        <div className="skeleton__line" style={{ width: '72%' }} />
        <div className="skeleton__line" style={{ width: '55%' }} />
      </div>
      <span className="visually-hidden">{message}</span>
    </div>
  );
}
