'use client';

import type { ReactNode } from 'react';
import { Dialog } from '@/components/ui/dialog';

type SegmentedControlOption = { value: string; label: string };

type SegmentedControlProps = {
  options: SegmentedControlOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
};

export function SegmentedControl({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedControlProps) {
  return (
    <div className="segmented-control" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={
            option.value === value
              ? 'segmented-control__btn segmented-control__btn--active'
              : 'segmented-control__btn'
          }
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

type InlineAlertProps = {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  title?: string;
  children: ReactNode;
};

export function InlineAlert({ tone = 'info', title, children }: InlineAlertProps) {
  return (
    <div
      className={`inline-alert inline-alert--${tone}`}
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
    >
      {title ? <strong className="inline-alert__title">{title}</strong> : null}
      <div className="inline-alert__body">{children}</div>
    </div>
  );
}

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  destructive,
  busy,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      description={message}
      variant="alertdialog"
      footer={
        <>
          <button type="button" className="confirm-dialog__btn" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={
              destructive
                ? 'confirm-dialog__btn confirm-dialog__btn--danger'
                : 'confirm-dialog__btn confirm-dialog__btn--primary'
            }
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    />
  );
}
