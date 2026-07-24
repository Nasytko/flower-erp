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

/** Labeled control wrapper so forms are understandable without placeholder-only UX. */
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
            <button
              type="button"
              className="field-tip__btn"
              aria-label={`Подсказка: ${label}`}
            >
              ?
            </button>
            <span className="field-tip__bubble" role="tooltip">
              {tooltip}
            </span>
          </span>
        ) : null}
      </div>
      {children}
      {hint ? <p className="field__hint">{hint}</p> : null}
    </div>
  );
}
