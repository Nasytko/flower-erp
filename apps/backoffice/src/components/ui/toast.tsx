'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export type ToastInput = {
  tone?: ToastTone;
  title?: string;
  message: string;
  durationMs?: number;
};

type ToastItem = ToastInput & {
  id: string;
  tone: ToastTone;
  exiting: boolean;
};

type ToastContextValue = {
  push: (input: ToastInput) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
  warning: (message: string, title?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function toneTitle(tone: ToastTone): string | undefined {
  if (tone === 'success') return 'Готово';
  if (tone === 'danger') return 'Ошибка';
  if (tone === 'warning') return 'Внимание';
  return undefined;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, exiting: true } : item)),
    );
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 180);
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      const id = crypto.randomUUID();
      const tone = input.tone ?? 'info';
      const durationMs = input.durationMs ?? (tone === 'danger' ? 7000 : 4500);
      setItems((current) => [
        ...current,
        {
          id,
          tone,
          title: input.title ?? toneTitle(tone),
          message: input.message,
          durationMs,
          exiting: false,
        },
      ]);
      const timer = window.setTimeout(() => dismiss(id), durationMs);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) clearTimeout(timer);
      timers.current.clear();
    },
    [],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      push,
      success: (message, title) => push({ tone: 'success', message, title }),
      error: (message, title) => push({ tone: 'danger', message, title }),
      info: (message, title) => push({ tone: 'info', message, title }),
      warning: (message, title) => push({ tone: 'warning', message, title }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-relevant="additions">
        {items.map((item) => (
          <div
            key={item.id}
            className={`toast toast--${item.tone}${item.exiting ? ' toast--exit' : ''}`}
            role={item.tone === 'danger' || item.tone === 'warning' ? 'alert' : 'status'}
          >
            <div className="toast__content">
              {item.title ? <strong className="toast__title">{item.title}</strong> : null}
              <p className="toast__message">{item.message}</p>
            </div>
            <button
              type="button"
              className="toast__close"
              aria-label="Закрыть"
              onClick={() => dismiss(item.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}
