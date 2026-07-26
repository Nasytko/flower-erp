'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  /** alertdialog blocks closing on backdrop click */
  variant?: 'dialog' | 'alertdialog';
  className?: string;
};

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = 'dialog',
  className,
}: DialogProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (open) {
      setVisible(true);
      return;
    }
    const timer = window.setTimeout(() => setVisible(false), 200);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => previous?.focus();
  }, [open]);

  if (!mounted || !visible) return null;

  const role = variant === 'alertdialog' ? 'alertdialog' : 'dialog';

  return createPortal(
    <div
      className={`overlay${open ? ' overlay--open' : ''}`}
      role="presentation"
      data-state={open ? 'open' : 'closed'}
    >
      <button
        type="button"
        className="overlay__backdrop"
        aria-label="Закрыть"
        onClick={variant === 'dialog' ? onClose : undefined}
        tabIndex={variant === 'alertdialog' ? -1 : 0}
      />
      <div
        ref={panelRef}
        className={`overlay__panel${className ? ` ${className}` : ''}`}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
      >
        <h2 id={titleId} className="overlay__title">
          {title}
        </h2>
        {description ? (
          <p id={descId} className="overlay__description">
            {description}
          </p>
        ) : null}
        {children}
        {footer ? <div className="overlay__footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
