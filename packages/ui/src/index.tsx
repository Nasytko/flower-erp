import type { ButtonHTMLAttributes, InputHTMLAttributes, PropsWithChildren, CSSProperties } from 'react';

const variantStyles: Record<'primary' | 'secondary' | 'ghost', CSSProperties> = {
  primary: {
    background: 'var(--color-primary, #1a7a45)',
    color: 'var(--color-primary-foreground, #ffffff)',
    border: '1px solid transparent',
  },
  secondary: {
    background: 'var(--color-surface-muted, #e4ebe5)',
    color: 'var(--color-foreground, #0f1f16)',
    border: '1px solid var(--color-border, #d0dbd3)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--color-foreground, #0f1f16)',
    border: '1px solid var(--color-border, #d0dbd3)',
  },
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
};

export function Button({ variant = 'primary', style, type = 'button', onFocus, onBlur, ...props }: ButtonProps) {
  return (
    <button
      type={type}
      {...props}
      onFocus={(event) => {
        event.currentTarget.style.outline = '2px solid var(--color-focus-ring, #2d8a56)';
        event.currentTarget.style.outlineOffset = '2px';
        onFocus?.(event);
      }}
      onBlur={(event) => {
        event.currentTarget.style.outline = '';
        event.currentTarget.style.outlineOffset = '';
        onBlur?.(event);
      }}
      style={{
        ...variantStyles[variant],
        borderRadius: 'var(--radius-md, 18px)',
        padding: '12px 18px',
        minHeight: 44,
        fontWeight: 600,
        fontSize: 'var(--text-sm, 0.875rem)',
        fontFamily: 'inherit',
        letterSpacing: '-0.01em',
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        opacity: props.disabled ? 0.65 : 1,
        boxShadow: variant === 'primary' ? 'var(--shadow-sm, none)' : undefined,
        transition:
          'background-color var(--motion-fast, 120ms) var(--ease-standard, ease), border-color var(--motion-fast, 120ms) var(--ease-standard, ease), box-shadow var(--motion-fast, 120ms) var(--ease-standard, ease)',
        ...style,
      }}
    />
  );
}

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ onFocus, onBlur, style, ...props }: InputProps) {
  return (
    <input
      {...props}
      onFocus={(event) => {
        event.currentTarget.style.borderColor = 'var(--color-focus-ring, #2d8a56)';
        event.currentTarget.style.boxShadow =
          '0 0 0 3px color-mix(in srgb, var(--color-focus-ring, #2d8a56) 25%, transparent)';
        event.currentTarget.style.outline = 'none';
        onFocus?.(event);
      }}
      onBlur={(event) => {
        event.currentTarget.style.borderColor = '';
        event.currentTarget.style.boxShadow = '';
        onBlur?.(event);
      }}
      style={{
        width: '100%',
        boxSizing: 'border-box',
        border: '1px solid var(--color-border, #d0dbd3)',
        borderRadius: 'var(--radius-md, 18px)',
        padding: '12px 14px',
        minHeight: 44,
        fontSize: 'var(--text-sm, 0.875rem)',
        fontFamily: 'inherit',
        background: 'var(--color-surface, #ffffff)',
        color: 'var(--color-foreground, #0f1f16)',
        transition:
          'border-color var(--motion-fast, 120ms) var(--ease-standard, ease), box-shadow var(--motion-fast, 120ms) var(--ease-standard, ease)',
        ...style,
      }}
    />
  );
}

export type CardProps = PropsWithChildren<{
  title?: string;
}>;

export function Card({ title, children }: CardProps) {
  return (
    <section
      style={{
        border: '1px solid var(--color-border, #d0dbd3)',
        borderRadius: 'var(--radius-lg, 24px)',
        padding: 'var(--space-5, 1.25rem)',
        background: 'var(--color-surface, #ffffff)',
        boxShadow: 'var(--shadow-sm, none)',
        minWidth: 0,
      }}
    >
      {title ? (
        <h2
          style={{
            margin: '0 0 12px',
            fontSize: 'var(--text-md, 1rem)',
            fontWeight: 650,
            letterSpacing: '-0.015em',
          }}
        >
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}
