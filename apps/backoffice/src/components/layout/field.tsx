'use client';

import type { ReactNode } from 'react';

type FieldProps = {
  label: string;
  /** Short always-visible helper under the control. */
  hint?: string;
  /** Floating tip near the label (hover / focus). */
  tooltip?: string;
  htmlFor?: string;
  required?: boolean;
  children: ReactNode;
};

/**
 * Standard form field: label on top, control below, optional hint/tooltip.
 * Prefer this over placeholder-only inputs across Backoffice.
 */
export function Field({ label, hint, tooltip, htmlFor, required, children }: FieldProps) {
  return (
    <div className="field">
      <div className="field__label-row">
        <label className="field__label" htmlFor={htmlFor}>
          <span>
            {label}
            {required ? (
              <span className="field__required" aria-hidden="true">
                {' '}
                *
              </span>
            ) : null}
          </span>
        </label>
        {tooltip ? (
          <span className="field-tip">
            <button type="button" className="field-tip__btn" aria-label={`Подсказка: ${label}`}>
              ?
            </button>
            <span className="field-tip__bubble" role="tooltip">
              {tooltip}
            </span>
          </span>
        ) : null}
      </div>
      <div className="field__control">{children}</div>
      {hint ? <p className="field__hint">{hint}</p> : null}
    </div>
  );
}

/** Read-only document number block — numbers are system-assigned. */
export function AutoNumberNote({
  label = 'Номер документа',
  value,
}: {
  label?: string;
  value?: string | null;
}) {
  return (
    <div className="field field--readonly">
      <div className="field__label-row">
        <span className="field__label">{label}</span>
      </div>
      <div className="field__readonly">
        {value?.trim() ? value : 'Присвоится автоматически после сохранения'}
      </div>
      <p className="field__hint">Номер выдаёт система. Изменить его нельзя.</p>
    </div>
  );
}
