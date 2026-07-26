'use client';

import { useCallback, useState } from 'react';
import { formatApiErrorMessage } from '@/lib/format-api-error';
import { useToast } from '@/components/ui/toast';

type AsyncActionOptions = {
  successMessage?: string;
  errorFallback?: string;
  /** Keep inline error state in addition to toast */
  inlineError?: boolean;
};

export function useAsyncAction(options: AsyncActionOptions = {}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async <T,>(action: () => Promise<T>): Promise<T | null> => {
      setBusy(true);
      if (options.inlineError !== false) setError(null);
      try {
        const result = await action();
        if (options.successMessage) {
          toast.success(options.successMessage);
        }
        return result;
      } catch (err) {
        const message = formatApiErrorMessage(err, options.errorFallback ?? 'Не удалось выполнить действие');
        toast.error(message);
        if (options.inlineError !== false) setError(message);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [options.errorFallback, options.inlineError, options.successMessage, toast],
  );

  const clearError = useCallback(() => setError(null), []);

  return { run, busy, error, clearError, setError };
}
