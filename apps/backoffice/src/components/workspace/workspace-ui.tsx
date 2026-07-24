'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';

type MetricCardProps = {
  label: string;
  value: number | string;
  hint?: string;
  href?: string;
  tone?: 'default' | 'warning' | 'danger' | 'success';
  tint?: 1 | 2 | 3 | 4;
};

export function MetricCard({
  label,
  value,
  hint,
  href,
  tone = 'default',
  tint = 1,
}: MetricCardProps) {
  const className = `metric-card metric-card--${tone} metric-card--tint-${tint}`;
  const content = (
    <>
      <span className="metric-card__label">{label}</span>
      <span className="metric-card__value">{value}</span>
      {hint ? <span className="metric-card__hint">{hint}</span> : null}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }
  return <div className={className}>{content}</div>;
}

type CountdownBadgeProps = {
  readyAt: string | null;
  /** Server clock ISO; countdown uses serverNow + client elapsed. */
  serverNow: string;
  clientCapturedAt: number;
};

function formatCountdown(ms: number): string {
  const abs = Math.abs(ms);
  const totalSec = Math.floor(abs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  const core = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  return ms < 0 ? `−${core}` : core;
}

export function CountdownBadge({ readyAt, serverNow, clientCapturedAt }: CountdownBadgeProps) {
  if (!readyAt) {
    return <span className="countdown-badge countdown-badge--muted">—</span>;
  }
  const serverMs = new Date(serverNow).getTime();
  const elapsed = Date.now() - clientCapturedAt;
  const nowMs = serverMs + elapsed;
  const delta = new Date(readyAt).getTime() - nowMs;
  const overdue = delta < 0;
  const soon = !overdue && delta <= 30 * 60_000;
  const tone = overdue ? 'danger' : soon ? 'warning' : 'default';
  return (
    <span
      className={`countdown-badge countdown-badge--${tone}`}
      title={overdue ? 'Overdue' : 'Time until ready'}
    >
      <span className="visually-hidden">{overdue ? 'Overdue by ' : 'Ready in '}</span>
      {formatCountdown(delta)}
    </span>
  );
}

type OrderCardProps = {
  number: string;
  status: string;
  customerName?: string | null;
  occasion?: string;
  urgency?: string;
  hasDeficit?: boolean;
  countdown?: ReactNode;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  href: string;
  primaryDisabled?: boolean;
};

export function OrderCard({
  number,
  status,
  customerName,
  occasion,
  urgency,
  hasDeficit,
  countdown,
  primaryActionLabel,
  onPrimaryAction,
  href,
  primaryDisabled,
}: OrderCardProps) {
  return (
    <article className="order-card">
      <div className="order-card__main">
        <Link href={href} className="order-card__title">
          {number}
        </Link>
        <div className="order-card__meta">
          <span className="status-badge status-badge--neutral">{status}</span>
          {urgency && urgency !== 'NORMAL' ? (
            <span className={`urgency-badge urgency-badge--${urgency.toLowerCase()}`}>
              {urgency}
            </span>
          ) : null}
          {hasDeficit ? (
            <span className="status-badge status-badge--warning">Shortage</span>
          ) : null}
          {countdown}
        </div>
        {(customerName || occasion) && (
          <p className="order-card__sub">
            {[customerName, occasion].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
      {primaryActionLabel && onPrimaryAction ? (
        <button
          type="button"
          className="order-card__action"
          disabled={primaryDisabled}
          onClick={onPrimaryAction}
        >
          {primaryActionLabel}
        </button>
      ) : (
        <Link href={href} className="order-card__action order-card__action--link">
          Open
        </Link>
      )}
    </article>
  );
}

type AttentionItemProps = {
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  reason: string;
  recommendedAction?: string;
  href?: string | null;
  ageMinutes?: number;
};

export function AttentionItem({
  severity,
  title,
  reason,
  recommendedAction,
  href,
  ageMinutes,
}: AttentionItemProps) {
  const body = (
    <>
      <div className="attention-item__head">
        <span className={`attention-item__severity attention-item__severity--${severity.toLowerCase()}`}>
          {severity}
        </span>
        <strong>{title}</strong>
        {ageMinutes != null ? (
          <span className="attention-item__age">{ageMinutes}m</span>
        ) : null}
      </div>
      <p className="attention-item__reason">{reason}</p>
      {recommendedAction ? (
        <p className="attention-item__action">{recommendedAction}</p>
      ) : null}
    </>
  );
  if (href) {
    return (
      <Link href={href} className="attention-item">
        {body}
      </Link>
    );
  }
  return <div className="attention-item">{body}</div>;
}

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

type StickyActionBarProps = {
  children: ReactNode;
};

export function StickyActionBar({ children }: StickyActionBarProps) {
  return <div className="sticky-action-bar">{children}</div>;
}

type InlineAlertProps = {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  title?: string;
  children: ReactNode;
};

export function InlineAlert({ tone = 'info', title, children }: InlineAlertProps) {
  return (
    <div className={`inline-alert inline-alert--${tone}`} role="status">
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
  if (!open) return null;
  return (
    <div className="confirm-dialog" role="presentation">
      <button type="button" className="confirm-dialog__backdrop" aria-label="Закрыть" onClick={onCancel} />
      <div
        className="confirm-dialog__panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
      >
        <h2 id="confirm-dialog-title">{title}</h2>
        <p id="confirm-dialog-desc">{message}</p>
        <div className="confirm-dialog__actions">
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
        </div>
      </div>
    </div>
  );
}
