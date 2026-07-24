import { t } from '@/i18n/ru';
import { formatApiError } from '@/lib/format-api-error';

type StateProps = {
  title?: string;
  message: string;
  details?: string[];
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

export function ErrorState({ title = t('somethingWrong'), message, details }: StateProps) {
  return (
    <div className="state-block state-block--error" role="alert">
      <strong style={{ display: 'block', marginBottom: 4 }}>{title}</strong>
      <div>{message}</div>
      {details && details.length > 0 ? (
        <ul className="state-block__details">
          {details.map((row) => (
            <li key={row}>{row}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Convenience: pass a caught error directly. */
export function ApiErrorState({
  error,
  fallback = 'Не удалось выполнить действие',
}: {
  error: unknown;
  fallback?: string;
}) {
  const formatted = formatApiError(error, fallback);
  return (
    <ErrorState
      title={formatted.title}
      message={formatted.message}
      details={formatted.details}
    />
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
