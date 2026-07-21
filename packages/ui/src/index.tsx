import type { ButtonHTMLAttributes, InputHTMLAttributes, PropsWithChildren, CSSProperties } from 'react';

const variantStyles: Record<'primary' | 'secondary' | 'ghost', CSSProperties> = {
  primary: {
    background: 'var(--color-primary, #1f6b43)',
    color: 'var(--color-primary-foreground, #ffffff)',
    border: '1px solid transparent',
  },
  secondary: {
    background: 'var(--color-surface-muted, #e9eee9)',
    color: 'var(--color-foreground, #14231a)',
    border: '1px solid var(--color-border, #d5ded7)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--color-foreground, #14231a)',
    border: '1px solid var(--color-border, #d5ded7)',
  },
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
};

export function Button({ variant = 'primary', style, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      {...props}
      style={{
        ...variantStyles[variant],
        borderRadius: 'var(--radius-sm, 6px)',
        padding: '10px 14px',
        minHeight: 40,
        fontWeight: 600,
        fontSize: 'var(--text-sm, 0.875rem)',
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        opacity: props.disabled ? 0.65 : 1,
        transition:
          'background-color var(--motion-fast, 120ms) var(--ease-standard, ease), border-color var(--motion-fast, 120ms) var(--ease-standard, ease)',
        ...style,
      }}
    />
  );
}

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input(props: InputProps) {
  return (
    <input
      {...props}
      style={{
        width: '100%',
        border: '1px solid var(--color-border, #d5ded7)',
        borderRadius: 'var(--radius-sm, 6px)',
        padding: '10px 12px',
        minHeight: 40,
        fontSize: 'var(--text-sm, 0.875rem)',
        background: 'var(--color-surface, #ffffff)',
        color: 'var(--color-foreground, #14231a)',
        ...props.style,
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
        border: '1px solid var(--color-border, #d5ded7)',
        borderRadius: 'var(--radius-md, 10px)',
        padding: 'var(--space-4, 16px)',
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
          }}
        >
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}
