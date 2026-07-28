import type { ReactNode } from 'react';

type DocRefProps = {
  children: ReactNode;
  /** Hide visually but keep for screen readers / copy. */
  hidden?: boolean;
  className?: string;
  title?: string;
};

/** Small secondary document number (order, sale, payment…). */
export function DocRef({ children, hidden, className, title }: DocRefProps) {
  if (hidden) return null;
  return (
    <span
      className={`doc-ref${className ? ` ${className}` : ''}`}
      title={title ?? String(children)}
    >
      {children}
    </span>
  );
}
